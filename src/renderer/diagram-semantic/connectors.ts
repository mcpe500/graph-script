import { DiagramElement } from '../../ast/types';
import { GSValue, Trace } from '../../runtime/values';
import { measureRichTextBlock, readLatexMode } from '../latex';
import { CardLayout, BoxArea, ConnectorPath, ConnectorRoutingContext, ConnectorSegmentObstacle, CONNECTOR_LABEL_MIN } from './types';
import { clamp, element, getNumber, getString } from './helpers';

export async function compileConnector(
  connector: DiagramElement,
  cardMap: Map<string, CardLayout>,
  routingContext: ConnectorRoutingContext,
  values: Record<string, GSValue>,
  traces: Map<string, Trace>,
  fontFamily?: string,
): Promise<DiagramElement[]> {
  const fromRef = parseAnchorRef(getString(connector, values, traces, 'from', ''));
  const toRef = parseAnchorRef(getString(connector, values, traces, 'to', ''));
  if (!fromRef || !toRef) return [];

  const fromCard = cardMap.get(fromRef.cardId);
  const toCard = cardMap.get(toRef.cardId);
  if (!fromCard || !toCard) return [];

  const route = getString(connector, values, traces, 'route', 'auto');
  const stroke = getString(connector, values, traces, 'stroke', '#64748b');
  const strokeWidth = getNumber(connector, values, traces, 'strokeWidth', 3);
  const dash = getString(connector, values, traces, 'dash', '');
  const label = getString(connector, values, traces, 'label', '');
  const labelDx = getNumber(connector, values, traces, 'label_dx', 0);
  const labelDy = getNumber(connector, values, traces, 'label_dy', -12);
  const labelFill = getString(connector, values, traces, 'label_fill', '#ffffff');
  const labelFillOpacity = getNumber(connector, values, traces, 'label_fill_opacity', 0.96);
  const labelPadX = Math.max(10, getNumber(connector, values, traces, 'label_padding_x', 12));
  const labelPadY = Math.max(6, getNumber(connector, values, traces, 'label_padding_y', 7));
  const path = routeConnector(fromCard, fromRef.anchor, toCard, toRef.anchor, route, [...cardMap.values()], routingContext);

  const segments: DiagramElement[] = [];
  for (let index = 0; index < path.points.length - 1; index += 1) {
    const start = path.points[index];
    const end = path.points[index + 1];
    const type = index === path.points.length - 2 ? 'arrow' : 'line';
    segments.push(element(type, `${connector.name}-seg-${index + 1}`, {
      x: start.x,
      y: start.y,
      x2: end.x,
      y2: end.y,
      stroke,
      strokeWidth,
      dash,
      connector_id: connector.name,
      connector_from: fromCard.id,
      connector_to: toCard.id,
      semantic_role: 'connector_segment',
    }));
    routingContext.segments.push({ start, end, connectorId: connector.name });
  }

  if (label) {
    const labelSize = Math.max(CONNECTOR_LABEL_MIN, getNumber(connector, values, traces, 'size', CONNECTOR_LABEL_MIN));
    const labelMetrics = await measureRichTextBlock(label, {
      x: path.labelX,
      y: path.labelY,
      maxWidth: Math.min(320, Math.max(180, path.labelSegmentLength - 20)),
      fontSize: labelSize,
      weight: getString(connector, values, traces, 'weight', '700'),
      anchor: 'middle',
      latex: readLatexMode(undefined, 'auto'),
      maxLines: 2,
      fontFamily,
    });

    const labelPlacement = placeConnectorLabel(
      path,
      labelMetrics.width,
      labelMetrics.height,
      [...cardMap.values()],
      routingContext,
      fromCard.id,
      toCard.id,
      labelDx,
      labelDy,
      labelPadX,
      labelPadY,
    );

    if (labelPlacement) {
      segments.push(element('box', `${connector.name}-label-bg`, {
        x: labelPlacement.box.x,
        y: labelPlacement.box.y,
        w: labelPlacement.box.width,
        h: labelPlacement.box.height,
        label: '',
        fill: labelFill,
        fillOpacity: labelFillOpacity,
        stroke: 'none',
        radius: 10,
        shadow: false,
        validation_ignore: true,
        semantic_role: 'connector_label_bg',
        connector_from: fromCard.id,
        connector_to: toCard.id,
      }));
      segments.push(element('text', `${connector.name}-label`, {
        x: labelPlacement.textX,
        y: labelPlacement.textY,
        w: labelPlacement.textWidth,
        h: labelMetrics.height,
        anchor: 'middle',
        value: label,
        size: labelSize,
        weight: getString(connector, values, traces, 'weight', '700'),
        color: getString(connector, values, traces, 'color', stroke),
        latex: getString(connector, values, traces, 'latex', 'auto'),
        font_family: fontFamily ?? '',
        min_gap: 16,
        validation_ignore: true,
        semantic_role: 'connector_label',
        connector_from: fromCard.id,
        connector_to: toCard.id,
      }));
      routingContext.labels.push(labelPlacement.box);
    }
  }

  return segments;
}

