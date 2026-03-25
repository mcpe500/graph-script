import * as fs from 'fs';
import * as path from 'path';
import { DiagramDeclaration, DiagramElement, FlowDeclaration } from '../ast/types';
import { GSValue, Trace } from '../runtime/values';
import { readNumber, readBoolean, readString, resolveValue } from './common';
import {
  BODY_TEXT_MIN,
  CARD_TITLE_MIN,
  compileSemanticDiagram,
  CONNECTOR_LABEL_MIN,
  FORMULA_TEXT_MIN,
  HEADER_TITLE_MIN,
  MIN_ASSET_HEIGHT,
  MIN_ASSET_WIDTH,
  SECTION_TITLE_MIN,
} from './diagram-semantic';
import { layoutFlow } from './flow';
import { DEFAULT_FONT_FAMILY } from './latex';

export const OVERLAP_TOLERANCE = 5;
export const MAX_RETRIES = 5;
export const MIN_FONT_SIZE = 14;
export const MIN_ELEMENT_SIZE = 20;
const MIN_LAYOUT_GAP = 14;
const EXCESSIVE_GAP_MULTIPLIER = 3;

export interface BoundingBox {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  allowOverlap: boolean;
  parentId?: string;
  validationIgnore?: boolean;
  ancestorIds?: string[];
}

export interface ValidationIssue {
  kind:
    | 'overlap'
    | 'overflow'
    | 'tight_gap'
    | 'awkward_spacing'
    | 'connector_cross_panel'
    | 'math_fallback'
    | 'undersized_text'
    | 'undersized_asset'
    | 'weak_hierarchy'
    | 'dense_panel'
    | 'decorative_interference'
    | 'connector_label_crowding';
  element1: { id: string; type: string };
  element2: { id: string; type: string };
  overlapArea: number;
  overlapPercentage: number;
  severity: 'error' | 'warning' | 'info';
  location: { x: number; y: number; width: number; height: number };
  message?: string;
}

export type OverlapIssue = ValidationIssue;

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  readabilityScore: number;
}

export interface ReadabilityMetrics {
  minFontSize: number;
  avgFontSize: number;
  minElementSize: number;
  density: number;
  elementCount: number;
}

export interface ValidationReport {
  timestamp: string;
  file: string;
  declaration: string;
  declarationType: string;
  attempts: number;
  success: boolean;
  readabilityScore: number;
  issues: Array<{
    kind?: ValidationIssue['kind'];
    severity: 'error' | 'warning' | 'info';
    element1: string;
    element2: string;
    overlapArea: number;
    overlapPercentage: number;
    location: { x: number; y: number; width: number; height: number };
    message?: string;
  }>;
  metrics: {
    minFontSize: number;
    avgFontSize: number;
    minElementSize: number;
    density: number;
    elementCount: number;
  };
  suggestions: string[];
}

export interface RelayoutStrategy {
  type: 'spacing' | 'scaling' | 'reposition';
  factor: number;
}

interface ElementParentMap {
  elementId: string;
  parentId: string | null;
}

interface ValidationSnapshot {
  elements: DiagramElement[];
  boxes: BoundingBox[];
}

interface SemanticRoleEntry {
  id: string;
  type: string;
  role: string;
  size: number;
  box: BoundingBox | null;
  parentId?: string;
  connectorFrom?: string;
  connectorTo?: string;
}

const SEMANTIC_ROLE_MIN_SIZE: Record<string, number> = {
  header_title: HEADER_TITLE_MIN,
  section_heading: SECTION_TITLE_MIN,
  card_title: CARD_TITLE_MIN,
  body_text: BODY_TEXT_MIN,
  connector_label: CONNECTOR_LABEL_MIN,
  display_formula: FORMULA_TEXT_MIN,
};

const OVERLAP_TYPES_ALLOWED = new Set(['line', 'arrow', 'connector', 'embed']);
const VALIDATABLE_DECLARATION_TYPES = new Set([
  'DiagramDeclaration',
  'FlowDeclaration',
  'ChartDeclaration',
  'TableDeclaration',
  'ErdDeclaration',
  'InfraDeclaration',
  'Plot3dDeclaration',
  'Scene3dDeclaration',
  'PageDeclaration',
]);

const NEEDS_RELAYOUT_TYPES = new Set([
  'DiagramDeclaration',
  'FlowDeclaration',
  'ErdDeclaration',
  'InfraDeclaration',
  'PageDeclaration',
]);

export function isValidatableDeclaration(declType: string): boolean {
  return VALIDATABLE_DECLARATION_TYPES.has(declType);
}

export function needsRelayout(declType: string): boolean {
  return NEEDS_RELAYOUT_TYPES.has(declType);
}

