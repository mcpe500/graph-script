import { boundsFromNodesAndEdges } from './flow-layout-bounds';
import { buildEdges as buildGenericEdges } from './flow-layout-routing';
import { createNode, measureNodes } from './flow-layout-measure';
import {
  FlowEdgeDecl,
  FlowNodeDecl,
  LayoutCandidate,
  LayoutEdge,
  LayoutNode,
  NodeBox,
  ResolvedFlowOptions,
} from './flow-types';

interface DecisionPlan {
  successors: string[];
  joinId?: string;
  primarySuccessor?: string;
  loopBodySuccessor?: string;
  exitSuccessors: string[];
  isLoopHeader: boolean;
}

interface FlowAnalysis {
  startId: string;
  adjacency: Map<string, string[]>;
  reverseAdjacency: Map<string, string[]>;
  forwardAdjacency: Map<string, string[]>;
  backEdgeKeys: Set<string>;
  decisionPlans: Map<string, DecisionPlan>;
}

interface GridPlacement {
  row: number;
  col: number;
}

interface AlgorithmicVariant {
  id: 'landscape_compact' | 'balanced';
  verticalGapScale: number;
  horizontalGapScale: number;
  sideBranchRowOffset: number;
  scoreBias: number;
}

export function buildAlgorithmicCandidate(
  orderedNodeIds: string[],
  nodeById: Map<string, FlowNodeDecl>,
  edges: FlowEdgeDecl[],
  options: ResolvedFlowOptions,
): LayoutCandidate | null {
  const nodes = orderedNodeIds
    .map((id) => nodeById.get(id))
    .filter((node): node is FlowNodeDecl => !!node);
  if (!nodes.length) return null;

  const analysis = analyzeFlow(nodes, edges);
  if (!analysis || !hasAlgorithmicStructure(nodes, analysis.backEdgeKeys, analysis.decisionPlans)) return null;

  const variants = resolveAlgorithmicVariants(options.fit);
  const candidates = variants
    .map((variant) => buildVariantCandidate(variant, orderedNodeIds, nodeById, edges, analysis, options))
    .filter((candidate): candidate is LayoutCandidate => !!candidate);
  if (!candidates.length) return null;
  return [...candidates].sort((left, right) => left.score - right.score)[0];
}

function hasAlgorithmicStructure(
  nodes: FlowNodeDecl[],
  backEdgeKeys: Set<string>,
  decisionPlans: Map<string, DecisionPlan>,
): boolean {
  const decisionCount = nodes.filter((node) => (node.nodeType ?? '').toLowerCase() === 'decision').length;
  return decisionCount > 0 && (backEdgeKeys.size > 0 || [...decisionPlans.values()].some((plan) => !!plan.joinId));
}