export function estimateConnectorPriority(
  connector: DiagramElement,
  cardMap: Map<string, CardLayout>,
  values: Record<string, GSValue>,
  traces: Map<string, Trace>,
): number {
  const fromRef = parseAnchorRef(getString(connector, values, traces, 'from', ''));
  const toRef = parseAnchorRef(getString(connector, values, traces, 'to', ''));
  if (!fromRef || !toRef) return 0;

  const fromCard = cardMap.get(fromRef.cardId);
  const toCard = cardMap.get(toRef.cardId);
  if (!fromCard || !toCard) return 0;

  const span = Math.abs((fromCard.x + fromCard.width / 2) - (toCard.x + toCard.width / 2))
    + Math.abs((fromCard.y + fromCard.height / 2) - (toCard.y + toCard.height / 2));
  const lanePenalty = fromCard.laneId === toCard.laneId ? 0 : 280;
  const labelPenalty = getString(connector, values, traces, 'label', '') ? 120 : 0;
  const autoBonus = getString(connector, values, traces, 'route', 'auto') === 'auto' ? 40 : 0;
  return span + lanePenalty + labelPenalty + autoBonus;
}

function placeConnectorLabel(
  path: ConnectorPath,
  labelWidth: number,
  labelHeight: number,
  cards: CardLayout[],
  routingContext: ConnectorRoutingContext,
  fromId: string,
  toId: string,
  labelDx: number,
  labelDy: number,
  padX: number,
  padY: number,
): { box: BoxArea; textX: number; textY: number; textWidth: number } | null {
  if (labelWidth <= 0 || labelHeight <= 0) return null;

  const horizontal = path.labelSegmentStart.y === path.labelSegmentEnd.y;
  const segmentLength = horizontal
    ? Math.abs(path.labelSegmentEnd.x - path.labelSegmentStart.x)
    : Math.abs(path.labelSegmentEnd.y - path.labelSegmentStart.y);
  const requiredLength = horizontal ? labelWidth + 24 : labelHeight + 20;
  if (segmentLength + 0.1 < requiredLength) return null;

  const boxWidth = labelWidth + padX * 2;
  const boxHeight = labelHeight + padY * 2;
  const segmentCenter = boxCenter({
    x: Math.min(path.labelSegmentStart.x, path.labelSegmentEnd.x),
    y: Math.min(path.labelSegmentStart.y, path.labelSegmentEnd.y),
    width: Math.abs(path.labelSegmentEnd.x - path.labelSegmentStart.x),
    height: Math.abs(path.labelSegmentEnd.y - path.labelSegmentStart.y),
  });
  const gap = 16;

  const candidates = horizontal
    ? [
        { x: segmentCenter.x - boxWidth / 2, y: path.labelSegmentStart.y - boxHeight - gap },
        { x: segmentCenter.x - boxWidth / 2, y: path.labelSegmentStart.y + gap },
        { x: Math.min(path.labelSegmentStart.x, path.labelSegmentEnd.x) + 12, y: path.labelSegmentStart.y - boxHeight - gap },
        { x: Math.max(path.labelSegmentStart.x, path.labelSegmentEnd.x) - boxWidth - 12, y: path.labelSegmentStart.y + gap },
      ]
    : [
        { x: path.labelSegmentStart.x - boxWidth - gap, y: segmentCenter.y - boxHeight / 2 },
        { x: path.labelSegmentStart.x + gap, y: segmentCenter.y - boxHeight / 2 },
        { x: path.labelSegmentStart.x - boxWidth - gap, y: Math.min(path.labelSegmentStart.y, path.labelSegmentEnd.y) + 10 },
        { x: path.labelSegmentStart.x + gap, y: Math.max(path.labelSegmentStart.y, path.labelSegmentEnd.y) - boxHeight - 10 },
      ];

  let best: { box: BoxArea; score: number } | null = null;
  const currentSegments = pathSegments(path.points, '__current__');

  for (const candidate of candidates) {
    const box: BoxArea = {
      x: candidate.x + labelDx,
      y: candidate.y + labelDy,
      width: boxWidth,
      height: boxHeight,
    };

    let score = Math.abs(candidate.x - (horizontal ? segmentCenter.x - boxWidth / 2 : path.labelSegmentStart.x))
      + Math.abs(candidate.y - (horizontal ? path.labelSegmentStart.y - boxHeight - gap : segmentCenter.y - boxHeight / 2));

    for (const card of cards) {
      if (card.id === fromId || card.id === toId) continue;
      if (boxesOverlap(expandBox(box, 8), { x: card.x, y: card.y, width: card.width, height: card.height })) {
        score += 100000;
      }
    }

    for (const placed of routingContext.labels) {
      if (boxesOverlap(expandBox(box, 4), expandBox(placed, 4))) score += 80000;
    }

    for (const segment of [...routingContext.segments, ...currentSegments]) {
      if (segmentHitsBox(segment.start, segment.end, box, 8)) score += 25000;
    }

    if (!best || score < best.score) best = { box, score };
  }

  if (!best || best.score >= 100000) return null;

  return {
    box: best.box,
    textX: best.box.x + best.box.width / 2,
    textY: best.box.y + padY,
    textWidth: Math.max(1, best.box.width - padX * 2),
  };
}