function getNumberProperty(
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

function getBooleanProperty(
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

function getStringProperty(
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

function resolveElementBox(
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

export function calculateReadability(
  elements: DiagramElement[],
  values: Record<string, GSValue>,
  traces: Map<string, Trace>
): ReadabilityMetrics {
  let minFontSize = Infinity;
  let totalFontSize = 0;
  let fontSizeCount = 0;
  let minElementSize = Infinity;
  let totalArea = 0;
  let elementCount = 0;

  function processElements(elems: DiagramElement[]): void {
    for (const element of elems) {
      elementCount++;

      if (element.type === 'text' || element.type === 'formula') {
        const fontSize = getNumberProperty(element, values, traces, 'size', 16);
        minFontSize = Math.min(minFontSize, fontSize);
        totalFontSize += fontSize;
        fontSizeCount++;
      }
      if (element.type === 'panel' || element.type === 'box') {
        const label = getStringProperty(element, values, traces, 'label', '');
        if (label) {
          const titleSize = getNumberProperty(element, values, traces, 'title_size', getNumberProperty(element, values, traces, 'size', 16));
          minFontSize = Math.min(minFontSize, titleSize);
          totalFontSize += titleSize;
          fontSizeCount++;
        }
        const subtitle = getStringProperty(element, values, traces, 'subtitle', '');
        if (subtitle) {
          const subtitleSize = getNumberProperty(element, values, traces, 'subtitle_size', 14);
          minFontSize = Math.min(minFontSize, subtitleSize);
          totalFontSize += subtitleSize;
          fontSizeCount++;
        }
      }

      const w = getNumberProperty(element, values, traces, 'w', 0);
      const h = getNumberProperty(element, values, traces, 'h', 0);
      const area = w * h;
      if (area > 0 && element.type !== 'text' && element.type !== 'formula') {
        minElementSize = Math.min(minElementSize, Math.min(w, h));
        totalArea += area;
      }

      if (element.children?.length) {
        processElements(element.children);
      }
    }
  }

  processElements(elements);

  return {
    minFontSize: minFontSize === Infinity ? MIN_FONT_SIZE : minFontSize,
    avgFontSize: fontSizeCount > 0 ? totalFontSize / fontSizeCount : 16,
    minElementSize: minElementSize === Infinity ? MIN_ELEMENT_SIZE : minElementSize,
    density: totalArea,
    elementCount,
  };
}

export function calculateReadabilityScore(metrics: ReadabilityMetrics, issues: ValidationIssue[] = []): number {
  let score = 100;

  if (metrics.minFontSize < MIN_FONT_SIZE) {
    score -= (MIN_FONT_SIZE - metrics.minFontSize) * 5;
  }

  if (metrics.minElementSize < MIN_ELEMENT_SIZE) {
    score -= (MIN_ELEMENT_SIZE - metrics.minElementSize) * 2;
  }

  if (metrics.elementCount > 80) {
    score -= Math.min(10, (metrics.elementCount - 80) * 0.2);
  }

   for (const issue of issues) {
    if (issue.severity === 'error') score -= 12;
    else if (issue.severity === 'warning') score -= 6;
    else score -= 2;
  }

  return Math.max(0, Math.min(100, score));
}

async function buildValidationSnapshot(
  decl: any,
  values: Record<string, GSValue>,
  traces: Map<string, Trace>,
): Promise<ValidationSnapshot> {
  if (decl.type === 'DiagramDeclaration') {
    const diagram = decl as DiagramDeclaration;
    const width = readNumber(resolveValue(diagram.properties.width, values, traces), 1280);
    const height = readNumber(resolveValue(diagram.properties.height, values, traces), 720);
    const fontFamily = readString(resolveValue(diagram.properties.font_family, values, traces), DEFAULT_FONT_FAMILY);
    const compiled = await compileSemanticDiagram(diagram.elements || [], values, traces, width, height, { fontFamily });
    return {
      elements: compiled.elements,
      boxes: extractBoundingBoxes(compiled.elements, values, traces),
    };
  }

  if (decl.type === 'FlowDeclaration') {
    const layout = layoutFlow(decl as FlowDeclaration);
    const boxes = layout.nodes.map((node) => ({
      id: node.id,
      type: 'flow-node',
      x: node.x - node.width / 2,
      y: node.y - node.height / 2,
      width: node.width,
      height: node.height,
      allowOverlap: false,
    }));
    return { elements: [], boxes };
  }

  const elements = decl.elements || [];
  return { elements, boxes: extractBoundingBoxes(elements, values, traces) };
}

function collectValidationIssues(
  snapshot: ValidationSnapshot,
  values: Record<string, GSValue>,
  traces: Map<string, Trace>,
): ValidationIssue[] {
  const issues = detectOverlaps(snapshot.boxes);
  issues.push(...detectOverflowIssues(snapshot.elements, values, traces));
  issues.push(...detectGapIssues(snapshot.elements, values, traces));
  issues.push(...detectConnectorCrossPanelIssues(snapshot.elements, snapshot.boxes, values, traces));
  issues.push(...detectMathFallbackIssues(snapshot.elements, values, traces));
  issues.push(...detectSemanticReadabilityIssues(snapshot, values, traces));
  return dedupeIssues(issues);
}

function detectOverflowIssues(
  elements: DiagramElement[],
  values: Record<string, GSValue>,
  traces: Map<string, Trace>,
  offsetX = 0,
  offsetY = 0,
  parentBox: BoundingBox | null = null,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const element of elements) {
    const box = resolveElementBox(element, values, traces, offsetX, offsetY);
    if (parentBox && box && !OVERLAP_TYPES_ALLOWED.has(element.type)) {
      const overflow = overflowBounds(box, parentBox);
      if (overflow) {
        const overflowArea = overflow.width * overflow.height;
        const parentArea = parentBox.width * parentBox.height;
        const overflowPercent = parentArea > 0 ? (overflowArea / parentArea) * 100 : 0;
        issues.push({
          kind: 'overflow',
          element1: { id: element.name, type: element.type },
          element2: { id: parentBox.id, type: parentBox.type },
          overlapArea: overflowArea,
          overlapPercentage: overflowPercent,
          severity: overflowPercent > 15 ? 'error' : 'warning',
          location: overflow,
          message: `Element "${element.name}" exceeds parent bounds "${parentBox.id}"`,
        });
      }
    }
    if (element.children?.length) {
      const childOffsetX = offsetX + getNumberProperty(element, values, traces, 'x', 0);
      const childOffsetY = offsetY + getNumberProperty(element, values, traces, 'y', 0);
      const nextParent = box ?? parentBox;
      issues.push(...detectOverflowIssues(element.children, values, traces, childOffsetX, childOffsetY, nextParent));
    }
  }
  return issues;
}

const OVERFLOW_TOLERANCE = 3;

function overflowBounds(box: BoundingBox, parentBox: BoundingBox): { x: number; y: number; width: number; height: number } | null {
  const overflowLeft = Math.max(0, parentBox.x - box.x);
  const overflowTop = Math.max(0, parentBox.y - box.y);
  const overflowRight = Math.max(0, box.x + box.width - (parentBox.x + parentBox.width));
  const overflowBottom = Math.max(0, box.y + box.height - (parentBox.y + parentBox.height));
  const overflowWidth = overflowLeft || overflowRight;
  const overflowHeight = overflowTop || overflowBottom;
  if (!overflowWidth && !overflowHeight) return null;
  if (overflowWidth <= OVERFLOW_TOLERANCE && overflowHeight <= OVERFLOW_TOLERANCE) return null;
  return {
    x: box.x,
    y: box.y,
    width: Math.max(overflowWidth, 1),
    height: Math.max(overflowHeight, 1),
  };
}

function detectGapIssues(
  elements: DiagramElement[],
  values: Record<string, GSValue>,
  traces: Map<string, Trace>,
  offsetX = 0,
  offsetY = 0,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const element of elements) {
    const x = offsetX + getNumberProperty(element, values, traces, 'x', 0);
    const y = offsetY + getNumberProperty(element, values, traces, 'y', 0);
    if (element.children?.length) {
      const minGap = Math.max(MIN_LAYOUT_GAP, getNumberProperty(element, values, traces, 'min_gap', MIN_LAYOUT_GAP));
      const childBoxes = element.children
        .filter((child) => !OVERLAP_TYPES_ALLOWED.has(child.type) && !getBooleanProperty(child, values, traces, 'validation_ignore', false))
        .map((child) => absoluteBox(child, values, traces, x, y))
        .filter((box): box is BoundingBox => box !== null);
      issues.push(...detectSiblingGapIssues(childBoxes, minGap));
      issues.push(...detectAwkwardSpacingIssues(childBoxes, minGap));
      issues.push(...detectGapIssues(element.children, values, traces, x, y));
    }
  }
  return issues;
}

function detectSiblingGapIssues(boxes: BoundingBox[], minGap: number): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const gap = boxGap(boxes[i], boxes[j]);
      if (gap !== null && gap + 0.5 < minGap) {
        issues.push({
          kind: 'tight_gap',
          element1: { id: boxes[i].id, type: boxes[i].type },
          element2: { id: boxes[j].id, type: boxes[j].type },
          overlapArea: 0,
          overlapPercentage: 0,
          severity: gap < Math.max(4, minGap / 2) ? 'error' : 'warning',
          location: {
            x: Math.min(boxes[i].x, boxes[j].x),
            y: Math.min(boxes[i].y, boxes[j].y),
            width: Math.abs((boxes[i].x + boxes[i].width / 2) - (boxes[j].x + boxes[j].width / 2)),
            height: Math.abs((boxes[i].y + boxes[i].height / 2) - (boxes[j].y + boxes[j].height / 2)),
          },
          message: `Gap between "${boxes[i].id}" and "${boxes[j].id}" is too small`,
        });
      }
    }
  }
  return issues;
}

