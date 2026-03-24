import { DiagramElement, Expression } from '../ast/types';
import { GSValue, Trace } from '../runtime/values';
import { asStringArray, readNumber, readString, resolveValue, wrapText } from './common';

const ZERO_LOC = {
  start: { line: 0, column: 0, offset: 0 },
  end: { line: 0, column: 0, offset: 0 },
};

const SEMANTIC_TYPES = new Set(['header', 'separator', 'lane', 'card', 'connector', 'loop_label']);

interface SemanticCompileResult {
  elements: DiagramElement[];
  minWidth: number;
  minHeight: number;
  hasSemantic: boolean;
}

interface LaneSpec {
  id: string;
  section: string;
  order: number;
  columns: number;
  gapX: number;
  gapY: number;
  padding: number;
  frame: { x: number; y: number; w: number; h: number };
  accent: string;
}

interface CardLayout {
  id: string;
  section: string;
  row: number;
  col: number;
  span: number;
  width: number;
  height: number;
  x: number;
  y: number;
  laneId: string;
  compiled: DiagramElement;
}

interface ConnectorPath {
  points: { x: number; y: number }[];
  labelX: number;
  labelY: number;
}

interface ChildMeasurement {
  width: number;
  height: number;
  lines?: string[];
}

export function compileSemanticDiagram(
  elements: DiagramElement[],
  values: Record<string, GSValue>,
  traces: Map<string, Trace>,
  width: number,
  height: number,
): SemanticCompileResult {
  const hasSemantic = elements.some((element) => SEMANTIC_TYPES.has(element.type));
  if (!hasSemantic) {
    return { elements, minWidth: width, minHeight: height, hasSemantic: false };
  }

  const semantic = elements.filter((element) => SEMANTIC_TYPES.has(element.type));
  const plain = elements.filter((element) => !SEMANTIC_TYPES.has(element.type));

  const header = semantic.find((element) => element.type === 'header');
  const separator = semantic.find((element) => element.type === 'separator');
  const loopLabel = semantic.find((element) => element.type === 'loop_label');
  const laneElements = semantic.filter((element) => element.type === 'lane');
  const cardElements = semantic.filter((element) => element.type === 'card');
  const connectorElements = semantic.filter((element) => element.type === 'connector');

  const outerPadX = 36;
  const outerPadBottom = 42;
  const topPad = header ? 20 : 30;
  const contentX = outerPadX;
  const contentWidth = Math.max(760, width - outerPadX * 2);

  const compiled: DiagramElement[] = [];
  let cursorY = topPad;

  if (header) {
    const headerHeight = Math.max(56, getNumber(header, values, traces, 'h', 64));
    const fill = getString(header, values, traces, 'fill', '#173f76');
    const stroke = getString(header, values, traces, 'stroke', fill);
    const title = getString(header, values, traces, 'title', getString(header, values, traces, 'label', header.name));
    const color = getString(header, values, traces, 'color', '#ffffff');
    const size = getNumber(header, values, traces, 'size', 22);

    compiled.push(element('box', `${header.name}-bg`, {
      x: contentX,
      y: cursorY,
      w: contentWidth,
      h: headerHeight,
      label: '',
      fill,
      stroke,
      radius: getNumber(header, values, traces, 'radius', 0),
      shadow: false,
    }));
    compiled.push(element('text', `${header.name}-title`, {
      x: width / 2,
      y: cursorY + headerHeight / 2 + size * 0.18,
      anchor: 'middle',
      value: title,
      size,
      weight: getString(header, values, traces, 'weight', '800'),
      color,
    }));
    cursorY += headerHeight + getNumber(header, values, traces, 'gap', 24);
  }

  const lanes = resolveLanes(laneElements, separator, values, traces, contentX, cursorY, contentWidth, height);
  const separatorHeight = separator ? Math.max(38, getNumber(separator, values, traces, 'h', 44)) : 0;
  if (separator) {
    const labelY = cursorY + 18;
    const color = getString(separator, values, traces, 'color', '#333333');
    const size = getNumber(separator, values, traces, 'size', 22);
    lanes.forEach((lane) => {
      compiled.push(element('text', `${separator.name}-${lane.id}-label`, {
        x: lane.frame.x + lane.frame.w / 2,
        y: labelY,
        anchor: 'middle',
        value: resolveLaneLabel(lane, separator, values, traces),
        size,
        weight: getString(separator, values, traces, 'weight', '800'),
        color,
      }));
    });
    cursorY += separatorHeight + getNumber(separator, values, traces, 'gap', 26);
  }

  const laneTop = cursorY;
  lanes.forEach((lane) => {
    lane.frame.y = laneTop;
    lane.frame.h = Math.max(0, lane.frame.h - laneTop);
  });

  const cards = layoutCards(cardElements, lanes, values, traces);
  const contentBottom = Math.max(laneTop, ...cards.map((card) => card.y + card.height)) + 18;

  if (separator) {
    const separatorStroke = getString(separator, values, traces, 'stroke', '#a0a0a0');
    const dash = getString(separator, values, traces, 'dash', '10 12');
    const strokeWidth = getNumber(separator, values, traces, 'strokeWidth', 3);
    lanes.slice(0, -1).forEach((lane, index) => {
      const dividerX = lane.frame.x + lane.frame.w;
      compiled.push(element('line', `${separator.name}-divider-${index + 1}`, {
        x: dividerX,
        y: cursorY - separatorHeight + 6,
        x2: dividerX,
        y2: contentBottom,
        stroke: separatorStroke,
        strokeWidth,
        dash,
        strokeOpacity: getNumber(separator, values, traces, 'strokeOpacity', 0.6),
      }));
    });
  }

  if (loopLabel) {
    compiled.push(element('text', `${loopLabel.name}-text`, {
      x: width / 2,
      y: (laneTop + contentBottom) / 2,
      anchor: 'middle',
      value: getString(loopLabel, values, traces, 'value', loopLabel.name),
      size: getNumber(loopLabel, values, traces, 'size', 38),
      weight: getString(loopLabel, values, traces, 'weight', '800'),
      color: getString(loopLabel, values, traces, 'color', '#e0e0e0'),
    }));
  }

  compiled.push(...cards.map((card) => card.compiled));

  const cardMap = new Map(cards.map((card) => [card.id, card]));
  connectorElements.forEach((connector) => {
    compiled.push(...compileConnector(connector, cardMap, values, traces));
  });

  return {
    elements: [...compiled, ...plain],
    minWidth: width,
    minHeight: Math.max(height, contentBottom + outerPadBottom),
    hasSemantic: true,
  };
}

