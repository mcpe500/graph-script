interface UseCaseLabelBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface UseCaseRelationGeometry {
  id: string;
  type: 'include' | 'extend';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label: string;
}

export interface UseCaseLabelBlocker {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface UseCaseLabelSegment {
  id: string;
  type: 'association' | 'include' | 'extend';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface UseCaseLabelCandidate {
  x: number;
  y: number;
  width: number;
  height: number;
  anchorT: number;
  side: number;
  offset: number;
  slide: number;
  basePenalty: number;
}

interface PlacementSnapshot {
  totalScore: number;
  perRelationScore: Map<string, number>;
}

export interface UseCaseRelationLabelPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  score: number;
}

export interface UseCaseRelationLabelPlacementResult {
  placements: Map<string, UseCaseRelationLabelPlacement>;
  loopsUsed: number;
  bestScore: number;
}

export interface ComputeUseCaseRelationLabelPlacementsInput {
  relations: UseCaseRelationGeometry[];
  blockers: UseCaseLabelBlocker[];
  segments: UseCaseLabelSegment[];
  canvasWidth: number;
  canvasHeight: number;
  maxLoops?: number;
}

const DEFAULT_MAX_LOOPS = 5;
const HARD_OVERLAP_PENALTY = 260000;
const HARD_LABEL_OVERLAP_PENALTY = 320000;
const HARD_SEGMENT_HIT_PENALTY = 170000;

export function computeUseCaseRelationLabelPlacements(
  input: ComputeUseCaseRelationLabelPlacementsInput,
): UseCaseRelationLabelPlacementResult {
  if (!input.relations.length) {
    return { placements: new Map(), loopsUsed: 0, bestScore: 0 };
  }

  const relationById = new Map(input.relations.map((relation) => [relation.id, relation]));
  const candidateMap = new Map<string, UseCaseLabelCandidate[]>();
  const orderedRelations = [...input.relations].sort((left, right) => {
    const leftMidY = (left.y1 + left.y2) / 2;
    const rightMidY = (right.y1 + right.y2) / 2;
    if (leftMidY !== rightMidY) return leftMidY - rightMidY;
    return left.id.localeCompare(right.id);
  });

  for (const relation of orderedRelations) {
    candidateMap.set(relation.id, buildRelationCandidates(relation));
  }

  const current = new Map<string, UseCaseLabelCandidate>();

  // Stage 1: greedy smart attempt
  for (const relation of orderedRelations) {
    const candidates = candidateMap.get(relation.id) ?? [];
    let bestCandidate = candidates[0];
    let bestScore = Number.POSITIVE_INFINITY;

    for (const candidate of candidates) {
      const score = scoreRelationCandidate(relation, candidate, current, input);
      if (score < bestScore) {
        bestScore = score;
        bestCandidate = candidate;
      }
    }

    if (!bestCandidate) {
      bestCandidate = buildFallbackCandidate(relation);
    }
    current.set(relation.id, bestCandidate);
  }

  let snapshot = scoreSnapshot(current, relationById, input);
  let bestSnapshot = snapshot;
  let bestPlacements = new Map(current);
  let loopsUsed = 0;
  const maxLoops = Math.max(1, Math.min(DEFAULT_MAX_LOOPS, input.maxLoops ?? DEFAULT_MAX_LOOPS));

  // Stage 2: validation/refinement loop with max 5 iterations
  for (let loop = 1; loop <= maxLoops; loop += 1) {
    loopsUsed = loop;
    let improved = false;

    const relationOrder = [...snapshot.perRelationScore.entries()]
      .sort((left, right) => right[1] - left[1])
      .map(([relationId]) => relationId);

    for (const relationId of relationOrder) {
      const relation = relationById.get(relationId);
      const candidates = candidateMap.get(relationId);
      const currentCandidate = current.get(relationId);
      if (!relation || !candidates?.length || !currentCandidate) continue;

      let bestCandidate = currentCandidate;
      let bestTotalScore = snapshot.totalScore;

      for (const candidate of candidates) {
        if (sameCandidate(candidate, currentCandidate)) continue;
        const trial = new Map(current);
        trial.set(relationId, candidate);
        const trialSnapshot = scoreSnapshot(trial, relationById, input);
        if (trialSnapshot.totalScore + 0.1 < bestTotalScore) {
          bestCandidate = candidate;
          bestTotalScore = trialSnapshot.totalScore;
        }
      }

      if (!sameCandidate(bestCandidate, currentCandidate)) {
        current.set(relationId, bestCandidate);
        snapshot = scoreSnapshot(current, relationById, input);
        improved = true;

        if (snapshot.totalScore + 0.1 < bestSnapshot.totalScore) {
          bestSnapshot = snapshot;
          bestPlacements = new Map(current);
        }
      }
    }

    if (!improved) break;
  }

  if (snapshot.totalScore + 0.1 < bestSnapshot.totalScore) {
    bestSnapshot = snapshot;
    bestPlacements = new Map(current);
  }

  const scoredBest = scoreSnapshot(bestPlacements, relationById, input);
  const placements = new Map<string, UseCaseRelationLabelPlacement>();
  for (const [relationId, candidate] of bestPlacements.entries()) {
    placements.set(relationId, {
      x: candidate.x,
      y: candidate.y,
      width: candidate.width,
      height: candidate.height,
      score: scoredBest.perRelationScore.get(relationId) ?? 0,
    });
  }

  return {
    placements,
    loopsUsed,
    bestScore: scoredBest.totalScore,
  };
}

function scoreSnapshot(
  placements: Map<string, UseCaseLabelCandidate>,
  relationById: Map<string, UseCaseRelationGeometry>,
  input: ComputeUseCaseRelationLabelPlacementsInput,
): PlacementSnapshot {
  const perRelationScore = new Map<string, number>();
  let totalScore = 0;

  for (const [relationId, candidate] of placements.entries()) {
    const relation = relationById.get(relationId);
    if (!relation) continue;
    const score = scoreRelationCandidate(relation, candidate, placements, input);
    perRelationScore.set(relationId, score);
    totalScore += score;
  }

  return { totalScore, perRelationScore };
}

function scoreRelationCandidate(
  relation: UseCaseRelationGeometry,
  candidate: UseCaseLabelCandidate,
  placements: Map<string, UseCaseLabelCandidate>,
  input: ComputeUseCaseRelationLabelPlacementsInput,
): number {
  const box = candidateToBox(candidate);
  let score = candidate.basePenalty;

  const overflow = canvasOverflow(box, input.canvasWidth, input.canvasHeight);
  if (overflow > 0) {
    score += 150000 + overflow * 140;
  }

  for (const blocker of input.blockers) {
    const blockerBox: UseCaseLabelBox = {
      x: blocker.x,
      y: blocker.y,
      width: blocker.width,
      height: blocker.height,
    };
    const area = overlapArea(box, blockerBox);
    if (area > 0) {
      score += HARD_OVERLAP_PENALTY + area * 14;
      continue;
    }

    const clearance = minBoxDistance(box, blockerBox);
    if (clearance < 10) {
      score += Math.round((10 - clearance) * 220);
    }
  }

  for (const [otherId, otherCandidate] of placements.entries()) {
    if (otherId === relation.id) continue;
    const otherBox = expandBox(candidateToBox(otherCandidate), 2);
    const expandedCurrent = expandBox(box, 2);
    const area = overlapArea(expandedCurrent, otherBox);
    if (area > 0) {
      score += HARD_LABEL_OVERLAP_PENALTY + area * 20;
      continue;
    }

    const clearance = minBoxDistance(expandedCurrent, otherBox);
    if (clearance < 8) {
      score += Math.round((8 - clearance) * 360);
    }
  }

  for (const segment of input.segments) {
    const selfSegment = segment.id === relation.id;
    if (!segmentHitsBox(segment, box, selfSegment ? 0 : 2)) continue;
    score += selfSegment ? 2200 : HARD_SEGMENT_HIT_PENALTY;
  }

  const midpoint = {
    x: (relation.x1 + relation.x2) / 2,
    y: (relation.y1 + relation.y2) / 2,
  };
  score += euclideanDistance(midpoint.x, midpoint.y, candidate.x, candidate.y) * 0.6;
  score += Math.abs(candidate.anchorT - 0.5) * 34;
  score += Math.abs(candidate.offset - 20) * 1.4;
  score += Math.abs(candidate.slide) * 1.2;

  return score;
}

function buildRelationCandidates(relation: UseCaseRelationGeometry): UseCaseLabelCandidate[] {
  const width = estimateLabelWidth(relation.label);
  const height = 22;
  const dx = relation.x2 - relation.x1;
  const dy = relation.y2 - relation.y1;
  const length = Math.sqrt(dx * dx + dy * dy);

  if (length < 1) {
    return [buildFallbackCandidate(relation)];
  }

  const ux = dx / length;
  const uy = dy / length;
  const perpX = -uy;
  const perpY = ux;

  const anchorValues = [0.2, 0.35, 0.5, 0.65, 0.8];
  const offsets = [14, 20, 28, 36, 46];
  const slides = [-18, 0, 18];
  const sides = [1, -1];

  const seen = new Set<string>();
  const candidates: UseCaseLabelCandidate[] = [];

  for (const anchorT of anchorValues) {
    const anchorX = relation.x1 + dx * anchorT;
    const anchorY = relation.y1 + dy * anchorT;

    for (const side of sides) {
      for (const offset of offsets) {
        for (const slide of slides) {
          const x = anchorX + perpX * offset * side + ux * slide;
          const y = anchorY + perpY * offset * side + uy * slide;
          const key = `${Math.round(x)}:${Math.round(y)}:${Math.round(offset)}:${side}`;
          if (seen.has(key)) continue;
          seen.add(key);

          const basePenalty = Math.abs(anchorT - 0.5) * 22
            + Math.abs(offset - 20) * 0.8
            + Math.abs(slide) * 0.6
            + (offset > 36 ? 20 : 0);

          candidates.push({
            x,
            y,
            width,
            height,
            anchorT,
            side,
            offset,
            slide,
            basePenalty,
          });
        }
      }
    }
  }

  if (!candidates.length) {
    candidates.push(buildFallbackCandidate(relation));
  }

  candidates.sort((left, right) => left.basePenalty - right.basePenalty);
  return candidates;
}

function buildFallbackCandidate(relation: UseCaseRelationGeometry): UseCaseLabelCandidate {
  const width = estimateLabelWidth(relation.label);
  const height = 22;
  const dx = relation.x2 - relation.x1;
  const dy = relation.y2 - relation.y1;
  const length = Math.sqrt(dx * dx + dy * dy) || 1;
  const perpX = -dy / length;
  const perpY = dx / length;

  return {
    x: (relation.x1 + relation.x2) / 2 + perpX * 20,
    y: (relation.y1 + relation.y2) / 2 + perpY * 20,
    width,
    height,
    anchorT: 0.5,
    side: 1,
    offset: 20,
    slide: 0,
    basePenalty: 0,
  };
}

function estimateLabelWidth(text: string): number {
  const content = text || '';
  const textWidth = Math.max(48, content.length * 7.1);
  return Math.min(164, Math.ceil(textWidth + 14));
}

function candidateToBox(candidate: UseCaseLabelCandidate): UseCaseLabelBox {
  return {
    x: candidate.x - candidate.width / 2,
    y: candidate.y - candidate.height / 2,
    width: candidate.width,
    height: candidate.height,
  };
}

function overlapArea(a: UseCaseLabelBox, b: UseCaseLabelBox): number {
  const xOverlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const yOverlap = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return xOverlap * yOverlap;
}

function expandBox(box: UseCaseLabelBox, padding: number): UseCaseLabelBox {
  return {
    x: box.x - padding,
    y: box.y - padding,
    width: box.width + padding * 2,
    height: box.height + padding * 2,
  };
}

function minBoxDistance(a: UseCaseLabelBox, b: UseCaseLabelBox): number {
  const dx = Math.max(0, Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width)));
  const dy = Math.max(0, Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height)));
  return Math.sqrt(dx * dx + dy * dy);
}

