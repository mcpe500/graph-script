import { FlowDeclaration } from '../ast/types';
import { escapeXml, round, wrapText } from './common';

export interface FlowLayout {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  width: number;
  height: number;
  minX: number;
  minY: number;
  direction: 'top_down' | 'left_right';
}

export interface LayoutNode {
  id: string;
  label: string;
  nodeType?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  lines: string[];
}

export interface LayoutEdge {
  from: string;
  to: string;
  label?: string;
  points: { x: number; y: number }[];
}

interface NodeBox {
  width: number;
  height: number;
  lines: string[];
}

export function layoutFlow(flow: FlowDeclaration): FlowLayout {
  const direction = resolveDirection(flow);
  const nodes = flow.nodes || [];
  const edges = flow.edges || [];
  const padding = 52;
  const horizontalGap = direction === 'left_right' ? 120 : 72;
  const verticalGap = direction === 'left_right' ? 36 : 96;

  const adjacency = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  nodes.forEach((node) => {
    adjacency.set(node.id, []);
    indegree.set(node.id, 0);
  });
  edges.forEach((edge) => {
    adjacency.get(edge.from)?.push(edge.to);
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
  });

  const levels: string[][] = [];
  let frontier = nodes.filter((node) => (indegree.get(node.id) ?? 0) === 0).map((node) => node.id);
  if (!frontier.length) frontier = nodes.map((node) => node.id);
  const assigned = new Set<string>();

  while (frontier.length) {
    levels.push(frontier);
    frontier.forEach((id) => assigned.add(id));
    const next: string[] = [];
    frontier.forEach((nodeId) => {
      for (const neighbor of adjacency.get(nodeId) ?? []) {
        if (assigned.has(neighbor)) continue;
        const ready = edges.filter((edge) => edge.to === neighbor).every((edge) => assigned.has(edge.from));
        if (ready && !next.includes(neighbor)) next.push(neighbor);
      }
    });
    if (!next.length && assigned.size < nodes.length) {
      const fallback = nodes.find((node) => !assigned.has(node.id));
      if (fallback) next.push(fallback.id);
    }
    frontier = next;
  }

  const measured = new Map<string, NodeBox>();
  nodes.forEach((node) => {
    measured.set(node.id, measureNode(node.label || node.id, node.nodeType));
  });

  const layoutNodes: LayoutNode[] = [];
  const nodeMap = new Map<string, LayoutNode>();

  let levelOffset = 0;
  levels.forEach((level) => {
    const boxes = level.map((nodeId) => measured.get(nodeId) ?? measureNode(nodeId));
    const primarySpan = boxes.reduce((sum, box) => sum + (direction === 'left_right' ? box.height : box.width), 0)
      + Math.max(0, level.length - 1) * (direction === 'left_right' ? verticalGap : horizontalGap);
    let primaryCursor = -primarySpan / 2;
    const secondarySpan = Math.max(...boxes.map((box) => direction === 'left_right' ? box.width : box.height), 0);
    const secondaryCenter = levelOffset + secondarySpan / 2;

    level.forEach((nodeId, index) => {
      const node = nodes.find((entry) => entry.id === nodeId);
      if (!node) return;
      const box = boxes[index];
      const primarySize = direction === 'left_right' ? box.height : box.width;
      const primaryCenter = primaryCursor + primarySize / 2;
      const positioned: LayoutNode = direction === 'left_right'
        ? {
            id: node.id,
            label: node.label || node.id,
            nodeType: node.nodeType,
            x: secondaryCenter,
            y: primaryCenter,
            width: box.width,
            height: box.height,
            lines: box.lines,
          }
        : {
            id: node.id,
            label: node.label || node.id,
            nodeType: node.nodeType,
            x: primaryCenter,
            y: secondaryCenter,
            width: box.width,
            height: box.height,
            lines: box.lines,
          };

      layoutNodes.push(positioned);
      nodeMap.set(node.id, positioned);
      primaryCursor += primarySize + (direction === 'left_right' ? verticalGap : horizontalGap);
    });

    levelOffset += secondarySpan + (direction === 'left_right' ? horizontalGap : verticalGap);
  });

  const layoutEdges: LayoutEdge[] = edges.map((edge) => {
    const fromNode = nodeMap.get(edge.from);
    const toNode = nodeMap.get(edge.to);
    if (!fromNode || !toNode) return { from: edge.from, to: edge.to, label: edge.label, points: [] };

    if (direction === 'left_right') {
      const startX = fromNode.x + fromNode.width / 2;
      const startY = fromNode.y;
      const endX = toNode.x - toNode.width / 2;
      const endY = toNode.y;
      const midX = (startX + endX) / 2;
      return {
        from: edge.from,
        to: edge.to,
        label: edge.label,
        points: [
          { x: startX, y: startY },
          { x: midX, y: startY },
          { x: midX, y: endY },
          { x: endX, y: endY },
        ],
      };
    }

    const startX = fromNode.x;
    const startY = fromNode.y + fromNode.height / 2;
    const endX = toNode.x;
    const endY = toNode.y - toNode.height / 2;
    const midY = (startY + endY) / 2;
    return {
      from: edge.from,
      to: edge.to,
      label: edge.label,
      points: [
        { x: startX, y: startY },
        { x: startX, y: midY },
        { x: endX, y: midY },
        { x: endX, y: endY },
      ],
    };
  });

  const xs = layoutNodes.flatMap((node) => [node.x - node.width / 2, node.x + node.width / 2]);
  const ys = layoutNodes.flatMap((node) => [node.y - node.height / 2, node.y + node.height / 2]);
  const minX = Math.min(...xs, 0);
  const maxX = Math.max(...xs, 0);
  const minY = Math.min(...ys, 0);
  const maxY = Math.max(...ys, 0);
  const width = (maxX - minX) + padding * 2;
  const height = (maxY - minY) + padding * 2;

  return { nodes: layoutNodes, edges: layoutEdges, width, height, minX, minY, direction };
}