function resolveLanes(
  laneElements: DiagramElement[],
  separator: DiagramElement | undefined,
  values: Record<string, GSValue>,
  traces: Map<string, Trace>,
  contentX: number,
  cursorY: number,
  contentWidth: number,
  height: number,
): LaneSpec[] {
  const base = laneElements.map((element, index) => ({
    id: element.name,
    section: getString(element, values, traces, 'section', element.name),
    order: getNumber(element, values, traces, 'order', index + 1),
    columns: Math.max(1, getNumber(element, values, traces, 'columns', 1)),
    gapX: getNumber(element, values, traces, 'gap_x', getNumber(element, values, traces, 'gap', 30)),
    gapY: getNumber(element, values, traces, 'gap_y', getNumber(element, values, traces, 'gap', 30)),
    padding: getNumber(element, values, traces, 'padding', 18),
    accent: getString(element, values, traces, 'accent', '#cbd5e1'),
  })).sort((a, b) => a.order - b.order);

  const labels = separator ? asStringArray(resolveValue(separator.properties.labels, values, traces)) : [];
  const laneCount = Math.max(1, base.length || labels.length || 1);
  const frameWidth = contentWidth / laneCount;

  const lanes = (base.length ? base : Array.from({ length: laneCount }, (_, index) => ({
    id: `lane-${index + 1}`,
    section: `lane-${index + 1}`,
    order: index + 1,
    columns: 1,
    gapX: 30,
    gapY: 30,
    padding: 18,
    accent: '#cbd5e1',
  }))).map((lane, index) => ({
    ...lane,
    frame: {
      x: contentX + index * frameWidth,
      y: cursorY,
      w: frameWidth,
      h: height - cursorY,
    },
  }));

  return lanes;
}

function resolveLaneLabel(
  lane: LaneSpec,
  separator: DiagramElement,
  values: Record<string, GSValue>,
  traces: Map<string, Trace>,
): string {
  const labels = asStringArray(resolveValue(separator.properties.labels, values, traces));
  return labels[lane.order - 1] ?? lane.section;
}