function placeAlgorithmicNodes(
  orderedNodeIds: string[],
  nodeById: Map<string, FlowNodeDecl>,
  edges: FlowEdgeDecl[],
  measured: Map<string, NodeBox>,
  analysis: FlowAnalysis,
  options: ResolvedFlowOptions,
  variant: AlgorithmicVariant,
): { nodes: LayoutNode[]; edges: LayoutEdge[]; bounds: { minX: number; minY: number; maxX: number; maxY: number }; contentWidth: number; contentHeight: number } {
  const placements = new Map<string, GridPlacement>();
  const placed = new Set<string>();

  const placePath = (nodeId: string | undefined, row: number, col: number, stopAt: Set<string>): number => {
    if (!nodeId) return row;
    if (stopAt.has(nodeId)) return row;
    if (placed.has(nodeId)) return row;

    let currentId: string | undefined = nodeId;
    let cursor = row;
    while (currentId) {
      if (stopAt.has(currentId) || placed.has(currentId)) return cursor;
      placements.set(currentId, { row: cursor, col });
      placed.add(currentId);

      const node = nodeById.get(currentId);
      const successors: string[] = (analysis.forwardAdjacency.get(currentId) ?? []).filter((next: string) => !stopAt.has(next));
      if (!node || successors.length === 0) return cursor + 1;

      const isDecision = (node.nodeType ?? '').toLowerCase() === 'decision';
      const plan = analysis.decisionPlans.get(currentId);
      if (isDecision && plan && plan.successors.length > 1) {
        if (plan.isLoopHeader && plan.loopBodySuccessor) {
          const bodyEnd = placePath(plan.loopBodySuccessor, cursor + 1, col, new Set([...stopAt, currentId]));
          const exitSuccessor = plan.exitSuccessors[0];
          if (!exitSuccessor) return bodyEnd;
          cursor = bodyEnd;
          currentId = exitSuccessor;
          continue;
        }

        const joinId = plan.joinId;
        const primary = plan.primarySuccessor ?? plan.successors[0];
        const others = plan.successors.filter((next) => next !== primary);
        let branchEnd = cursor + 1;
        others.forEach((next: string, index: number) => {
          branchEnd = Math.max(
            branchEnd,
            placePath(next, cursor + variant.sideBranchRowOffset, col + 1 + index, new Set(joinId ? [...stopAt, joinId] : [...stopAt])),
          );
        });
        const primaryEnd = primary
          ? placePath(primary, cursor + 1, col, new Set(joinId ? [...stopAt, joinId] : [...stopAt]))
          : cursor + 1;
        cursor = Math.max(primaryEnd, branchEnd);
        if (joinId && !placed.has(joinId)) {
          currentId = joinId;
          continue;
        }
        return cursor;
      }

      if (successors.length === 1) {
        currentId = successors[0];
        cursor += 1;
        continue;
      }

      const [primary, ...others] = successors;
      let branchEnd = cursor + 1;
      others.forEach((next: string, index: number) => {
        branchEnd = Math.max(branchEnd, placePath(next, cursor + variant.sideBranchRowOffset, col + 1 + index, new Set(stopAt)));
      });
      cursor = Math.max(branchEnd, placePath(primary, cursor + 1, col, new Set(stopAt)));
      return cursor;
    }
    return cursor;
  };

  let nextRow = placePath(analysis.startId, 0, 0, new Set<string>());
  orderedNodeIds.forEach((id) => {
    if (!placed.has(id)) {
      nextRow = placePath(id, nextRow, 0, new Set<string>());
    }
  });

  const rowHeights = new Map<number, number>();
  const colWidths = new Map<number, number>();
  placements.forEach(({ row, col }, id) => {
    const box = measured.get(id);
    if (!box) return;
    rowHeights.set(row, Math.max(rowHeights.get(row) ?? 0, box.height));
    colWidths.set(col, Math.max(colWidths.get(col) ?? 0, box.width));
  });

  const rowYs = new Map<number, number>();
  let currentY = 0;
  const verticalGapFloor = variant.id === 'landscape_compact' ? 30 : 38;
  const verticalGap = Math.max(verticalGapFloor, options.verticalGap * variant.verticalGapScale);
  const sortedRows = [...rowHeights.keys()].sort((a, b) => a - b);
  sortedRows.forEach((row, index) => {
    const height = rowHeights.get(row) ?? 0;
    if (index === 0) currentY = height / 2;
    else currentY += (rowHeights.get(sortedRows[index - 1]) ?? 0) / 2 + verticalGap + height / 2;
    rowYs.set(row, currentY);
  });

  const colXs = new Map<number, number>();
  const sortedCols = [...colWidths.keys()].sort((a, b) => a - b);
  const horizontalGap = Math.max(48, options.horizontalGap * variant.horizontalGapScale);
  const totalWidth = sortedCols.reduce((sum, col, index) => {
    const width = colWidths.get(col) ?? 0;
    return sum + width + (index > 0 ? horizontalGap : 0);
  }, 0);
  let currentX = -totalWidth / 2;
  sortedCols.forEach((col, index) => {
    const width = colWidths.get(col) ?? 0;
    currentX += width / 2;
    colXs.set(col, currentX);
    currentX += width / 2 + (index < sortedCols.length - 1 ? horizontalGap : 0);
  });

  const nodes = orderedNodeIds
    .filter((id) => placements.has(id))
    .map((id) => {
      const node = createNode(id, measured.get(id));
      const placement = placements.get(id)!;
      return {
        ...node,
        x: colXs.get(placement.col) ?? 0,
        y: rowYs.get(placement.row) ?? 0,
      };
    });

  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const placementMap = new Map([...placements.entries()].map(([id, placement]) => [id, placement]));
  const genericEdges = buildGenericEdges(edges, nodes);
  const customEdges = edges.map((edge: FlowEdgeDecl, index: number) =>
    buildAlgorithmicEdge(edge, genericEdges[index], nodeMap, placementMap, analysis, options),
  );
  const bounds = boundsFromNodesAndEdges(nodes, customEdges);
  return {
    nodes,
    edges: customEdges,
    bounds,
    contentWidth: bounds.maxX - bounds.minX,
    contentHeight: bounds.maxY - bounds.minY,
  };
}