function routeConnector(
  fromCard: CardLayout,
  fromAnchor: string,
  toCard: CardLayout,
  toAnchor: string,
  route: string,
  cards: CardLayout[],
  routingContext: ConnectorRoutingContext,
): ConnectorPath {
  const offset = 30;
  const fromPoint = anchorPoint(fromCard, fromAnchor);
  const toPoint = anchorPoint(toCard, toAnchor);
  const fromOut = nudgePoint(fromPoint, fromAnchor, offset);
  const toOut = nudgePoint(toPoint, toAnchor, offset);

  const candidateRoutes = uniqueRoutes(route === 'auto'
    ? ['auto', 'hvh', 'vhv', 'hv', 'vh']
    : [route, 'hvh', 'vhv', 'hv', 'vh', 'auto']);

  let best: { points: { x: number; y: number }[]; score: number } | null = null;
  for (const candidate of candidateRoutes) {
    const pathCandidates = buildConnectorCandidatePaths(
      candidate,
      fromCard,
      fromAnchor,
      toCard,
      toAnchor,
      fromPoint,
      fromOut,
      toPoint,
      toOut,
      cards,
      routingContext,
    );
    for (const pathCandidate of pathCandidates) {
      const points = simplifyPoints(pathCandidate);
      const score = scoreConnectorPath(points, cards, fromCard.id, toCard.id, routingContext);
      if (!best || score < best.score) best = { points, score };
      if (score === 0) break;
    }
    if (best?.score === 0) break;
  }

  const points = spreadConnectorPath(best?.points ?? [fromPoint, fromOut, toOut, toPoint], routingContext);
  let labelX = (fromPoint.x + toPoint.x) / 2;
  let labelY = (fromPoint.y + toPoint.y) / 2;
  let labelSegmentLength = 0;
  let labelSegmentStart = points[0];
  let labelSegmentEnd = points[points.length - 1];
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const segmentLength = Math.abs(end.x - start.x) + Math.abs(end.y - start.y);
    if (segmentLength > labelSegmentLength) {
      labelSegmentLength = segmentLength;
      labelX = (start.x + end.x) / 2;
      labelY = (start.y + end.y) / 2;
      labelSegmentStart = start;
      labelSegmentEnd = end;
    }
  }

  return { points, labelX, labelY, labelSegmentLength, labelSegmentStart, labelSegmentEnd };
}