function layoutCards(
  cardElements: DiagramElement[],
  lanes: LaneSpec[],
  values: Record<string, GSValue>,
  traces: Map<string, Trace>,
): CardLayout[] {
  const cards: CardLayout[] = [];

  lanes.forEach((lane) => {
    const laneCards = cardElements
      .filter((card) => getString(card, values, traces, 'section', '') === lane.section)
      .sort((a, b) => {
        const rowDiff = getNumber(a, values, traces, 'row', 1) - getNumber(b, values, traces, 'row', 1);
        if (rowDiff !== 0) return rowDiff;
        return getNumber(a, values, traces, 'col', 1) - getNumber(b, values, traces, 'col', 1);
      });

    if (!laneCards.length) return;

    const innerX = lane.frame.x + lane.padding;
    const innerW = lane.frame.w - lane.padding * 2;
    const columnWidth = (innerW - lane.gapX * (lane.columns - 1)) / lane.columns;
    const rowHeights = new Map<number, number>();
    const measured = laneCards.map((card) => {
      const row = Math.max(1, getNumber(card, values, traces, 'row', 1));
      const col = Math.max(1, getNumber(card, values, traces, 'col', 1));
      const span = Math.max(1, Math.min(lane.columns - col + 1, getNumber(card, values, traces, 'span', 1)));
      const width = readNumber(resolveValue(card.properties.w, values, traces), columnWidth * span + lane.gapX * (span - 1));
      const measurement = measureCard(card, width, values, traces);
      rowHeights.set(row, Math.max(rowHeights.get(row) ?? 0, measurement.height));
      return { card, row, col, span, width, height: measurement.height, compiledChildren: measurement.children };
    });

    const sortedRows = [...new Set(measured.map((entry) => entry.row))].sort((a, b) => a - b);
    const rowY = new Map<number, number>();
    let cursorY = lane.frame.y + 8;
    sortedRows.forEach((row) => {
      rowY.set(row, cursorY);
      cursorY += (rowHeights.get(row) ?? 0) + lane.gapY;
    });

    measured.forEach((entry) => {
      const x = innerX + (entry.col - 1) * (columnWidth + lane.gapX) + Math.max(0, ((columnWidth * entry.span + lane.gapX * (entry.span - 1)) - entry.width) / 2);
      const y = rowY.get(entry.row) ?? lane.frame.y;
      const compiled = compileMeasuredCard(entry.card, x, y, entry.width, entry.height, entry.compiledChildren, values, traces);
      cards.push({
        id: entry.card.name,
        section: lane.section,
        row: entry.row,
        col: entry.col,
        span: entry.span,
        width: entry.width,
        height: entry.height,
        x,
        y,
        laneId: lane.id,
        compiled,
      });
    });
  });

  return cards;
}

function measureCard(
  card: DiagramElement,
  width: number,
  values: Record<string, GSValue>,
  traces: Map<string, Trace>,
): { height: number; children: DiagramElement[] } {
  const padding = getNumber(card, values, traces, 'padding', 22);
  const layout = getString(card, values, traces, 'layout', 'stack');
  const gap = getNumber(card, values, traces, 'gap', 16);
  const label = getString(card, values, traces, 'label', card.name);
  const subtitle = getString(card, values, traces, 'subtitle', '');
  const titleSize = getNumber(card, values, traces, 'size', 18);
  const titleLines = label ? wrapText(label, Math.max(10, Math.floor((width - 40) / 11)), 3) : [];
  const subtitleLines = subtitle ? wrapText(subtitle, Math.max(12, Math.floor((width - 42) / 12)), 4) : [];
  const headerHeight = estimateCardHeaderHeight(titleLines.length, subtitleLines.length, titleSize);

  const compiledChildren = autoLayoutCardChildren(card, width, headerHeight, padding, gap, layout, values, traces);
  const bodyBottom = compiledChildren.reduce((max, child) => {
    const y = readNumber(resolveValue(child.properties.y, values, traces), 0);
    const h = readNumber(resolveValue(child.properties.h, values, traces), 0);
    if (h > 0) return Math.max(max, y + h);
    if (child.type === 'text') {
      const size = getNumber(child, values, traces, 'size', 16);
      const value = getString(child, values, traces, 'value', child.name);
      const lineCount = value.split(/\n/g).length;
      return Math.max(max, y + lineCount * (size + 4));
    }
    return Math.max(max, y);
  }, headerHeight);

  return {
    height: Math.max(getNumber(card, values, traces, 'min_h', 0), bodyBottom + padding),
    children: compiledChildren,
  };
}