function detectAwkwardSpacingIssues(boxes: BoundingBox[], minGap: number): ValidationIssue[] {
  const vertical = boxes
    .slice()
    .sort((a, b) => a.y - b.y)
    .filter((_box, index, list) => index < list.length - 1);
  const gaps = vertical
    .map((box, index) => verticalGap(box, boxes.slice().sort((a, b) => a.y - b.y)[index + 1]))
    .filter((gap): gap is number => gap !== null);
  if (gaps.length < 2) return [];
  const minObserved = Math.min(...gaps);
  const maxObserved = Math.max(...gaps);
  if (maxObserved <= Math.max(minGap * EXCESSIVE_GAP_MULTIPLIER, 56) || maxObserved <= minObserved * EXCESSIVE_GAP_MULTIPLIER) {
    return [];
  }
  return [{
    kind: 'awkward_spacing',
    element1: { id: vertical[0].id, type: vertical[0].type },
    element2: { id: vertical[vertical.length - 1].id, type: vertical[vertical.length - 1].type },
    overlapArea: 0,
    overlapPercentage: 0,
    severity: 'warning',
    location: {
      x: Math.min(...vertical.map((box) => box.x)),
      y: Math.min(...vertical.map((box) => box.y)),
      width: Math.max(...vertical.map((box) => box.x + box.width)) - Math.min(...vertical.map((box) => box.x)),
      height: Math.max(...vertical.map((box) => box.y + box.height)) - Math.min(...vertical.map((box) => box.y)),
    },
    message: 'Sibling spacing is inconsistent and visually awkward',
  }];
}

function detectConnectorCrossPanelIssues(
  elements: DiagramElement[],
  boxes: BoundingBox[],
  values: Record<string, GSValue>,
  traces: Map<string, Trace>,
): ValidationIssue[] {
  const segments = collectConnectorSegments(elements, values, traces);
  const panels = boxes.filter((box) => (box.type === 'panel' || box.type === 'box') && !box.validationIgnore);
  const issues: ValidationIssue[] = [];
  for (const segment of segments) {
    for (const panel of panels) {
      if (panel.id === segment.from || panel.id === segment.to) continue;
      if (segmentIntersectsPanel(segment, panel)) {
        issues.push({
          kind: 'connector_cross_panel',
          element1: { id: segment.id, type: 'connector-segment' },
          element2: { id: panel.id, type: panel.type },
          overlapArea: 0,
          overlapPercentage: 0,
          severity: 'warning',
          location: { x: panel.x, y: panel.y, width: panel.width, height: panel.height },
          message: `Connector "${segment.id}" crosses panel "${panel.id}"`,
        });
      }
    }
  }
  return issues;
}

function detectMathFallbackIssues(
  elements: DiagramElement[],
  values: Record<string, GSValue>,
  traces: Map<string, Trace>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const visit = (list: DiagramElement[]) => {
    for (const element of list) {
      if (getBooleanProperty(element, values, traces, 'math_fallback', false)) {
        const x = getNumberProperty(element, values, traces, 'x', 0);
        const y = getNumberProperty(element, values, traces, 'y', 0);
        const w = getNumberProperty(element, values, traces, 'w', 0);
        const h = getNumberProperty(element, values, traces, 'h', 0);
        issues.push({
          kind: 'math_fallback',
          element1: { id: element.name, type: element.type },
          element2: { id: element.name, type: element.type },
          overlapArea: 0,
          overlapPercentage: 0,
          severity: 'warning',
          location: { x, y, width: w, height: h },
          message: `Math rendering for "${element.name}" fell back to plain text`,
        });
      }
      if (element.children?.length) visit(element.children);
    }
  };
  visit(elements);
  return issues;
}

function detectSemanticReadabilityIssues(
  snapshot: ValidationSnapshot,
  values: Record<string, GSValue>,
  traces: Map<string, Trace>,
): ValidationIssue[] {
  const entries = collectSemanticRoleEntries(snapshot.elements, values, traces);
  if (!entries.some((entry) => entry.role)) return [];

  const issues: ValidationIssue[] = [];
  issues.push(...detectSemanticRoleSizeIssues(entries));
  issues.push(...detectSemanticHierarchyIssues(entries));
  issues.push(...detectDensePanelIssues(snapshot.elements, values, traces));
  issues.push(...detectUndersizedAssetIssues(entries));
  issues.push(...detectDecorativeInterferenceIssues(entries, snapshot.boxes));
  issues.push(...detectConnectorLabelCrowdingIssues(entries, snapshot.boxes));
  return issues;
}

