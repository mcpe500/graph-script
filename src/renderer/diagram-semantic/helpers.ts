import { DiagramElement, Expression } from '../../ast/types';
import { GSValue, Trace } from '../../runtime/values';
import { asNumberArray, asStringArray, readBoolean, readNumber, readString, resolveValue } from '../common';
import {
  CHILD_GAP_MIN,
  ContainerOptions,
  Frame,
  LaneSpec,
  SEMANTIC_TYPES,
  CONTAINER_TYPES,
  ZERO_LOC,
} from './types';

export function resolveLanes(
  laneElements: DiagramElement[],
  separator: DiagramElement | undefined,
  values: Record<string, GSValue>,
  traces: Map<string, Trace>,
  contentX: number,
  cursorY: number,
  contentWidth: number,
  height: number,
): LaneSpec[] {
  const base = laneElements.map((element, index) => {
    const columns = Math.max(1, getNumber(element, values, traces, 'columns', 1));
    return {
      id: element.name,
      section: getString(element, values, traces, 'section', element.name),
      order: getNumber(element, values, traces, 'order', index + 1),
      ratio: Math.max(0.15, getNumber(element, values, traces, 'ratio', 1)),
      columns,
      columnRatios: normalizeColumnRatios(asNumberArray(resolveValue(element.properties.column_ratios, values, traces)), columns),
      gapX: Math.max(24, getNumber(element, values, traces, 'gap_x', getNumber(element, values, traces, 'gap', 30))),
      gapY: Math.max(24, getNumber(element, values, traces, 'gap_y', getNumber(element, values, traces, 'gap', 30))),
      padding: Math.max(20, getNumber(element, values, traces, 'padding', 24)),
    };
  }).sort((a, b) => a.order - b.order);

  const labels = separator ? asStringArray(resolveValue(separator.properties.labels, values, traces)) : [];
  const laneCount = Math.max(1, base.length || labels.length || 1);
  const lanes = (base.length
    ? base
    : Array.from({ length: laneCount }, (_, index) => ({
        id: `lane-${index + 1}`,
        section: `lane-${index + 1}`,
        order: index + 1,
        ratio: 1,
        columns: 1,
        columnRatios: [1],
        gapX: 28,
        gapY: 28,
        padding: 24,
      })));
  const totalRatio = lanes.reduce((sum, lane) => sum + lane.ratio, 0) || laneCount;

  let cursorX = contentX;
  return lanes.map((lane) => {
    const frameWidth = contentWidth * (lane.ratio / totalRatio);
    const frame: Frame = { x: cursorX, y: cursorY, w: frameWidth, h: height - cursorY };
    cursorX += frameWidth;
    return { ...lane, frame };
  });
}

export function resolveLaneLabel(
  lane: LaneSpec,
  separator: DiagramElement,
  values: Record<string, GSValue>,
  traces: Map<string, Trace>,
): string {
  const labels = asStringArray(resolveValue(separator.properties.labels, values, traces));
  return labels[lane.order - 1] ?? lane.section;
}

export function normalizeColumnRatios(raw: number[], columns: number): number[] {
  if (!raw.length) return Array.from({ length: columns }, () => 1);
  const normalized = Array.from({ length: columns }, (_, index) => Math.max(0.2, raw[index] ?? 1));
  return normalized;
}

export function computeColumnWidths(lane: LaneSpec, innerWidth: number): number[] {
  const totalRatio = lane.columnRatios.reduce((sum, value) => sum + value, 0) || lane.columns;
  const availableWidth = innerWidth - lane.gapX * Math.max(0, lane.columns - 1);
  return lane.columnRatios.map((ratio) => availableWidth * (ratio / totalRatio));
}

export function getColumnX(columnWidths: number[], gapX: number, colIndex: number): number {
  let x = 0;
  for (let index = 0; index < colIndex; index += 1) {
    x += columnWidths[index] + gapX;
  }
  return x;
}

export function getSlotWidth(columnWidths: number[], gapX: number, colIndex: number, span: number): number {
  let width = 0;
  for (let index = colIndex; index < Math.min(columnWidths.length, colIndex + span); index += 1) {
    width += columnWidths[index];
  }
  if (span > 1) width += gapX * (span - 1);
  return width;
}

export function readContainerOptions(
  elementToRead: DiagramElement,
  values: Record<string, GSValue>,
  traces: Map<string, Trace>,
  fallbackLayout: 'stack' | 'row' | 'columns',
  fallbackGap: number,
): ContainerOptions {
  const rawLayout = getString(elementToRead, values, traces, 'layout', fallbackLayout);
  const layout = rawLayout === 'row' || rawLayout === 'columns' ? rawLayout : 'stack';
  const align = getString(elementToRead, values, traces, 'align', layout === 'row' ? 'center' : 'center');
  return {
    layout,
    gap: Math.max(CHILD_GAP_MIN, getNumber(elementToRead, values, traces, 'gap', fallbackGap)),
    padding: Math.max(0, getNumber(elementToRead, values, traces, 'padding', 0)),
    columns: Math.max(1, getNumber(elementToRead, values, traces, 'columns', 2)),
    align: align === 'start' || align === 'end' || align === 'stretch' ? align : 'center',
  };
}