function buildConnectorCandidatePaths(
  route: string,
  fromCard: CardLayout,
  fromAnchor: string,
  toCard: CardLayout,
  toAnchor: string,
  fromPoint: { x: number; y: number },
  fromOut: { x: number; y: number },
  toPoint: { x: number; y: number },
  toOut: { x: number; y: number },
  cards: CardLayout[],
  routingContext: ConnectorRoutingContext,
): { x: number; y: number }[][] {
  switch (route) {
    case 'hv':
      return [[fromPoint, fromOut, { x: toOut.x, y: fromOut.y }, toOut, toPoint]];
    case 'vh':
      return [[fromPoint, fromOut, { x: fromOut.x, y: toOut.y }, toOut, toPoint]];
    case 'vhv':
      return chooseMidYCandidates(fromCard, toCard, fromOut.y, toOut.y, fromAnchor, toAnchor, cards, routingContext)
        .map((midY) => [fromPoint, fromOut, { x: fromOut.x, y: midY }, { x: toOut.x, y: midY }, toOut, toPoint]);
    case 'hvh':
      return chooseMidXCandidates(fromCard, toCard, fromOut.x, toOut.x, fromOut.y, toOut.y, fromAnchor, toAnchor, cards, routingContext)
        .map((midX) => [fromPoint, fromOut, { x: midX, y: fromOut.y }, { x: midX, y: toOut.y }, toOut, toPoint]);
    default:
      if (isHorizontalAnchor(fromAnchor) && isHorizontalAnchor(toAnchor)) {
        return chooseMidXCandidates(fromCard, toCard, fromOut.x, toOut.x, fromOut.y, toOut.y, fromAnchor, toAnchor, cards, routingContext)
          .map((midX) => [fromPoint, fromOut, { x: midX, y: fromOut.y }, { x: midX, y: toOut.y }, toOut, toPoint]);
      }
      if (!isHorizontalAnchor(fromAnchor) && !isHorizontalAnchor(toAnchor)) {
        return chooseMidYCandidates(fromCard, toCard, fromOut.y, toOut.y, fromAnchor, toAnchor, cards, routingContext)
          .map((midY) => [fromPoint, fromOut, { x: fromOut.x, y: midY }, { x: toOut.x, y: midY }, toOut, toPoint]);
      }
      if (isHorizontalAnchor(fromAnchor)) {
        return [
          [fromPoint, fromOut, { x: toOut.x, y: fromOut.y }, toOut, toPoint],
          ...chooseMidXCandidates(fromCard, toCard, fromOut.x, toOut.x, fromOut.y, toOut.y, fromAnchor, toAnchor, cards, routingContext)
            .map((midX) => [fromPoint, fromOut, { x: midX, y: fromOut.y }, { x: midX, y: toOut.y }, toOut, toPoint]),
        ];
      }
      return [
        [fromPoint, fromOut, { x: fromOut.x, y: toOut.y }, toOut, toPoint],
        ...chooseMidYCandidates(fromCard, toCard, fromOut.y, toOut.y, fromAnchor, toAnchor, cards, routingContext)
          .map((midY) => [fromPoint, fromOut, { x: fromOut.x, y: midY }, { x: toOut.x, y: midY }, toOut, toPoint]),
      ];
  }
}