function collectSemanticRoleEntries(
  elements: DiagramElement[],
  values: Record<string, GSValue>,
  traces: Map<string, Trace>,
  offsetX = 0,
  offsetY = 0,
  parentId?: string,
): SemanticRoleEntry[] {
  const entries: SemanticRoleEntry[] = [];

  for (const element of elements) {
    const box = resolveElementBox(element, values, traces, offsetX, offsetY);
    const role = getStringProperty(element, values, traces, 'semantic_role', '');
    if (role) {
      entries.push({
        id: element.name,
        type: element.type,
        role,
        size: getNumberProperty(element, values, traces, 'size', 0),
        box,
        parentId,
        connectorFrom: getStringProperty(element, values, traces, 'connector_from', ''),
        connectorTo: getStringProperty(element, values, traces, 'connector_to', ''),
      });
    }

    if ((element.type === 'panel' || element.type === 'box') && box) {
      const label = getStringProperty(element, values, traces, 'label', '');
      const labelRole = getStringProperty(element, values, traces, 'semantic_label_role', '');
      if (label && labelRole) {
        const titleSize = getNumberProperty(element, values, traces, 'title_size', getNumberProperty(element, values, traces, 'size', 16));
        const titleHeight = Math.max(titleSize * 1.3, 26);
        entries.push({
          id: `${element.name}#title`,
          type: 'text',
          role: labelRole,
          size: titleSize,
          box: {
            id: `${element.name}#title`,
            type: 'text',
            x: box.x + 14,
            y: box.y + 18,
            width: Math.max(24, box.width - 28),
            height: titleHeight,
            allowOverlap: false,
          },
          parentId: element.name,
        });
      }

      const subtitle = getStringProperty(element, values, traces, 'subtitle', '');
      const subtitleRole = getStringProperty(element, values, traces, 'semantic_subtitle_role', '');
      if (subtitle && subtitleRole) {
        const titleSize = getNumberProperty(element, values, traces, 'title_size', getNumberProperty(element, values, traces, 'size', 16));
        const subtitleSize = getNumberProperty(element, values, traces, 'subtitle_size', 14);
        const titleHeight = label ? Math.max(titleSize * 1.3, 26) + 8 : 0;
        entries.push({
          id: `${element.name}#subtitle`,
          type: 'text',
          role: subtitleRole,
          size: subtitleSize,
          box: {
            id: `${element.name}#subtitle`,
            type: 'text',
            x: box.x + 16,
            y: box.y + 20 + titleHeight,
            width: Math.max(24, box.width - 32),
            height: Math.max(subtitleSize * 1.35, 22),
            allowOverlap: false,
          },
          parentId: element.name,
        });
      }
    }

    if (element.children?.length) {
      const childOffsetX = offsetX + getNumberProperty(element, values, traces, 'x', 0);
      const childOffsetY = offsetY + getNumberProperty(element, values, traces, 'y', 0);
      entries.push(...collectSemanticRoleEntries(element.children, values, traces, childOffsetX, childOffsetY, element.name));
    }
  }

  return entries;
}

function detectSemanticRoleSizeIssues(entries: SemanticRoleEntry[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const entry of entries) {
    const minimum = SEMANTIC_ROLE_MIN_SIZE[entry.role];
    if (!minimum || entry.size + 0.1 >= minimum) continue;
    const location = entry.box
      ? { x: entry.box.x, y: entry.box.y, width: entry.box.width, height: entry.box.height }
      : { x: 0, y: 0, width: 0, height: 0 };
    issues.push({
      kind: 'undersized_text',
      element1: { id: entry.id, type: entry.type },
      element2: { id: entry.role, type: 'semantic-role' },
      overlapArea: 0,
      overlapPercentage: 0,
      severity: minimum - entry.size >= 1 ? 'error' : 'warning',
      location,
      message: `Semantic text role "${entry.role}" in "${entry.id}" is smaller than ${minimum}px`,
    });
  }
  return issues;
}

function detectSemanticHierarchyIssues(entries: SemanticRoleEntry[]): ValidationIssue[] {
  const hierarchyPairs: Array<[string, string, number]> = [
    ['header_title', 'section_heading', 2],
    ['section_heading', 'card_title', 2],
    ['card_title', 'body_text', 2],
  ];
  const issues: ValidationIssue[] = [];

  for (const [parentRole, childRole, minGap] of hierarchyPairs) {
    const parentEntries = entries.filter((entry) => entry.role === parentRole);
    const childEntries = entries.filter((entry) => entry.role === childRole);
    if (!parentEntries.length || !childEntries.length) continue;

    const smallestParent = parentEntries.reduce((min, entry) => (entry.size < min.size ? entry : min), parentEntries[0]);
    const largestChild = childEntries.reduce((max, entry) => (entry.size > max.size ? entry : max), childEntries[0]);
    if (smallestParent.size + 0.1 >= largestChild.size + minGap) continue;

    const location = unionLocation(smallestParent.box, largestChild.box);
    issues.push({
      kind: 'weak_hierarchy',
      element1: { id: smallestParent.id, type: smallestParent.type },
      element2: { id: largestChild.id, type: largestChild.type },
      overlapArea: 0,
      overlapPercentage: 0,
      severity: 'warning',
      location,
      message: `Semantic hierarchy is weak: role "${parentRole}" should be at least ${minGap}px larger than "${childRole}"`,
    });
  }

  return issues;
}