function buildVariantCandidate(
  variant: AlgorithmicVariant,
  orderedNodeIds: string[],
  nodeById: Map<string, FlowNodeDecl>,
  edges: FlowEdgeDecl[],
  analysis: FlowAnalysis,
  options: ResolvedFlowOptions,
): LayoutCandidate | null {
  let fontSize = options.preferredFontSize;
  let measured = measureNodes(orderedNodeIds, nodeById, fontSize, options.fit);
  let layout = placeAlgorithmicNodes(orderedNodeIds, nodeById, edges, measured, analysis, options, variant);

  if (options.readabilityMode === 'legacy') {
    const preferredWidth = Math.max(1, options.targetWidth - options.padding * 2);
    const preferredHeight = Math.max(1, options.targetHeight - options.padding * 2);
    if (layout.contentWidth > preferredWidth || layout.contentHeight > preferredHeight) {
      const scaleX = preferredWidth / Math.max(layout.contentWidth, 1);
      const scaleY = preferredHeight / Math.max(layout.contentHeight, 1);
      const scaledFont = Math.floor(options.preferredFontSize * Math.min(scaleX, scaleY, 1));
      fontSize = Math.max(options.minFontSize, scaledFont || options.minFontSize);
      measured = measureNodes(orderedNodeIds, nodeById, fontSize, options.fit);
      layout = placeAlgorithmicNodes(orderedNodeIds, nodeById, edges, measured, analysis, options, variant);
    }
  }

  const contentWidth = layout.bounds.maxX - layout.bounds.minX;
  const contentHeight = layout.bounds.maxY - layout.bounds.minY;
  const overflowX = Math.max(0, contentWidth - (options.targetWidth - options.padding * 2));
  const overflowY = Math.max(0, contentHeight - (options.targetHeight - options.padding * 2));
  const compactPenalty = options.preferredFontSize - fontSize;
  const targetAspect = options.targetHeight / Math.max(options.targetWidth, 1);
  const actualAspect = contentHeight / Math.max(contentWidth, 1);
  const aspectPenalty = Math.max(0, actualAspect - targetAspect * 1.08) * 1600;
  const heightPenalty = Math.max(0, contentHeight - options.targetHeight) * (options.readabilityMode === 'legacy' ? 4.8 : 3.6);
  const widthPenalty = Math.max(0, contentWidth - options.targetWidth) * (options.readabilityMode === 'legacy' ? 2.4 : 0.9);
  const score = options.readabilityMode === 'legacy'
    ? overflowX * 5 + overflowY * 6 + compactPenalty * 40 + aspectPenalty + heightPenalty + widthPenalty + variant.scoreBias
    : overflowX * 1.1 + overflowY * 2.4 + compactPenalty * 120 + aspectPenalty + heightPenalty + widthPenalty + variant.scoreBias;

  return {
    mode: 'algorithmic',
    nodes: layout.nodes,
    edges: layout.edges,
    minX: layout.bounds.minX - options.padding,
    minY: layout.bounds.minY - options.padding,
    maxX: layout.bounds.maxX + options.padding,
    maxY: layout.bounds.maxY + options.padding,
    width: options.sizeMode === 'fixed'
      ? options.targetWidth
      : Math.max(options.targetWidth, contentWidth + options.padding * 2),
    height: options.sizeMode === 'fixed'
      ? options.targetHeight
      : Math.max(options.targetHeight, contentHeight + options.padding * 2),
    fontSize,
    overflowX,
    overflowY,
    score,
  };
}

function resolveAlgorithmicVariants(fit: ResolvedFlowOptions['fit']): AlgorithmicVariant[] {
  if (fit === 'compact') {
    return [
      { id: 'balanced', verticalGapScale: 0.86, horizontalGapScale: 1.0, sideBranchRowOffset: 1, scoreBias: 24 },
    ];
  }
  return [
    { id: 'landscape_compact', verticalGapScale: 0.5, horizontalGapScale: 1.12, sideBranchRowOffset: 0, scoreBias: 0 },
    { id: 'balanced', verticalGapScale: 0.82, horizontalGapScale: 1.0, sideBranchRowOffset: 1, scoreBias: 120 },
  ];
}