function chooseMidXCandidates(
  fromCard: CardLayout,
  toCard: CardLayout,
  fromX: number,
  toX: number,
  fromY: number,
  toY: number,
  fromAnchor: string,
  toAnchor: string,
  cards: CardLayout[],
  routingContext: ConnectorRoutingContext,
): number[] {
  const preferred = chooseFreeCorridor(
    baseMidX(fromX, toX, fromAnchor, toAnchor),
    Math.min(fromX, toX),
    Math.max(fromX, toX),
    buildBlockedIntervalsX(fromCard, toCard, fromY, toY, cards),
  );
  return corridorCandidates(
    preferred,
    Math.min(fromX, toX),
    Math.max(fromX, toX),
    buildBlockedIntervalsX(fromCard, toCard, fromY, toY, cards),
    routingContext.segments
      .filter((segment) => segment.start.x === segment.end.x && overlaps(Math.min(segment.start.y, segment.end.y), Math.max(segment.start.y, segment.end.y), Math.min(fromY, toY), Math.max(fromY, toY)))
      .map((segment) => segment.start.x),
  );
}

function chooseMidYCandidates(
  fromCard: CardLayout,
  toCard: CardLayout,
  fromY: number,
  toY: number,
  fromAnchor: string,
  toAnchor: string,
  cards: CardLayout[],
  routingContext: ConnectorRoutingContext,
): number[] {
  const preferred = chooseFreeCorridor(
    baseMidY(fromY, toY, fromAnchor, toAnchor),
    Math.min(fromY, toY),
    Math.max(fromY, toY),
    buildBlockedIntervalsY(fromCard, toCard, cards),
  );
  return corridorCandidates(
    preferred,
    Math.min(fromY, toY),
    Math.max(fromY, toY),
    buildBlockedIntervalsY(fromCard, toCard, cards),
    routingContext.segments
      .filter((segment) => segment.start.y === segment.end.y && overlaps(Math.min(segment.start.x, segment.end.x), Math.max(segment.start.x, segment.end.x), Math.min(fromCard.x, toCard.x), Math.max(fromCard.x + fromCard.width, toCard.x + toCard.width)))
      .map((segment) => segment.start.y),
  );
}

function buildBlockedIntervalsX(fromCard: CardLayout, toCard: CardLayout, fromY: number, toY: number, cards: CardLayout[]): Array<[number, number]> {
  return cards
    .filter((card) => card.id !== fromCard.id && card.id !== toCard.id)
    .filter((card) => overlaps(card.y - 28, card.y + card.height + 28, Math.min(fromY, toY), Math.max(fromY, toY)))
    .map((card) => [card.x - 28, card.x + card.width + 28] as [number, number]);
}

function buildBlockedIntervalsY(fromCard: CardLayout, toCard: CardLayout, cards: CardLayout[]): Array<[number, number]> {
  return cards
    .filter((card) => card.id !== fromCard.id && card.id !== toCard.id)
    .filter((card) => overlaps(card.x - 28, card.x + card.width + 28, Math.min(fromCard.x, toCard.x), Math.max(fromCard.x + fromCard.width, toCard.x + toCard.width)))
    .map((card) => [card.y - 28, card.y + card.height + 28] as [number, number]);
}

function corridorCandidates(preferred: number, start: number, end: number, blocked: Array<[number, number]>, occupiedCorridors: number[]): number[] {
  const lower = Math.min(start, end) - 28;
  const upper = Math.max(start, end) + 28;
  const merged = mergeIntervals(blocked, lower, upper);
  const gaps: Array<[number, number]> = [];
  let cursor = lower;
  for (const [blockStart, blockEnd] of merged) {
    if (blockStart > cursor) gaps.push([cursor, blockStart]);
    cursor = Math.max(cursor, blockEnd);
  }
  if (cursor < upper) gaps.push([cursor, upper]);

  const values = new Set<number>([
    preferred,
    lower - 72,
    lower - 40,
    upper + 40,
    upper + 72,
    preferred - 56,
    preferred + 56,
    preferred - 92,
    preferred + 92,
  ]);

  for (const [gapStart, gapEnd] of gaps) {
    const width = gapEnd - gapStart;
    if (width <= 0) continue;
    values.add((gapStart + gapEnd) / 2);
    if (width >= 24) {
      values.add(gapStart + 20);
      values.add(gapEnd - 20);
    }
  }

  for (const occupied of occupiedCorridors) {
    values.add(occupied - 36);
    values.add(occupied + 36);
    values.add(occupied - 60);
    values.add(occupied + 60);
  }

  return [...values]
    .map((value) => clamp(value, lower - 120, upper + 120))
    .filter((value, index, array) => array.findIndex((candidate) => Math.abs(candidate - value) < 1) === index)
    .sort((a, b) => Math.abs(a - preferred) - Math.abs(b - preferred));
}