function compileMeasuredCard(
  card: DiagramElement,
  x: number,
  y: number,
  w: number,
  h: number,
  children: DiagramElement[],
  values: Record<string, GSValue>,
  traces: Map<string, Trace>,
): DiagramElement {
  const fill = getString(card, values, traces, 'fill', '#ffffff');
  const stroke = getString(card, values, traces, 'stroke', '#cbd5e1');
  return element('panel', card.name, {
    x,
    y,
    w,
    h,
    label: getString(card, values, traces, 'label', card.name),
    subtitle: getString(card, values, traces, 'subtitle', ''),
    fill,
    stroke,
    radius: getNumber(card, values, traces, 'radius', 18),
    shadow: false,
    strokeWidth: getNumber(card, values, traces, 'strokeWidth', 1.8),
    dash: getString(card, values, traces, 'dash', ''),
  }, children);
}

function autoLayoutCardChildren(
  card: DiagramElement,
  width: number,
  headerHeight: number,
  padding: number,
  gap: number,
  layout: string,
  values: Record<string, GSValue>,
  traces: Map<string, Trace>,
): DiagramElement[] {
  const children = card.children ?? [];
  if (!children.length) return [];

  const innerWidth = Math.max(80, width - padding * 2);
  if (layout === 'row') {
    const measured = children.map((child) => ({
      child,
      box: measureChild(child, innerWidth, values, traces),
    }));
    const totalWidth = measured.reduce((sum, entry) => sum + entry.box.width, 0) + Math.max(0, measured.length - 1) * gap;
    const rowHeight = Math.max(...measured.map((entry) => entry.box.height), 40);
    let cursorX = Math.max(padding, (width - totalWidth) / 2);
    return measured.map((entry) => {
      const y = headerHeight + padding + (rowHeight - entry.box.height) / 2;
      const laidOut = layoutChild(entry.child, cursorX, y, entry.box, width, values, traces);
      cursorX += entry.box.width + gap;
      return laidOut;
    });
  }

  let cursorY = headerHeight + padding;
  return children.map((child) => {
    const box = measureChild(child, innerWidth, values, traces);
    const x = resolveChildX(child, box.width, width, padding, values, traces);
    const laidOut = layoutChild(child, x, cursorY, box, width, values, traces);
    cursorY += box.height + gap;
    return laidOut;
  });
}

function measureChild(
  child: DiagramElement,
  maxWidth: number,
  values: Record<string, GSValue>,
  traces: Map<string, Trace>,
): ChildMeasurement {
  switch (child.type) {
    case 'text': {
      const size = getNumber(child, values, traces, 'size', 16);
      const value = getString(child, values, traces, 'value', child.name);
      const lines = wrapValueByWidth(value, maxWidth, size);
      const longest = Math.max(...lines.map((line) => line.length), 1);
      return {
        width: Math.min(maxWidth, longest * size * 0.64 + 12),
        height: lines.length * (size + 4),
        lines,
      };
    }
    case 'formula': {
      const size = getNumber(child, values, traces, 'size', 22);
      const value = getString(child, values, traces, 'value', child.name);
      return {
        width: Math.min(maxWidth, Math.max(120, value.length * size * 0.66 + 16)),
        height: size * 1.5,
      };
    }
    case 'image': {
      const width = readNumber(resolveValue(child.properties.w, values, traces), Math.min(maxWidth, 180));
      const height = readNumber(resolveValue(child.properties.h, values, traces), 82);
      return { width, height };
    }
    default: {
      const width = readNumber(resolveValue(child.properties.w, values, traces), Math.min(maxWidth, 160));
      const height = readNumber(resolveValue(child.properties.h, values, traces), 36);
      return { width, height };
    }
  }
}