function buildAlgorithmicEdge(
  edge: FlowEdgeDecl,
  fallback: LayoutEdge,
  nodeMap: Map<string, LayoutNode>,
  placements: Map<string, GridPlacement>,
  analysis: FlowAnalysis,
  options: ResolvedFlowOptions,
): LayoutEdge {
  const fromNode = nodeMap.get(edge.from);
  const toNode = nodeMap.get(edge.to);
  const fromPlacement = placements.get(edge.from);
  const toPlacement = placements.get(edge.to);
  if (!fromNode || !toNode || !fromPlacement || !toPlacement) return fallback;

  const backKey = `${edge.from}->${edge.to}`;
  const isBackEdge = analysis.backEdgeKeys.has(backKey);
  const fromDecision = (fromNode.nodeType ?? '').toLowerCase() === 'decision';
  const minNodeX = Math.min(...Array.from(nodeMap.values(), (node) => node.x - node.width / 2));
  const leftCorridorX = minNodeX - Math.max(90, options.horizontalGap * 0.8);

  let kind: LayoutEdge['kind'] = 'normal';
  let points = fallback.points;
  let labelX: number | undefined;
  let labelY: number | undefined;

  if (isBackEdge) {
    kind = 'back';
    const startX = fromNode.x - fromNode.width / 2;
    const startY = fromNode.y;
    const endX = toNode.x;
    const endY = toNode.y - toNode.height / 2;
    points = [
      { x: startX, y: startY },
      { x: leftCorridorX, y: startY },
      { x: leftCorridorX, y: endY - 26 },
      { x: endX, y: endY - 26 },
      { x: endX, y: endY },
    ];
    if (edge.label) {
      labelX = leftCorridorX + 26;
      labelY = startY - 10;
    }
  } else if (toPlacement.col > fromPlacement.col || (fromDecision && edge.label === 'Tidak' && toPlacement.col >= fromPlacement.col)) {
    kind = 'branch';
    const startX = fromNode.x + fromNode.width / 2;
    const startY = fromNode.y;
    const endX = toNode.x;
    const endY = toNode.y - toNode.height / 2;
    const branchX = fromNode.x + Math.max(40, options.horizontalGap * 0.45);
    points = [
      { x: startX, y: startY },
      { x: branchX, y: startY },
      { x: branchX, y: endY - 18 },
      { x: endX, y: endY - 18 },
      { x: endX, y: endY },
    ];
    if (edge.label) {
      labelX = branchX + 20;
      labelY = startY - 8;
    }
  } else if (fromPlacement.col > toPlacement.col) {
    kind = 'join';
    const startX = fromNode.x - fromNode.width / 2;
    const startY = fromNode.y;
    const endX = toNode.x;
    const endY = toNode.y - toNode.height / 2;
    const joinX = toNode.x - Math.max(48, options.horizontalGap * 0.32);
    points = [
      { x: startX, y: startY },
      { x: joinX, y: startY },
      { x: joinX, y: endY - 16 },
      { x: endX, y: endY - 16 },
      { x: endX, y: endY },
    ];
    if (edge.label) {
      labelX = joinX - 14;
      labelY = startY - 8;
    }
  } else if (fromDecision && edge.label) {
    const startX = fromNode.x;
    const startY = fromNode.y + fromNode.height / 2;
    const endX = toNode.x;
    const endY = toNode.y - toNode.height / 2;
    const midY = (startY + endY) / 2;
    points = [
      { x: startX, y: startY },
      { x: startX, y: midY },
      { x: endX, y: midY },
      { x: endX, y: endY },
    ];
    labelX = startX - 34;
    labelY = startY + 16;
  }

  return {
    from: edge.from,
    to: edge.to,
    label: edge.label,
    labelX,
    labelY,
    kind,
    points,
  };
}