export function renderFlow(layout: FlowLayout, title?: string): string {
  const svgWidth = Math.max(560, layout.width + 140);
  const svgHeight = Math.max(360, layout.height + 130);
  const outerPaddingX = (svgWidth - layout.width) / 2;
  const offsetX = outerPaddingX - layout.minX;
  const offsetY = 86 - layout.minY;

  let svg = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  svg += `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">`;
  svg += `<rect width="${svgWidth}" height="${svgHeight}" fill="#ffffff"/>`;
  if (title) {
    svg += `<text x="${svgWidth / 2}" y="36" text-anchor="middle" font-size="22" font-weight="800" fill="#0f172a">${escapeXml(title)}</text>`;
  }

  svg += `<defs>`;
  svg += `<marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">`;
  svg += `<path d="M 0 0 L 10 5 L 0 10 z" fill="#475569"/></marker>`;
  svg += `</defs>`;
  svg += `<g transform="translate(${offsetX}, ${offsetY})">`;

  layout.edges.forEach((edge) => {
    if (edge.points.length < 2) return;
    const polyline = edge.points.map((point) => `${round(point.x)},${round(point.y)}`).join(' ');
    svg += `<polyline points="${polyline}" fill="none" stroke="#475569" stroke-width="2.4" marker-end="url(#arrow)"/>`;
    if (edge.label) {
      const mid = edge.points[Math.floor(edge.points.length / 2)];
      const chipWidth = Math.max(44, edge.label.length * 7 + 18);
      svg += `<rect x="${round(mid.x - chipWidth / 2)}" y="${round(mid.y - 20)}" width="${round(chipWidth)}" height="20" rx="10" fill="#ffffff" stroke="#cbd5e1"/>`;
      svg += `<text x="${round(mid.x)}" y="${round(mid.y - 7)}" text-anchor="middle" font-size="11" font-weight="700" fill="#475569">${escapeXml(edge.label)}</text>`;
    }
  });

  layout.nodes.forEach((node) => {
    svg += renderNode(node);
  });

  svg += `</g></svg>`;
  return svg;
}