function baseMidX(fromX: number, toX: number, fromAnchor: string, toAnchor: string): number {
  if (fromAnchor === 'right' && toAnchor === 'left' && toX <= fromX) return Math.max(fromX, toX) + 56;
  if (fromAnchor === 'left' && toAnchor === 'right' && toX >= fromX) return Math.min(fromX, toX) - 56;
  return (fromX + toX) / 2;
}

function baseMidY(fromY: number, toY: number, fromAnchor: string, toAnchor: string): number {
  if (fromAnchor === 'bottom' && toAnchor === 'top' && toY <= fromY) return Math.max(fromY, toY) + 48;
  if (fromAnchor === 'top' && toAnchor === 'bottom' && toY >= fromY) return Math.min(fromY, toY) - 48;
  return (fromY + toY) / 2;
}

function chooseFreeCorridor(preferred: number, start: number, end: number, blocked: Array<[number, number]>): number {
  if (!blocked.length) return preferred;
  const lower = Math.min(start, end) - 24;
  const upper = Math.max(start, end) + 24;
  const merged = mergeIntervals(blocked, lower, upper);
  const gaps: Array<[number, number]> = [];
  let cursor = lower;
  for (const [blockStart, blockEnd] of merged) {
    if (blockStart > cursor) gaps.push([cursor, blockStart]);
    cursor = Math.max(cursor, blockEnd);
  }
  if (cursor < upper) gaps.push([cursor, upper]);
  if (!gaps.length) return preferred;

  const viable = gaps.filter(([gapStart, gapEnd]) => gapEnd - gapStart >= 18);
  const candidates = viable.length ? viable : gaps;
  const containing = candidates.find(([gapStart, gapEnd]) => preferred >= gapStart && preferred <= gapEnd);
  if (containing) return preferred;

  return candidates
    .map(([gapStart, gapEnd]) => ({ center: (gapStart + gapEnd) / 2, width: gapEnd - gapStart }))
    .sort((a, b) => Math.abs(a.center - preferred) - Math.abs(b.center - preferred) || b.width - a.width)[0].center;
}

function mergeIntervals(intervals: Array<[number, number]>, minValue: number, maxValue: number): Array<[number, number]> {
  const sorted = intervals
    .map(([start, end]) => [Math.max(minValue, start), Math.min(maxValue, end)] as [number, number])
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (!last || interval[0] > last[1]) merged.push([...interval] as [number, number]);
    else last[1] = Math.max(last[1], interval[1]);
  }
  return merged;
}

function uniqueRoutes(routes: string[]): string[] {
  const seen = new Set<string>();
  return routes.filter((route) => {
    if (seen.has(route)) return false;
    seen.add(route);
    return true;
  });
}

function scoreConnectorPath(points: { x: number; y: number }[], cards: CardLayout[], fromId: string, toId: string, routingContext: ConnectorRoutingContext): number {
  let intersections = 0;
  let length = 0;
  let connectorPenalty = 0;
  let labelPenalty = 0;
  let clearancePenalty = 0;

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    length += Math.abs(end.x - start.x) + Math.abs(end.y - start.y);
    for (const card of cards) {
      if (card.id === fromId || card.id === toId) continue;
      if (segmentHitsCard(start, end, card)) intersections += 1;
      else clearancePenalty += connectorClearancePenalty(start, end, card);
    }
    for (const segment of routingContext.segments) connectorPenalty += scoreSegmentInteraction(start, end, segment.start, segment.end);
    for (const label of routingContext.labels) {
      if (segmentHitsBox(start, end, label, 6)) labelPenalty += 1;
    }
  }

  return intersections * 100000 + labelPenalty * 40000 + connectorPenalty + clearancePenalty + length + Math.max(0, points.length - 2) * 28;
}