function analyzeFlow(nodes: FlowNodeDecl[], edges: FlowEdgeDecl[]): FlowAnalysis | null {
  const adjacency = new Map<string, string[]>();
  const reverseAdjacency = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  nodes.forEach((node) => {
    adjacency.set(node.id, []);
    reverseAdjacency.set(node.id, []);
    indegree.set(node.id, 0);
  });
  edges.forEach((edge) => {
    adjacency.get(edge.from)?.push(edge.to);
    reverseAdjacency.get(edge.to)?.push(edge.from);
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
  });

  const startId = nodes.find((node) => (node.nodeType ?? '').toLowerCase() === 'start')?.id
    ?? nodes.find((node) => (indegree.get(node.id) ?? 0) === 0)?.id
    ?? nodes[0]?.id;
  if (!startId) return null;

  const backEdges = new Set<string>();
  const visited = new Set<string>();
  const stack = new Set<string>();

  const visit = (nodeId: string) => {
    visited.add(nodeId);
    stack.add(nodeId);
    for (const next of adjacency.get(nodeId) ?? []) {
      if (!visited.has(next)) visit(next);
      else if (stack.has(next)) backEdges.add(`${nodeId}->${next}`);
    }
    stack.delete(nodeId);
  };

  visit(startId);
  nodes.forEach((node) => {
    if (!visited.has(node.id)) visit(node.id);
  });

  const forwardAdjacency = new Map<string, string[]>();
  adjacency.forEach((targets, nodeId) => {
    forwardAdjacency.set(nodeId, targets.filter((target) => !backEdges.has(`${nodeId}->${target}`)));
  });
  const postDominators = computePostDominators(nodes.map((node) => node.id), forwardAdjacency);

  const edgeLabelByKey = new Map(edges.map((edge) => [`${edge.from}->${edge.to}`, edge.label ?? '']));
  const reachMemo = new Map<string, Set<string>>();
  const distanceMemo = new Map<string, Map<string, number>>();

  const reachable = (fromId: string): Set<string> => {
    if (reachMemo.has(fromId)) return reachMemo.get(fromId)!;
    const seen = new Set<string>();
    const stackIds = [fromId];
    while (stackIds.length) {
      const current = stackIds.pop()!;
      if (seen.has(current)) continue;
      seen.add(current);
      for (const next of forwardAdjacency.get(current) ?? []) {
        if (!seen.has(next)) stackIds.push(next);
      }
    }
    reachMemo.set(fromId, seen);
    return seen;
  };

  const distances = (fromId: string): Map<string, number> => {
    if (distanceMemo.has(fromId)) return distanceMemo.get(fromId)!;
    const result = new Map<string, number>([[fromId, 0]]);
    const queue = [fromId];
    while (queue.length) {
      const current = queue.shift()!;
      const currentDistance = result.get(current) ?? 0;
      for (const next of forwardAdjacency.get(current) ?? []) {
        if (!result.has(next)) {
          result.set(next, currentDistance + 1);
          queue.push(next);
        }
      }
    }
    distanceMemo.set(fromId, result);
    return result;
  };

  const loopHeaderSources = new Map<string, string[]>();
  backEdges.forEach((key) => {
    const [from, to] = key.split('->');
    loopHeaderSources.set(to, [...(loopHeaderSources.get(to) ?? []), from]);
  });

  const decisionPlans = new Map<string, DecisionPlan>();
  nodes.forEach((node) => {
    const successors = forwardAdjacency.get(node.id) ?? [];
    if ((node.nodeType ?? '').toLowerCase() !== 'decision' && successors.length <= 1) return;
    const joinId = successors.length > 1 ? findJoinCandidate(successors, postDominators, distances) : undefined;
    const loopSources = loopHeaderSources.get(node.id) ?? [];
    const isLoopHeader = loopSources.length > 0 && successors.length > 1;
    let loopBodySuccessor: string | undefined;
    let exitSuccessors: string[] = [];

    if (isLoopHeader) {
      loopBodySuccessor = successors.find((successor) =>
        loopSources.some((source) => reachable(successor).has(source)),
      );
      exitSuccessors = successors.filter((successor) => successor !== loopBodySuccessor);
    }

    const primarySuccessor = isLoopHeader
      ? loopBodySuccessor ?? pickPreferredByLabel(successors, edgeLabelByKey, node.id)
      : choosePrimarySuccessor(node.id, successors, joinId, edgeLabelByKey, distances, reachable);

    decisionPlans.set(node.id, {
      successors,
      joinId,
      primarySuccessor,
      loopBodySuccessor,
      exitSuccessors,
      isLoopHeader,
    });
  });

  return {
    startId,
    adjacency,
    reverseAdjacency,
    forwardAdjacency,
    backEdgeKeys: backEdges,
    decisionPlans,
  };
}