function renderNode(node: LayoutNode): string {
  const type = (node.nodeType ?? 'process').toLowerCase();
  const theme = nodeTheme(type);
  const x = node.x - node.width / 2;
  const y = node.y - node.height / 2;
  const textStart = node.y - ((node.lines.length - 1) * 16) / 2 + 5;

  let svg = `<g>`;
  switch (type) {
    case 'start':
    case 'end':
      svg += `<rect x="${round(x)}" y="${round(y)}" width="${round(node.width)}" height="${round(node.height)}" rx="${round(node.height / 2)}" fill="${theme.fill}" stroke="${theme.stroke}" stroke-width="2"/>`;
      break;
    case 'decision': {
      const top = `${round(node.x)},${round(y)}`;
      const right = `${round(node.x + node.width / 2)},${round(node.y)}`;
      const bottom = `${round(node.x)},${round(node.y + node.height / 2)}`;
      const left = `${round(node.x - node.width / 2)},${round(node.y)}`;
      svg += `<polygon points="${top} ${right} ${bottom} ${left}" fill="${theme.fill}" stroke="${theme.stroke}" stroke-width="2"/>`;
      break;
    }
    case 'data': {
      const skew = 18;
      svg += `<polygon points="${round(x + skew)},${round(y)} ${round(x + node.width)},${round(y)} ${round(x + node.width - skew)},${round(y + node.height)} ${round(x)},${round(y + node.height)}" fill="${theme.fill}" stroke="${theme.stroke}" stroke-width="2"/>`;
      break;
    }
    default:
      svg += `<rect x="${round(x)}" y="${round(y)}" width="${round(node.width)}" height="${round(node.height)}" rx="14" fill="${theme.fill}" stroke="${theme.stroke}" stroke-width="2"/>`;
      break;
  }

  node.lines.forEach((line, index) => {
    svg += `<text x="${round(node.x)}" y="${round(textStart + index * 16)}" text-anchor="middle" font-size="13" font-weight="700" fill="${theme.text}">${escapeXml(line)}</text>`;
  });
  svg += `</g>`;
  return svg;
}

function resolveDirection(flow: FlowDeclaration): 'top_down' | 'left_right' {
  const directionExpr = flow.properties.direction;
  if (directionExpr?.type === 'Identifier' && directionExpr.name === 'left_right') return 'left_right';
  if (directionExpr?.type === 'Literal' && directionExpr.value === 'left_right') return 'left_right';
  return 'top_down';
}

function measureNode(label: string, type?: string): NodeBox {
  const kind = (type ?? 'process').toLowerCase();
  const maxChars = kind === 'decision' ? 18 : 24;
  const lines = wrapText(label, maxChars, 4);
  const longest = Math.max(...lines.map((line) => line.length), 8);
  const textWidth = longest * 7.4;
  const textHeight = lines.length * 16;

  switch (kind) {
    case 'decision':
      return { width: Math.max(190, textWidth + 60), height: Math.max(110, textHeight + 54), lines };
    case 'start':
    case 'end':
      return { width: Math.max(150, textWidth + 52), height: Math.max(56, textHeight + 30), lines };
    case 'data':
      return { width: Math.max(180, textWidth + 48), height: Math.max(72, textHeight + 34), lines };
    default:
      return { width: Math.max(210, textWidth + 48), height: Math.max(76, textHeight + 34), lines };
  }
}

function nodeTheme(type: string): { fill: string; stroke: string; text: string } {
  switch (type) {
    case 'start':
      return { fill: '#dcfce7', stroke: '#16a34a', text: '#166534' };
    case 'end':
      return { fill: '#fee2e2', stroke: '#dc2626', text: '#991b1b' };
    case 'decision':
      return { fill: '#fef3c7', stroke: '#d97706', text: '#92400e' };
    case 'data':
      return { fill: '#ede9fe', stroke: '#7c3aed', text: '#5b21b6' };
    default:
      return { fill: '#dbeafe', stroke: '#2563eb', text: '#1e3a8a' };
  }
}