function segmentHitsCard(start: { x: number; y: number }, end: { x: number; y: number }, card: CardLayout): boolean {
  const left = card.x + 2;
  const right = card.x + card.width - 2;
  const top = card.y + 2;
  const bottom = card.y + card.height - 2;
  if (start.y === end.y) {
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    return start.y > top && start.y < bottom && maxX > left && minX < right;
  }
  if (start.x === end.x) {
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);
    return start.x > left && start.x < right && maxY > top && minY < bottom;
  }
  return false;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return Math.min(aEnd, bEnd) - Math.max(aStart, bStart) > 0;
}

function spreadConnectorPath(points: { x: number; y: number }[], routingContext: ConnectorRoutingContext): { x: number; y: number }[] {
  if (points.length < 5 || !routingContext.segments.length) return points;
  const adjusted = points.map((point) => ({ ...point }));
  const minimumSpacing = 34;

  for (let index = 1; index < adjusted.length - 2; index += 1) {
    const start = adjusted[index];
    const end = adjusted[index + 1];
    if (start.x !== end.x && start.y !== end.y) continue;

    let requiredShift = 0;
    for (const existing of routingContext.segments) {
      if (start.x === end.x && existing.start.x === existing.end.x) {
        const delta = Math.abs(start.x - existing.start.x);
        const overlapLength = rangeOverlapLength(start.y, end.y, existing.start.y, existing.end.y);
        if (delta < minimumSpacing && overlapLength > 0) requiredShift = Math.max(requiredShift, minimumSpacing - delta + 6);
      }
      if (start.y === end.y && existing.start.y === existing.end.y) {
        const delta = Math.abs(start.y - existing.start.y);
        const overlapLength = rangeOverlapLength(start.x, end.x, existing.start.x, existing.end.x);
        if (delta < minimumSpacing && overlapLength > 0) requiredShift = Math.max(requiredShift, minimumSpacing - delta + 6);
      }
    }

    if (requiredShift <= 0) continue;
    if (start.x === end.x) {
      const before = adjusted[index - 1];
      const after = adjusted[index + 2];
      const center = (before.x + after.x) / 2;
      const direction = start.x <= center ? -1 : 1;
      adjusted[index] = { x: adjusted[index].x + direction * requiredShift, y: adjusted[index].y };
      adjusted[index + 1] = { x: adjusted[index + 1].x + direction * requiredShift, y: adjusted[index + 1].y };
    } else {
      const before = adjusted[index - 1];
      const after = adjusted[index + 2];
      const center = (before.y + after.y) / 2;
      const direction = start.y <= center ? -1 : 1;
      adjusted[index] = { x: adjusted[index].x, y: adjusted[index].y + direction * requiredShift };
      adjusted[index + 1] = { x: adjusted[index + 1].x, y: adjusted[index + 1].y + direction * requiredShift };
    }
  }

  return simplifyPoints(adjusted);
}

function segmentHitsBox(start: { x: number; y: number }, end: { x: number; y: number }, box: BoxArea, padding = 0): boolean {
  const expanded = expandBox(box, padding);
  if (start.y === end.y) {
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    return start.y >= expanded.y && start.y <= expanded.y + expanded.height && maxX >= expanded.x && minX <= expanded.x + expanded.width;
  }
  if (start.x === end.x) {
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);
    return start.x >= expanded.x && start.x <= expanded.x + expanded.width && maxY >= expanded.y && minY <= expanded.y + expanded.height;
  }
  return false;
}

function expandBox(box: BoxArea, padding: number): BoxArea {
  return {
    x: box.x - padding,
    y: box.y - padding,
    width: box.width + padding * 2,
    height: box.height + padding * 2,
  };
}

function connectorClearancePenalty(start: { x: number; y: number }, end: { x: number; y: number }, card: CardLayout): number {
  const padded = { x: card.x - 12, y: card.y - 12, width: card.width + 24, height: card.height + 24 };
  return segmentHitsBox(start, end, padded, 0) ? 1200 : 0;
}