function canvasOverflow(box: UseCaseLabelBox, width: number, height: number): number {
  const left = Math.max(0, -box.x);
  const top = Math.max(0, -box.y);
  const right = Math.max(0, box.x + box.width - width);
  const bottom = Math.max(0, box.y + box.height - height);
  return left + top + right + bottom;
}

function segmentHitsBox(
  segment: { x1: number; y1: number; x2: number; y2: number },
  box: UseCaseLabelBox,
  padding = 0,
): boolean {
  const minX = box.x - padding;
  const minY = box.y - padding;
  const maxX = box.x + box.width + padding;
  const maxY = box.y + box.height + padding;

  const dx = segment.x2 - segment.x1;
  const dy = segment.y2 - segment.y1;

  let t0 = 0;
  let t1 = 1;

  const checks: Array<{ p: number; q: number }> = [
    { p: -dx, q: segment.x1 - minX },
    { p: dx, q: maxX - segment.x1 },
    { p: -dy, q: segment.y1 - minY },
    { p: dy, q: maxY - segment.y1 },
  ];

  for (const check of checks) {
    if (check.p === 0) {
      if (check.q < 0) return false;
      continue;
    }

    const t = check.q / check.p;
    if (check.p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
  }

  return t0 <= t1;
}

function euclideanDistance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

function sameCandidate(left: UseCaseLabelCandidate, right: UseCaseLabelCandidate): boolean {
  return Math.abs(left.x - right.x) < 0.1
    && Math.abs(left.y - right.y) < 0.1
    && Math.abs(left.offset - right.offset) < 0.1
    && Math.abs(left.slide - right.slide) < 0.1
    && left.side === right.side;
}
