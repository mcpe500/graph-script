import { DiagramElement } from '../../ast/types';
import { GSValue, Trace } from '../../runtime/values';
import { readNumber, readBoolean, readString, resolveValue } from '../common';
import { BoundingBox } from './types';

export function getNumberProperty(
  element: DiagramElement,
  values: Record<string, GSValue>,
  traces: Map<string, Trace>,
  key: string,
  fallback: number
): number {
  const expr = element.properties[key];
  if (!expr) return fallback;
  const resolved = resolveValue(expr, values, traces);
  return readNumber(resolved, fallback);
}

export function getBooleanProperty(
  element: DiagramElement,
  values: Record<string, GSValue>,
  traces: Map<string, Trace>,
  key: string,
  fallback: boolean
): boolean {
  const expr = element.properties[key];
  if (!expr) return fallback;
  const resolved = resolveValue(expr, values, traces);
  return readBoolean(resolved, fallback);
}

export function getStringProperty(
  element: DiagramElement,
  values: Record<string, GSValue>,
  traces: Map<string, Trace>,
  key: string,
  fallback: string
): string {
  const expr = element.properties[key];
  if (!expr) return fallback;
  const resolved = resolveValue(expr, values, traces);
  return readString(resolved, fallback);
}

export function resolveElementBox(
  element: DiagramElement,
  values: Record<string, GSValue>,
  traces: Map<string, Trace>,
  offsetX = 0,
  offsetY = 0,
): BoundingBox | null {
  const rawX = offsetX + getNumberProperty(element, values, traces, 'x', 0);
  const rawY = offsetY + getNumberProperty(element, values, traces, 'y', 0);
  const width = getNumberProperty(element, values, traces, 'w', 0);
  const height = getNumberProperty(element, values, traces, 'h', 0);
  if (width <= 0 || height <= 0) return null;

  let x = rawX;
  let y = rawY;
  if (element.type === 'text') {
    const anchor = getStringProperty(element, values, traces, 'anchor', 'start');
    if (anchor === 'middle') x -= width / 2;
    else if (anchor === 'end') x -= width;
  } else if (element.type === 'formula') {
    x -= width / 2;
    const ascent = getNumberProperty(element, values, traces, 'ascent', height * 0.8);
    y -= ascent;
  }

  return {
    id: element.name,
    type: element.type,
    x,
    y,
    width,
    height,
    allowOverlap: false,
  };
}

export function isIntendedOverlap(
  element: DiagramElement,
  values: Record<string, GSValue>,
  traces: Map<string, Trace>,
  parentId: string | null = null
): boolean {
  const fillOpacity = getNumberProperty(element, values, traces, 'fillOpacity', 1);
  if (fillOpacity < 1) return true;

  const strokeOpacity = getNumberProperty(element, values, traces, 'strokeOpacity', 1);
  if (strokeOpacity < 1) return true;

  if (getBooleanProperty(element, values, traces, 'allow_overlap', false)) return true;

  if (parentId && getBooleanProperty(element, values, traces, 'allow_overlap_with_parent', false)) return true;

  return false;
}

export function absoluteBox(
  element: DiagramElement,
  values: Record<string, GSValue>,
  traces: Map<string, Trace>,
  offsetX: number,
  offsetY: number,
): BoundingBox | null {
  return resolveElementBox(element, values, traces, offsetX, offsetY);
}

export function boxGap(a: BoundingBox, b: BoundingBox): number | null {
  const verticalOverlap = rangesOverlap(a.y, a.y + a.height, b.y, b.y + b.height);
  const horizontalOverlap = rangesOverlap(a.x, a.x + a.width, b.x, b.x + b.width);
  if (verticalOverlap) {
    const gap = Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width), 0);
    return gap;
  }
  if (horizontalOverlap) {
    const gap = Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height), 0);
    return gap;
  }
  return null;
}

export function verticalGap(a: BoundingBox, b: BoundingBox | undefined): number | null {
  if (!b) return null;
  if (!rangesOverlap(a.x, a.x + a.width, b.x, b.x + b.width)) return null;
  return Math.max(0, b.y - (a.y + a.height));
}

export function rangesOverlap(a1: number, a2: number, b1: number, b2: number): boolean {
  return Math.min(a2, b2) - Math.max(a1, b1) > 0;
}

export function unionLocation(a: BoundingBox | null, b: BoundingBox | null): { x: number; y: number; width: number; height: number } {
  if (!a && !b) return { x: 0, y: 0, width: 0, height: 0 };
  if (!a) return { x: b!.x, y: b!.y, width: b!.width, height: b!.height };
  if (!b) return { x: a.x, y: a.y, width: a.width, height: a.height };
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function unionOfBoxes(boxes: BoundingBox[]): { x: number; y: number; width: number; height: number } {
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function dedupeIssues(issues: import('./types').ValidationIssue[]): import('./types').ValidationIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.kind}:${issue.element1.id}:${issue.element2.id}:${issue.location.x}:${issue.location.y}:${issue.location.width}:${issue.location.height}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