function scoreSegmentInteraction(startA: { x: number; y: number }, endA: { x: number; y: number }, startB: { x: number; y: number }, endB: { x: number; y: number }): number {
  if (startA.x === endA.x && startB.x === endB.x) {
    const delta = Math.abs(startA.x - startB.x);
    const overlapLength = rangeOverlapLength(startA.y, endA.y, startB.y, endB.y);
    if (delta < 1 && overlapLength > 0) return 90000 + overlapLength * 18;
    if (delta < 24 && overlapLength > 0) return 22000 + Math.round((24 - delta) * overlapLength * 1.5);
    return 0;
  }
  if (startA.y === endA.y && startB.y === endB.y) {
    const delta = Math.abs(startA.y - startB.y);
    const overlapLength = rangeOverlapLength(startA.x, endA.x, startB.x, endB.x);
    if (delta < 1 && overlapLength > 0) return 90000 + overlapLength * 18;
    if (delta < 24 && overlapLength > 0) return 22000 + Math.round((24 - delta) * overlapLength * 1.5);
    return 0;
  }
  if (segmentsCrossOrthogonally(startA, endA, startB, endB)) return 6000;
  return 0;
}

function segmentsCrossOrthogonally(startA: { x: number; y: number }, endA: { x: number; y: number }, startB: { x: number; y: number }, endB: { x: number; y: number }): boolean {
  if (startA.y === endA.y && startB.x === endB.x) {
    return betweenInclusive(startB.x, startA.x, endA.x) && betweenInclusive(startA.y, startB.y, endB.y);
  }
  if (startA.x === endA.x && startB.y === endB.y) {
    return betweenInclusive(startA.x, startB.x, endB.x) && betweenInclusive(startB.y, startA.y, endA.y);
  }
  return false;
}

function rangeOverlapLength(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(Math.max(aStart, aEnd), Math.max(bStart, bEnd)) - Math.max(Math.min(aStart, aEnd), Math.min(bStart, bEnd)));
}

function betweenInclusive(value: number, start: number, end: number): boolean {
  return value >= Math.min(start, end) && value <= Math.max(start, end);
}

function boxCenter(box: BoxArea): { x: number; y: number } {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

function pathSegments(points: { x: number; y: number }[], connectorId: string): ConnectorSegmentObstacle[] {
  const segments: ConnectorSegmentObstacle[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    segments.push({ start: points[index], end: points[index + 1], connectorId });
  }
  return segments;
}

function simplifyPoints(points: { x: number; y: number }[]): { x: number; y: number }[] {
  const deduped = points.filter((point, index) => index === 0 || point.x !== points[index - 1].x || point.y !== points[index - 1].y);
  if (deduped.length <= 2) return deduped;
  const simplified = [deduped[0]];
  for (let index = 1; index < deduped.length - 1; index += 1) {
    const prev = simplified[simplified.length - 1];
    const current = deduped[index];
    const next = deduped[index + 1];
    const isCollinear = (prev.x === current.x && current.x === next.x) || (prev.y === current.y && current.y === next.y);
    if (!isCollinear) simplified.push(current);
  }
  simplified.push(deduped[deduped.length - 1]);
  return simplified;
}

function anchorPoint(card: CardLayout, anchor: string): { x: number; y: number } {
  switch (anchor) {
    case 'top': return { x: card.x + card.width / 2, y: card.y };
    case 'bottom': return { x: card.x + card.width / 2, y: card.y + card.height };
    case 'left': return { x: card.x, y: card.y + card.height / 2 };
    case 'right':
    default:
      return { x: card.x + card.width, y: card.y + card.height / 2 };
  }
}

function nudgePoint(point: { x: number; y: number }, anchor: string, distance: number): { x: number; y: number } {
  switch (anchor) {
    case 'top': return { x: point.x, y: point.y - distance };
    case 'bottom': return { x: point.x, y: point.y + distance };
    case 'left': return { x: point.x - distance, y: point.y };
    case 'right':
    default:
      return { x: point.x + distance, y: point.y };
  }
}

function isHorizontalAnchor(anchor: string): boolean {
  return anchor === 'left' || anchor === 'right';
}

function parseAnchorRef(value: string): { cardId: string; anchor: string } | null {
  if (!value) return null;
  const [cardId, anchor = 'right'] = value.split('.');
  if (!cardId) return null;
  return { cardId, anchor };
}

function boxesOverlap(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