function detectDensePanelIssues(
  elements: DiagramElement[],
  values: Record<string, GSValue>,
  traces: Map<string, Trace>,
  offsetX = 0,
  offsetY = 0,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const element of elements) {
    const x = offsetX + getNumberProperty(element, values, traces, 'x', 0);
    const y = offsetY + getNumberProperty(element, values, traces, 'y', 0);
    const role = getStringProperty(element, values, traces, 'semantic_role', '');
    const box = resolveElementBox(element, values, traces, offsetX, offsetY);

    if ((element.type === 'panel' || element.type === 'box') && role === 'card' && box && element.children?.length) {
      const childBoxes = element.children
        .map((child) => resolveElementBox(child, values, traces, x, y))
        .filter((childBox, index): childBox is BoundingBox => childBox !== null && !getBooleanProperty(element.children![index], values, traces, 'validation_ignore', false));

      if (childBoxes.length >= 5) {
        const used = unionOfBoxes(childBoxes);
        const usedWidthRatio = used.width / Math.max(box.width, 1);
        const usedHeightRatio = used.height / Math.max(box.height, 1);
        if (usedWidthRatio > 0.9 && usedHeightRatio > 0.82) {
          issues.push({
            kind: 'dense_panel',
            element1: { id: element.name, type: element.type },
            element2: { id: element.name, type: element.type },
            overlapArea: Math.round(used.width * used.height),
            overlapPercentage: Math.round((used.width * used.height / Math.max(box.width * box.height, 1)) * 1000) / 10,
            severity: 'warning',
            location: { x: used.x, y: used.y, width: used.width, height: used.height },
            message: `Panel "${element.name}" is visually too dense for its available space`,
          });
        }
      }
    }

    if (element.children?.length) {
      issues.push(...detectDensePanelIssues(element.children, values, traces, x, y));
    }
  }

  return issues;
}

function detectUndersizedAssetIssues(entries: SemanticRoleEntry[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const entry of entries) {
    if (entry.role !== 'asset' || !entry.box) continue;
    if (entry.box.width + 0.1 >= MIN_ASSET_WIDTH && entry.box.height + 0.1 >= MIN_ASSET_HEIGHT) continue;
    issues.push({
      kind: 'undersized_asset',
      element1: { id: entry.id, type: entry.type },
      element2: { id: 'asset', type: 'semantic-role' },
      overlapArea: 0,
      overlapPercentage: 0,
      severity: 'error',
      location: { x: entry.box.x, y: entry.box.y, width: entry.box.width, height: entry.box.height },
      message: `Semantic asset "${entry.id}" is smaller than the readable minimum ${MIN_ASSET_WIDTH}x${MIN_ASSET_HEIGHT}`,
    });
  }
  return issues;
}