function layoutChild(
  child: DiagramElement,
  x: number,
  y: number,
  box: ChildMeasurement,
  cardWidth: number,
  values: Record<string, GSValue>,
  traces: Map<string, Trace>,
): DiagramElement {
  if (child.type === 'text') {
    const value = getString(child, values, traces, 'value', child.name);
    const align = getString(child, values, traces, 'align', 'center');
    return cloneElement(child, {
      x: align === 'start' ? x : align === 'end' ? x + box.width : x + box.width / 2,
      y,
      w: box.width,
      h: box.height,
      value: box.lines?.join('\n') ?? value,
      anchor: align === 'start' ? 'start' : align === 'end' ? 'end' : 'middle',
    });
  }

  if (child.type === 'formula') {
    return cloneElement(child, {
      x: x + box.width / 2,
      y: y + box.height * 0.74,
      w: box.width,
      h: box.height,
    });
  }

  if (child.type === 'image') {
    return cloneElement(child, {
      x,
      y,
      w: box.width,
      h: box.height,
    });
  }

  return cloneElement(child, {
    x,
    y,
    w: box.width,
    h: box.height,
  });
}

function resolveChildX(
  child: DiagramElement,
  childWidth: number,
  cardWidth: number,
  padding: number,
  values: Record<string, GSValue>,
  traces: Map<string, Trace>,
): number {
  const align = getString(child, values, traces, 'align', child.type === 'text' ? 'center' : 'center');
  if (align === 'start') return padding;
  if (align === 'end') return Math.max(padding, cardWidth - padding - childWidth);
  return Math.max(padding, (cardWidth - childWidth) / 2);
}

function estimateCardHeaderHeight(titleLineCount: number, subtitleLineCount: number, titleSize: number): number {
  if (titleLineCount === 0 && subtitleLineCount === 0) return 18;
  const titleHeight = titleLineCount * 20;
  const subtitleHeight = subtitleLineCount ? 10 + subtitleLineCount * 16 : 0;
  return Math.max(44, 22 + titleHeight + subtitleHeight + Math.max(0, titleSize - 18) * 0.2);
}

function wrapValueByWidth(value: string, maxWidth: number, size: number): string[] {
  const maxChars = Math.max(8, Math.floor(maxWidth / Math.max(size * 0.62, 1)));
  return value
    .split(/\n/g)
    .flatMap((line) => wrapText(line, maxChars, 5));
}

function compileConnector(
  connector: DiagramElement,
  cardMap: Map<string, CardLayout>,
  values: Record<string, GSValue>,
  traces: Map<string, Trace>,
): DiagramElement[] {
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
  const labelDy = getNumber(connector, values, traces, 'label_dy', -8);

  const path = routeConnector(fromCard, fromRef.anchor, toCard, toRef.anchor, route);
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
    }));
  }

  if (label) {
    segments.push(element('text', `${connector.name}-label`, {
      x: path.labelX + labelDx,
      y: path.labelY + labelDy,
      anchor: 'middle',
      value: label,
      size: getNumber(connector, values, traces, 'size', 15),
      weight: getString(connector, values, traces, 'weight', '700'),
      color: getString(connector, values, traces, 'color', stroke),
    }));
  }

  return segments;
}

function routeConnector(fromCard: CardLayout, fromAnchor: string, toCard: CardLayout, toAnchor: string, route: string): ConnectorPath {
  const offset = 24;
  const fromPoint = anchorPoint(fromCard, fromAnchor);
  const toPoint = anchorPoint(toCard, toAnchor);
  const fromOut = nudgePoint(fromPoint, fromAnchor, offset);
  const toOut = nudgePoint(toPoint, toAnchor, offset);

  let points: { x: number; y: number }[];
  switch (route) {
    case 'hv':
      points = [fromPoint, fromOut, { x: toOut.x, y: fromOut.y }, toOut, toPoint];
      break;
    case 'vh':
      points = [fromPoint, fromOut, { x: fromOut.x, y: toOut.y }, toOut, toPoint];
      break;
    case 'vhv': {
      const midY = chooseMidY(fromOut.y, toOut.y, fromAnchor, toAnchor);
      points = [fromPoint, fromOut, { x: fromOut.x, y: midY }, { x: toOut.x, y: midY }, toOut, toPoint];
      break;
    }
    case 'hvh': {
      const midX = chooseMidX(fromOut.x, toOut.x, fromAnchor, toAnchor);
      points = [fromPoint, fromOut, { x: midX, y: fromOut.y }, { x: midX, y: toOut.y }, toOut, toPoint];
      break;
    }
    default:
      if (isHorizontalAnchor(fromAnchor) && isHorizontalAnchor(toAnchor)) {
        const midX = chooseMidX(fromOut.x, toOut.x, fromAnchor, toAnchor);
        points = [fromPoint, fromOut, { x: midX, y: fromOut.y }, { x: midX, y: toOut.y }, toOut, toPoint];
      } else if (!isHorizontalAnchor(fromAnchor) && !isHorizontalAnchor(toAnchor)) {
        const midY = chooseMidY(fromOut.y, toOut.y, fromAnchor, toAnchor);
        points = [fromPoint, fromOut, { x: fromOut.x, y: midY }, { x: toOut.x, y: midY }, toOut, toPoint];
      } else if (isHorizontalAnchor(fromAnchor)) {
        points = [fromPoint, fromOut, { x: toOut.x, y: fromOut.y }, toOut, toPoint];
      } else {
        points = [fromPoint, fromOut, { x: fromOut.x, y: toOut.y }, toOut, toPoint];
      }
      break;
  }

  points = simplifyPoints(points);

  const middleIndex = Math.max(0, Math.floor((points.length - 2) / 2));
  const labelStart = points[middleIndex];
  const labelEnd = points[middleIndex + 1];
  return {
    points,
    labelX: (labelStart.x + labelEnd.x) / 2,
    labelY: (labelStart.y + labelEnd.y) / 2,
  };
}