export function resolveAlignedX(align: string, containerWidth: number, childWidth: number): number {
  if (align === 'start') return 0;
  if (align === 'end') return Math.max(0, containerWidth - childWidth);
  if (align === 'stretch') return 0;
  return Math.max(0, (containerWidth - childWidth) / 2);
}

export function alignToAnchor(align: string): 'start' | 'middle' | 'end' {
  if (align === 'start') return 'start';
  if (align === 'end') return 'end';
  return 'middle';
}

export function offsetChildren(children: DiagramElement[], dx: number, dy: number): DiagramElement[] {
  return children.map((child) => offsetElement(child, dx, dy));
}

export function offsetElement(elementToOffset: DiagramElement, dx: number, dy: number): DiagramElement {
  const additions: Record<string, string | number | boolean> = {
    x: getLiteralNumber(elementToOffset.properties.x) + dx,
    y: getLiteralNumber(elementToOffset.properties.y) + dy,
  };
  if (elementToOffset.properties.x2) additions.x2 = getLiteralNumber(elementToOffset.properties.x2) + dx;
  if (elementToOffset.properties.y2) additions.y2 = getLiteralNumber(elementToOffset.properties.y2) + dy;
  return cloneElement(elementToOffset, additions);
}

export function getLiteralNumber(exprValue?: Expression): number {
  if (!exprValue) return 0;
  if (exprValue.type === 'Literal' && typeof exprValue.value === 'number') return exprValue.value;
  return 0;
}

export function cloneElement(elementToClone: DiagramElement, additions: Record<string, string | number | boolean>): DiagramElement {
  return {
    ...elementToClone,
    properties: {
      ...elementToClone.properties,
      ...Object.fromEntries(Object.entries(additions).map(([key, value]) => [key, expr(value)])),
    },
  };
}

export function element(type: string, name: string, props: Record<string, string | number | boolean>, children?: DiagramElement[]): DiagramElement {
  return {
    type,
    name,
    properties: Object.fromEntries(Object.entries(props).map(([key, value]) => [key, expr(value)])),
    ...(children?.length ? { children } : {}),
  };
}

export function expr(value: string | number | boolean): Expression {
  return { type: 'Literal', value, location: ZERO_LOC };
}

export function getString(elementToRead: DiagramElement, values: Record<string, GSValue>, traces: Map<string, Trace>, key: string, fallback = ''): string {
  return readString(resolveValue(elementToRead.properties[key], values, traces), fallback);
}

export function getNumber(elementToRead: DiagramElement, values: Record<string, GSValue>, traces: Map<string, Trace>, key: string, fallback = 0): number {
  return readNumber(resolveValue(elementToRead.properties[key], values, traces), fallback);
}

export function getBoolean(elementToRead: DiagramElement, values: Record<string, GSValue>, traces: Map<string, Trace>, key: string, fallback = false): boolean {
  return readBoolean(resolveValue(elementToRead.properties[key], values, traces), fallback);
}

export function measureSemanticBounds(
  elements: DiagramElement[],
  values: Record<string, GSValue>,
  traces: Map<string, Trace>,
): { minX: number; minY: number; maxX: number; maxY: number } {
  const bounds = { minX: Number.POSITIVE_INFINITY, minY: Number.POSITIVE_INFINITY, maxX: 0, maxY: 0 };

  const visit = (elementToMeasure: DiagramElement): void => {
    const x1 = getNumber(elementToMeasure, values, traces, 'x', 0);
    const y1 = getNumber(elementToMeasure, values, traces, 'y', 0);
    const x2 = getNumber(elementToMeasure, values, traces, 'x2', x1);
    const y2 = getNumber(elementToMeasure, values, traces, 'y2', y1);
    const w = getNumber(elementToMeasure, values, traces, 'w', 0);
    const h = getNumber(elementToMeasure, values, traces, 'h', 0);
    const anchor = getString(elementToMeasure, values, traces, 'anchor', 'start');

    let leftX = Math.min(x1, x2);
    let rightX = Math.max(x2, x1 + w);
    if ((elementToMeasure.type === 'text' || elementToMeasure.type === 'formula') && !elementToMeasure.properties.x2) {
      if (anchor === 'middle') {
        leftX = x1 - w / 2;
        rightX = x1 + w / 2;
      } else if (anchor === 'end') {
        leftX = x1 - w;
        rightX = x1;
      }
    }

    bounds.minX = Math.min(bounds.minX, leftX);
    bounds.minY = Math.min(bounds.minY, Math.min(y1, y2));
    bounds.maxX = Math.max(bounds.maxX, rightX);
    bounds.maxY = Math.max(bounds.maxY, Math.max(y1 + h, y2));

    for (const child of elementToMeasure.children ?? []) visit(child);
  };

  for (const elementToMeasure of elements) visit(elementToMeasure);

  if (!Number.isFinite(bounds.minX) || !Number.isFinite(bounds.minY)) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  return bounds;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function isSemanticDiagramElement(element: DiagramElement): boolean {
  return SEMANTIC_TYPES.has(element.type) || CONTAINER_TYPES.has(element.type);
}
