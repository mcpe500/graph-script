import { DiagramElement } from '../../ast/types';
import { GSValue, Trace } from '../../runtime/values';
import { BoundingBox, ValidationIssue, OVERLAP_TOLERANCE, OVERLAP_TYPES_ALLOWED } from './types';
import { getBooleanProperty, isIntendedOverlap, resolveElementBox, getNumberProperty } from './helpers';

export function extractBoundingBoxes(
  elements: DiagramElement[],
  values: Record<string, GSValue>,
  traces: Map<string, Trace>,
  offsetX = 0,
  offsetY = 0,
  parentId: string | null = null,
  ancestorIds: string[] = []
): BoundingBox[] {
  const boxes: BoundingBox[] = [];

  for (const element of elements) {
    const validationIgnore = getBooleanProperty(element, values, traces, 'validation_ignore', false);
    if (OVERLAP_TYPES_ALLOWED.has(element.type)) continue;
    const box = resolveElementBox(element, values, traces, offsetX, offsetY);

    if (box && !validationIgnore) {
      const allowOverlap = isIntendedOverlap(element, values, traces, parentId);
      boxes.push({
        ...box,
        allowOverlap,
        parentId: parentId || undefined,
        validationIgnore,
        ancestorIds,
      });
    }

    if (element.children?.length) {
      const childOffsetX = offsetX + getNumberProperty(element, values, traces, 'x', 0);
      const childOffsetY = offsetY + getNumberProperty(element, values, traces, 'y', 0);
      boxes.push(...extractBoundingBoxes(element.children, values, traces, childOffsetX, childOffsetY, element.name, [...ancestorIds, element.name]));
    }
  }

  return boxes;
}

export function calculateOverlap(
  a: BoundingBox,
  b: BoundingBox
): { area: number; percentage: number; bounds: BoundingBox } {
  const xOverlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const yOverlap = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const area = xOverlap * yOverlap;

  const smallerArea = Math.min(a.width * a.height, b.width * b.height);
  const percentage = smallerArea > 0 ? (area / smallerArea) * 100 : 0;

  return {
    area,
    percentage,
    bounds: {
      id: 'overlap-region',
      type: 'overlap',
      x: Math.max(a.x, b.x),
      y: Math.max(a.y, b.y),
      width: xOverlap,
      height: yOverlap,
      allowOverlap: false,
    },
  };
}

export function detectOverlaps(
  boxes: BoundingBox[],
  tolerance = OVERLAP_TOLERANCE
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const toleranceArea = tolerance * tolerance;

  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];

      if (a.allowOverlap || b.allowOverlap) continue;
      if ((a.ancestorIds ?? []).includes(b.id) || (b.ancestorIds ?? []).includes(a.id)) continue;

      const aIsConnectorLabel = a.type === 'text' && a.id.includes('label');
      const bIsConnectorLabel = b.type === 'text' && b.id.includes('label');
      const aIsSmallText = a.type === 'text' && (a.width < 200 || a.height < 50);
      const bIsSmallText = b.type === 'text' && (b.width < 200 || b.height < 50);

      const overlap = calculateOverlap(a, b);

      if (overlap.area > toleranceArea) {
        let severity: 'error' | 'warning' | 'info' =
          overlap.percentage > 50 ? 'error' : overlap.percentage > 15 ? 'warning' : 'info';
        if (aIsConnectorLabel || bIsConnectorLabel) {
          severity = severity === 'error' ? 'warning' : 'info';
        }
        if ((aIsSmallText && b.type === 'panel') || (bIsSmallText && a.type === 'panel')) {
          severity = severity === 'error' ? 'warning' : 'info';
        }

        issues.push({
          kind: 'overlap',
          element1: { id: a.id, type: a.type },
          element2: { id: b.id, type: b.type },
          overlapArea: Math.round(overlap.area),
          overlapPercentage: Math.round(overlap.percentage * 10) / 10,
          severity,
          location: {
            x: Math.round(overlap.bounds.x),
            y: Math.round(overlap.bounds.y),
            width: Math.round(overlap.bounds.width),
            height: Math.round(overlap.bounds.height),
          },
          message: `Elements "${a.id}" and "${b.id}" overlap`,
        });
      }
    }
  }

  return issues;
}