function findJoinCandidate(
  successors: string[],
  postDominators: Map<string, Set<string>>,
  distances: (id: string) => Map<string, number>,
): string | undefined {
  if (successors.length < 2) return undefined;
  const intersections = successors
    .map((id) => postDominators.get(id) ?? new Set([id]))
    .reduce<Set<string> | null>((acc, set) => {
      if (!acc) return new Set(set);
      return new Set([...acc].filter((item) => set.has(item)));
    }, null);
  if (!intersections || intersections.size === 0) return undefined;

  const candidates = [...intersections].filter((candidate) =>
    successors.every((id) => (distances(id).get(candidate) ?? Number.POSITIVE_INFINITY) < Number.POSITIVE_INFINITY),
  );
  if (!candidates.length) return undefined;

  candidates.sort((left, right) => {
    const leftDistances = successors.map((id) => distances(id).get(left) ?? Number.POSITIVE_INFINITY);
    const rightDistances = successors.map((id) => distances(id).get(right) ?? Number.POSITIVE_INFINITY);
    const leftMax = Math.max(...leftDistances);
    const rightMax = Math.max(...rightDistances);
    if (leftMax !== rightMax) return leftMax - rightMax;
    const leftSum = leftDistances.reduce((sum, value) => sum + value, 0);
    const rightSum = rightDistances.reduce((sum, value) => sum + value, 0);
    if (leftSum !== rightSum) return leftSum - rightSum;
    return left.localeCompare(right);
  });
  return candidates[0];
}

function computePostDominators(
  nodeIds: string[],
  forwardAdjacency: Map<string, string[]>,
): Map<string, Set<string>> {
  const indegree = new Map<string, number>(nodeIds.map((id) => [id, 0]));
  nodeIds.forEach((id) => {
    for (const next of forwardAdjacency.get(id) ?? []) {
      indegree.set(next, (indegree.get(next) ?? 0) + 1);
    }
  });

  const queue = nodeIds.filter((id) => (indegree.get(id) ?? 0) === 0);
  const ordered: string[] = [];
  while (queue.length) {
    const current = queue.shift()!;
    ordered.push(current);
    for (const next of forwardAdjacency.get(current) ?? []) {
      const remaining = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, remaining);
      if (remaining === 0) queue.push(next);
    }
  }

  nodeIds.forEach((id) => {
    if (!ordered.includes(id)) ordered.push(id);
  });

  const postDominators = new Map<string, Set<string>>();
  [...ordered].reverse().forEach((id) => {
    const successors = forwardAdjacency.get(id) ?? [];
    if (!successors.length) {
      postDominators.set(id, new Set([id]));
      return;
    }

    let intersection: Set<string> | null = null;
    successors.forEach((next) => {
      const nextSet = postDominators.get(next) ?? new Set([next]);
      intersection = intersection
        ? new Set([...intersection].filter((item) => nextSet.has(item)))
        : new Set(nextSet);
    });

    postDominators.set(id, new Set([id, ...intersection ?? []]));
  });

  return postDominators;
}

function choosePrimarySuccessor(
  nodeId: string,
  successors: string[],
  joinId: string | undefined,
  edgeLabelByKey: Map<string, string>,
  distances: (id: string) => Map<string, number>,
  reachable: (id: string) => Set<string>,
): string | undefined {
  if (!successors.length) return undefined;
  if (joinId) {
    return [...successors].sort((left, right) => {
      const leftDistance = distances(left).get(joinId) ?? Number.POSITIVE_INFINITY;
      const rightDistance = distances(right).get(joinId) ?? Number.POSITIVE_INFINITY;
      if (leftDistance !== rightDistance) return leftDistance - rightDistance;
      return preferByLabel(left, right, nodeId, edgeLabelByKey);
    })[0];
  }

  return [...successors].sort((left, right) => {
    const leftReach = reachable(left).size;
    const rightReach = reachable(right).size;
    if (leftReach !== rightReach) return rightReach - leftReach;
    return preferByLabel(left, right, nodeId, edgeLabelByKey);
  })[0];
}

function pickPreferredByLabel(
  successors: string[],
  edgeLabelByKey: Map<string, string>,
  nodeId: string,
): string | undefined {
  return [...successors].sort((left, right) => preferByLabel(left, right, nodeId, edgeLabelByKey))[0];
}

function preferByLabel(
  left: string,
  right: string,
  nodeId: string,
  edgeLabelByKey: Map<string, string>,
): number {
  const leftScore = branchLabelScore(edgeLabelByKey.get(`${nodeId}->${left}`) ?? '');
  const rightScore = branchLabelScore(edgeLabelByKey.get(`${nodeId}->${right}`) ?? '');
  if (leftScore !== rightScore) return rightScore - leftScore;
  return left.localeCompare(right);
}

function branchLabelScore(label: string): number {
  const normalized = label.trim().toLowerCase();
  if (!normalized) return 0;
  if (normalized === 'ya' || normalized === 'yes' || normalized === 'true') return 3;
  if (normalized === 'tidak' || normalized === 'no' || normalized === 'false') return 1;
  return 2;
}