function chooseMidX(fromX: number, toX: number, fromAnchor: string, toAnchor: string): number {
  if (fromAnchor === 'right' && toAnchor === 'left' && toX <= fromX) return Math.max(fromX, toX) + 36;
  if (fromAnchor === 'left' && toAnchor === 'right' && toX >= fromX) return Math.min(fromX, toX) - 36;
  return (fromX + toX) / 2;
}

function chooseMidY(fromY: number, toY: number, fromAnchor: string, toAnchor: string): number {
  if (fromAnchor === 'bottom' && toAnchor === 'top' && toY <= fromY) return Math.max(fromY, toY) + 36;
  if (fromAnchor === 'top' && toAnchor === 'bottom' && toY >= fromY) return Math.min(fromY, toY) - 36;
  return (fromY + toY) / 2;
}

function simplifyPoints(points: { x: number; y: number }[]): { x: number; y: number }[] {
  const deduped = points.filter((point, index) =>
    index === 0 || point.x !== points[index - 1].x || point.y !== points[index - 1].y,
  );

  if (deduped.length <= 2) return deduped;

  const simplified: { x: number; y: number }[] = [deduped[0]];
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
    case 'top':
      return { x: card.x + card.width / 2, y: card.y };
    case 'bottom':
      return { x: card.x + card.width / 2, y: card.y + card.height };
    case 'left':
      return { x: card.x, y: card.y + card.height / 2 };
    case 'right':
    default:
      return { x: card.x + card.width, y: card.y + card.height / 2 };
  }
}

function nudgePoint(point: { x: number; y: number }, anchor: string, distance: number): { x: number; y: number } {
  switch (anchor) {
    case 'top':
      return { x: point.x, y: point.y - distance };
    case 'bottom':
      return { x: point.x, y: point.y + distance };
    case 'left':
      return { x: point.x - distance, y: point.y };
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

function cloneElement(elementToClone: DiagramElement, additions: Record<string, string | number | boolean>): DiagramElement {
  return {
    ...elementToClone,
    properties: {
      ...elementToClone.properties,
      ...Object.fromEntries(Object.entries(additions).map(([key, value]) => [key, expr(value)])),
    },
  };
}

function element(type: string, name: string, props: Record<string, string | number | boolean>, children?: DiagramElement[]): DiagramElement {
  return {
    type,
    name,
    properties: Object.fromEntries(Object.entries(props).map(([key, value]) => [key, expr(value)])),
    ...(children?.length ? { children } : {}),
  };
}

function expr(value: string | number | boolean): Expression {
  return { type: 'Literal', value, location: ZERO_LOC };
}

function getString(element: DiagramElement, values: Record<string, GSValue>, traces: Map<string, Trace>, key: string, fallback = ''): string {
  return readString(resolveValue(element.properties[key], values, traces), fallback);
}

function getNumber(element: DiagramElement, values: Record<string, GSValue>, traces: Map<string, Trace>, key: string, fallback = 0): number {
  return readNumber(resolveValue(element.properties[key], values, traces), fallback);
}