function detectDecorativeInterferenceIssues(entries: SemanticRoleEntry[], boxes: BoundingBox[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const decorative = entries.filter((entry) => entry.role === 'decorative' && entry.box);
  const content = boxes.filter((box) => !box.validationIgnore);

  for (const item of decorative) {
    const decorativeBox = item.box!;
    for (const box of content) {
      const overlap = calculateOverlap(decorativeBox, box);
      if (overlap.area <= 120) continue;
      issues.push({
        kind: 'decorative_interference',
        element1: { id: item.id, type: item.type },
        element2: { id: box.id, type: box.type },
        overlapArea: Math.round(overlap.area),
        overlapPercentage: Math.round(overlap.percentage * 10) / 10,
        severity: 'warning',
        location: {
          x: Math.round(overlap.bounds.x),
          y: Math.round(overlap.bounds.y),
          width: Math.round(overlap.bounds.width),
          height: Math.round(overlap.bounds.height),
        },
        message: `Decorative element "${item.id}" interferes with active content "${box.id}"`,
      });
    }
  }

  return issues;
}

function detectConnectorLabelCrowdingIssues(entries: SemanticRoleEntry[], boxes: BoundingBox[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const labels = entries.filter((entry) => entry.role === 'connector_label' && entry.box);
  const panels = boxes.filter((box) => box.type === 'panel' || box.type === 'box');

  for (const label of labels) {
    const labelBox = label.box!;
    for (const panel of panels) {
      if (panel.id === label.connectorFrom || panel.id === label.connectorTo) continue;
      const overlap = calculateOverlap(labelBox, panel);
      const gap = boxGap(labelBox, panel);
      if (overlap.area <= 0 && (gap === null || gap >= 12)) continue;
      issues.push({
        kind: 'connector_label_crowding',
        element1: { id: label.id, type: label.type },
        element2: { id: panel.id, type: panel.type },
        overlapArea: Math.round(overlap.area),
        overlapPercentage: Math.round(overlap.percentage * 10) / 10,
        severity: 'warning',
        location: unionLocation(labelBox, panel),
        message: `Connector label "${label.id}" is too close to panel "${panel.id}"`,
      });
    }
  }

  for (let index = 0; index < labels.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < labels.length; otherIndex += 1) {
      const first = labels[index].box!;
      const second = labels[otherIndex].box!;
      const overlap = calculateOverlap(first, second);
      const gap = boxGap(first, second);
      if (overlap.area <= 0 && (gap === null || gap >= 10)) continue;
      issues.push({
        kind: 'connector_label_crowding',
        element1: { id: labels[index].id, type: labels[index].type },
        element2: { id: labels[otherIndex].id, type: labels[otherIndex].type },
        overlapArea: Math.round(overlap.area),
        overlapPercentage: Math.round(overlap.percentage * 10) / 10,
        severity: 'warning',
        location: unionLocation(first, second),
        message: `Connector labels "${labels[index].id}" and "${labels[otherIndex].id}" are too close`,
      });
    }
  }

  return issues;
}

function unionLocation(a: BoundingBox | null, b: BoundingBox | null): { x: number; y: number; width: number; height: number } {
  if (!a && !b) return { x: 0, y: 0, width: 0, height: 0 };
  if (!a) return { x: b!.x, y: b!.y, width: b!.width, height: b!.height };
  if (!b) return { x: a.x, y: a.y, width: a.width, height: a.height };
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function unionOfBoxes(boxes: BoundingBox[]): { x: number; y: number; width: number; height: number } {
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function dedupeIssues(issues: ValidationIssue[]): ValidationIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.kind}:${issue.element1.id}:${issue.element2.id}:${issue.location.x}:${issue.location.y}:${issue.location.width}:${issue.location.height}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function absoluteBox(
  element: DiagramElement,
  values: Record<string, GSValue>,
  traces: Map<string, Trace>,
  offsetX: number,
  offsetY: number,
): BoundingBox | null {
  return resolveElementBox(element, values, traces, offsetX, offsetY);
}

function boxGap(a: BoundingBox, b: BoundingBox): number | null {
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

function verticalGap(a: BoundingBox, b: BoundingBox | undefined): number | null {
  if (!b) return null;
  if (!rangesOverlap(a.x, a.x + a.width, b.x, b.x + b.width)) return null;
  return Math.max(0, b.y - (a.y + a.height));
}

function rangesOverlap(a1: number, a2: number, b1: number, b2: number): boolean {
  return Math.min(a2, b2) - Math.max(a1, b1) > 0;
}

function collectConnectorSegments(
  elements: DiagramElement[],
  values: Record<string, GSValue>,
  traces: Map<string, Trace>,
  offsetX = 0,
  offsetY = 0,
): Array<{ id: string; x1: number; y1: number; x2: number; y2: number; from: string; to: string }> {
  const segments: Array<{ id: string; x1: number; y1: number; x2: number; y2: number; from: string; to: string }> = [];
  for (const element of elements) {
    const x = offsetX + getNumberProperty(element, values, traces, 'x', 0);
    const y = offsetY + getNumberProperty(element, values, traces, 'y', 0);
    if ((element.type === 'line' || element.type === 'arrow') && getStringProperty(element, values, traces, 'connector_id', '')) {
      segments.push({
        id: getStringProperty(element, values, traces, 'connector_id', element.name),
        x1: x,
        y1: y,
        x2: offsetX + getNumberProperty(element, values, traces, 'x2', x),
        y2: offsetY + getNumberProperty(element, values, traces, 'y2', y),
        from: getStringProperty(element, values, traces, 'connector_from', ''),
        to: getStringProperty(element, values, traces, 'connector_to', ''),
      });
    }
    if (element.children?.length) {
      segments.push(...collectConnectorSegments(element.children, values, traces, x, y));
    }
  }
  return segments;
}

function segmentIntersectsPanel(
  segment: { x1: number; y1: number; x2: number; y2: number },
  panel: BoundingBox,
): boolean {
  const minX = Math.min(segment.x1, segment.x2);
  const maxX = Math.max(segment.x1, segment.x2);
  const minY = Math.min(segment.y1, segment.y2);
  const maxY = Math.max(segment.y1, segment.y2);
  const inset = 2;
  const left = panel.x + inset;
  const right = panel.x + panel.width - inset;
  const top = panel.y + inset;
  const bottom = panel.y + panel.height - inset;

  if (segment.y1 === segment.y2) {
    return segment.y1 > top && segment.y1 < bottom && maxX > left && minX < right;
  }
  if (segment.x1 === segment.x2) {
    return segment.x1 > left && segment.x1 < right && maxY > top && minY < bottom;
  }
  return false;
}

function getRelayoutStrategy(attempt: number): RelayoutStrategy {
  const strategies: RelayoutStrategy[] = [
    { type: 'spacing', factor: 1.1 },
    { type: 'spacing', factor: 1.2 },
    { type: 'scaling', factor: 0.95 },
    { type: 'spacing', factor: 1.3 },
    { type: 'scaling', factor: 0.9 },
  ];

  return strategies[Math.min(attempt, strategies.length - 1)];
}

function applySpacingToElement(
  element: DiagramElement,
  values: Record<string, GSValue>,
  traces: Map<string, Trace>,
  factor: number,
  centerX: number,
  centerY: number
): DiagramElement {
  const x = getNumberProperty(element, values, traces, 'x', 0);
  const y = getNumberProperty(element, values, traces, 'y', 0);

  const newX = centerX + (x - centerX) * factor;
  const newY = centerY + (y - centerY) * factor;

  const newProperties = { ...element.properties };
  newProperties.x = { type: 'Literal', value: newX, location: ZERO_LOC };
  newProperties.y = { type: 'Literal', value: newY, location: ZERO_LOC };

  const result: DiagramElement = {
    ...element,
    properties: newProperties,
  };

  if (element.children?.length) {
    result.children = element.children.map((child) =>
      applySpacingToElement(child, values, traces, factor, 0, 0)
    );
  }

  return result;
}

function applyScalingToElement(
  element: DiagramElement,
  values: Record<string, GSValue>,
  traces: Map<string, Trace>,
  factor: number
): DiagramElement {
  const w = getNumberProperty(element, values, traces, 'w', 0);
  const h = getNumberProperty(element, values, traces, 'h', 0);

  const newW = w * factor;
  const newH = h * factor;

  const newProperties = { ...element.properties };
  if (w > 0) newProperties.w = { type: 'Literal', value: newW, location: ZERO_LOC };
  if (h > 0) newProperties.h = { type: 'Literal', value: newH, location: ZERO_LOC };

  const fontSize = getNumberProperty(element, values, traces, 'size', 16);
  if (fontSize !== 16 && (element.type === 'text' || element.type === 'formula')) {
    newProperties.size = { type: 'Literal', value: fontSize * factor, location: ZERO_LOC };
  }

  const result: DiagramElement = {
    ...element,
    properties: newProperties,
  };

  if (element.children?.length) {
    result.children = element.children.map((child) =>
      applyScalingToElement(child, values, traces, factor)
    );
  }

  return result;
}

const ZERO_LOC = {
  start: { line: 0, column: 0, offset: 0 },
  end: { line: 0, column: 0, offset: 0 },
};

function adjustFlowDeclaration(decl: any, strategy: RelayoutStrategy): any {
  const newProperties = { ...decl.properties };

  if (strategy.type === 'spacing') {
    const currentWidth = getNumberFromExpr(newProperties.target_width, 1400);
    const currentHeight = getNumberFromExpr(newProperties.target_height, 860);

    newProperties.target_width = { type: 'Literal', value: currentWidth * strategy.factor, location: ZERO_LOC };
    newProperties.target_height = { type: 'Literal', value: currentHeight * strategy.factor, location: ZERO_LOC };
  }

  return { ...decl, properties: newProperties };
}

function getNumberFromExpr(expr: any, fallback: number): number {
  if (!expr) return fallback;
  if (expr.type === 'Literal' && typeof expr.value === 'number') return expr.value;
  return fallback;
}

function setLiteralProperty(properties: Record<string, any>, key: string, value: number | string | boolean): void {
  properties[key] = { type: 'Literal', value, location: ZERO_LOC };
}

function adjustSemanticDiagramDeclaration(decl: any, strategy: RelayoutStrategy, attempt: number): any {
  const newProperties = { ...decl.properties };
  const currentWidth = getNumberFromExpr(newProperties.width, 1280);
  const currentHeight = getNumberFromExpr(newProperties.height, 720);
  if (strategy.type === 'spacing') {
    setLiteralProperty(newProperties, 'height', currentHeight * Math.max(strategy.factor, 1.08));
    if (attempt >= 2) setLiteralProperty(newProperties, 'width', currentWidth * 1.06);
  }

  const adjustedElements = (decl.elements || []).map((element: DiagramElement) =>
    adjustSemanticElement(element, strategy, attempt),
  );

  const laneElements = adjustedElements.filter((element: DiagramElement) => element.type === 'lane');
  if (attempt >= 2 && laneElements.length === 2) {
    const rightLane = laneElements[laneElements.length - 1];
    const leftLane = laneElements[0];
    const rightRatio = getNumberFromExpr(rightLane.properties.ratio, 1);
    const leftRatio = getNumberFromExpr(leftLane.properties.ratio, 1);
    setLiteralProperty(rightLane.properties, 'ratio', rightRatio * 1.05);
    setLiteralProperty(leftLane.properties, 'ratio', Math.max(0.25, leftRatio * 0.98));
  }

  return { ...decl, properties: newProperties, elements: adjustedElements };
}

function adjustSemanticElement(element: DiagramElement, strategy: RelayoutStrategy, attempt: number): DiagramElement {
  const properties = { ...element.properties };
  if (strategy.type === 'spacing') {
    if (element.type === 'lane') {
      const gapX = getNumberFromExpr(properties.gap_x, getNumberFromExpr(properties.gap, MIN_LAYOUT_GAP));
      const gapY = getNumberFromExpr(properties.gap_y, getNumberFromExpr(properties.gap, MIN_LAYOUT_GAP));
      const padding = getNumberFromExpr(properties.padding, 22);
      setLiteralProperty(properties, 'gap_x', gapX * strategy.factor);
      setLiteralProperty(properties, 'gap_y', gapY * strategy.factor);
      setLiteralProperty(properties, 'padding', padding * Math.min(strategy.factor, 1.18));
    }
    if (element.type === 'card' || element.type === 'group') {
      const gap = getNumberFromExpr(properties.gap, MIN_LAYOUT_GAP);
      const padding = getNumberFromExpr(properties.padding, element.type === 'card' ? 22 : 0);
      const minH = getNumberFromExpr(properties.min_h, 0);
      setLiteralProperty(properties, 'gap', gap * strategy.factor);
      if (padding > 0) setLiteralProperty(properties, 'padding', padding * Math.min(strategy.factor, 1.15));
      if (minH > 0) setLiteralProperty(properties, 'min_h', minH * Math.min(strategy.factor, 1.12));
    }
    if (element.type === 'header' || element.type === 'separator') {
      const gap = getNumberFromExpr(properties.gap, MIN_LAYOUT_GAP);
      setLiteralProperty(properties, 'gap', gap * Math.min(strategy.factor, 1.15));
    }
    if (element.type === 'connector' && attempt >= 3) {
      setLiteralProperty(properties, 'route', 'hvh');
    }
  }

  if (strategy.type === 'scaling' && element.type === 'image') {
    const w = getNumberFromExpr(properties.w, 0);
    const h = getNumberFromExpr(properties.h, 0);
    if (w > 0) setLiteralProperty(properties, 'w', w * strategy.factor);
    if (h > 0) setLiteralProperty(properties, 'h', h * strategy.factor);
  }

  const result: DiagramElement = { ...element, properties };
  if (element.children?.length) {
    result.children = element.children.map((child) => adjustSemanticElement(child, strategy, attempt));
  }
  return result;
}

export function attemptRelayout(
  decl: any,
  values: Record<string, GSValue>,
  traces: Map<string, Trace>,
  attempt: number
): { success: boolean; adjustedDecl: any } {
  const strategy = getRelayoutStrategy(attempt);

  if (decl.type === 'FlowDeclaration') {
    return {
      success: true,
      adjustedDecl: adjustFlowDeclaration(decl, strategy),
    };
  }

  if (decl.type === 'DiagramDeclaration' && Array.isArray(decl.elements) && decl.elements.some((element: DiagramElement) => ['header', 'separator', 'lane', 'card', 'connector', 'loop_label'].includes(element.type))) {
    return {
      success: true,
      adjustedDecl: adjustSemanticDiagramDeclaration(decl, strategy, attempt),
    };
  }

  if (!decl.elements || !Array.isArray(decl.elements)) {
    return { success: false, adjustedDecl: decl };
  }

  let centerX = 0;
  let centerY = 0;
  let count = 0;

  for (const element of decl.elements) {
    const x = getNumberProperty(element, values, traces, 'x', 0);
    const y = getNumberProperty(element, values, traces, 'y', 0);
    centerX += x;
    centerY += y;
    count++;
  }

  centerX = count > 0 ? centerX / count : 0;
  centerY = count > 0 ? centerY / count : 0;

  let adjustedElements: DiagramElement[];

  if (strategy.type === 'spacing') {
    adjustedElements = decl.elements.map((element: DiagramElement) =>
      applySpacingToElement(element, values, traces, strategy.factor, centerX, centerY)
    );
  } else if (strategy.type === 'scaling') {
    adjustedElements = decl.elements.map((element: DiagramElement) =>
      applyScalingToElement(element, values, traces, strategy.factor)
    );
  } else {
    adjustedElements = decl.elements;
  }

  const adjustedDecl = {
    ...decl,
    elements: adjustedElements,
  };

  return { success: true, adjustedDecl };
}

export function generateReport(
  attempts: number,
  issues: ValidationIssue[],
  metrics: ReadabilityMetrics,
  success: boolean,
  declName: string,
  declType: string
): ValidationReport {
  const suggestions: string[] = [];

  if (!success) {
    suggestions.push('Consider increasing canvas dimensions');
    suggestions.push('Reduce the number of elements or simplify the layout');
    suggestions.push('Use allow_overlap: true only for intentional overlaps');
  }

  if (metrics.minFontSize < MIN_FONT_SIZE) {
    suggestions.push(`Increase minimum font size to at least ${MIN_FONT_SIZE}px`);
  }

  if (metrics.minElementSize < MIN_ELEMENT_SIZE) {
    suggestions.push(`Increase minimum element size to at least ${MIN_ELEMENT_SIZE}px`);
  }

  if (!success && metrics.elementCount > 80) {
    suggestions.push('Consider splitting into multiple diagrams for better readability');
  }

  if (issues.some((issue) => issue.kind === 'math_fallback')) {
    suggestions.push('Use explicit TeX or supported shorthand for formulas that fell back to plain text');
  }

  if (issues.some((issue) => issue.kind === 'tight_gap' || issue.kind === 'awkward_spacing')) {
    suggestions.push('Increase card, lane, or child gap settings to improve readability');
  }
  if (issues.some((issue) => issue.kind === 'undersized_text')) {
    suggestions.push('Raise semantic text roles to their minimum sizes so titles, body text, and formulas stay readable');
  }
  if (issues.some((issue) => issue.kind === 'undersized_asset')) {
    suggestions.push(`Increase semantic image blocks to at least ${MIN_ASSET_WIDTH}x${MIN_ASSET_HEIGHT}`);
  }
  if (issues.some((issue) => issue.kind === 'weak_hierarchy')) {
    suggestions.push('Strengthen typography hierarchy so section titles, card titles, and body text do not collapse into the same visual weight');
  }
  if (issues.some((issue) => issue.kind === 'dense_panel')) {
    suggestions.push('Reduce panel density by increasing panel size or simplifying stacked content');
  }
  if (issues.some((issue) => issue.kind === 'decorative_interference')) {
    suggestions.push('Remove or relocate decorative labels that compete with active content');
  }
  if (issues.some((issue) => issue.kind === 'connector_label_crowding')) {
    suggestions.push('Reserve clearer space for connector labels away from panels and neighboring labels');
  }

  return {
    timestamp: new Date().toISOString(),
    file: '',
    declaration: declName,
    declarationType: declType,
    attempts,
    success,
    readabilityScore: calculateReadabilityScore(metrics, issues),
    issues: issues.map((i) => ({
      kind: i.kind,
      severity: i.severity,
      element1: i.element1.id,
      element2: i.element2.id,
      overlapArea: i.overlapArea,
      overlapPercentage: i.overlapPercentage,
      location: i.location,
      message: i.message,
    })),
    metrics: {
      minFontSize: Math.round(metrics.minFontSize * 10) / 10,
      avgFontSize: Math.round(metrics.avgFontSize * 10) / 10,
      minElementSize: Math.round(metrics.minElementSize * 10) / 10,
      density: Math.round(metrics.density),
      elementCount: metrics.elementCount,
    },
    suggestions,
  };
}

export function writeValidationReport(
  report: ValidationReport,
  filePath: string,
  declarationName: string
): void {
  const finalReport = {
    ...report,
    declaration: declarationName,
  };

  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(filePath, JSON.stringify(finalReport, null, 2), 'utf-8');
}

export async function validateAndAdjust(
  decl: any,
  values: Record<string, GSValue>,
  traces: Map<string, Trace>,
  maxRetries = MAX_RETRIES
): Promise<{
  adjustedDecl: any;
  validation: ValidationResult;
  report: ValidationReport;
}> {
  const declType = decl.type || 'Unknown';
  const declName = decl.name || 'unnamed';

  if (!needsRelayout(declType)) {
    const snapshot = await buildValidationSnapshot(decl, values, traces);
    const metrics = calculateReadability(snapshot.elements, values, traces);
    const issues = collectValidationIssues(snapshot, values, traces);
    const score = calculateReadabilityScore(metrics, issues);

    return {
      adjustedDecl: decl,
      validation: {
        valid: !issues.some((issue) => issue.severity === 'error' || issue.severity === 'warning'),
        issues,
        readabilityScore: score,
      },
      report: generateReport(0, issues, metrics, !issues.some((issue) => issue.severity === 'error' || issue.severity === 'warning'), declName, declType),
    };
  }

  let currentDecl = decl;
  let attempt = 0;
  let lastIssues: ValidationIssue[] = [];

  while (attempt <= maxRetries) {
    const snapshot = await buildValidationSnapshot(currentDecl, values, traces);
    if (snapshot.elements.length === 0 && snapshot.boxes.length === 0) {
      const metrics = calculateReadability([], values, traces);
      return {
        adjustedDecl: currentDecl,
        validation: { valid: true, issues: [], readabilityScore: 100 },
        report: generateReport(attempt, [], metrics, true, declName, declType),
      };
    }

    const issues = collectValidationIssues(snapshot, values, traces);
    lastIssues = issues;

    const metrics = calculateReadability(snapshot.elements, values, traces);
    const hasErrors = issues.some((i) => i.severity === 'error');

    if (!hasErrors) {
      return {
        adjustedDecl: currentDecl,
        validation: {
          valid: true,
          issues,
          readabilityScore: calculateReadabilityScore(metrics, issues),
        },
        report: generateReport(attempt, issues, metrics, true, declName, declType),
      };
    }

    if (attempt >= maxRetries) break;

    const { success, adjustedDecl } = attemptRelayout(currentDecl, values, traces, attempt);

    if (!success) break;

    currentDecl = adjustedDecl;
    attempt++;
  }

  const finalSnapshot = await buildValidationSnapshot(currentDecl, values, traces);
  const finalMetrics = calculateReadability(finalSnapshot.elements, values, traces);

  return {
    adjustedDecl: currentDecl,
    validation: {
      valid: false,
      issues: lastIssues,
      readabilityScore: calculateReadabilityScore(finalMetrics, lastIssues),
    },
    report: generateReport(attempt, lastIssues, finalMetrics, false, declName, declType),
  };
}

export async function validateDiagram(
  decl: any,
  values: Record<string, GSValue>,
  traces: Map<string, Trace>
): Promise<ValidationResult> {
  const snapshot = await buildValidationSnapshot(decl, values, traces);
  if (snapshot.elements.length === 0 && snapshot.boxes.length === 0) {
    return { valid: true, issues: [], readabilityScore: 100 };
  }

  const issues = collectValidationIssues(snapshot, values, traces);
  const metrics = calculateReadability(snapshot.elements, values, traces);

  const hasErrors = issues.some((i) => i.severity === 'error');

  return {
    valid: !hasErrors,
    issues,
    readabilityScore: calculateReadabilityScore(metrics, issues),
  };
}
