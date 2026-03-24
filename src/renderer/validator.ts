import * as fs from 'fs';
import * as path from 'path';
import { DiagramElement } from '../ast/types';
import { GSValue, Trace } from '../runtime/values';
import { readNumber, readBoolean, readString, resolveValue } from './common';

export const OVERLAP_TOLERANCE = 5;
export const MAX_RETRIES = 5;
export const MIN_FONT_SIZE = 10;
export const MIN_ELEMENT_SIZE = 20;

export interface BoundingBox {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  allowOverlap: boolean;
  parentId?: string;
}

export interface OverlapIssue {
  element1: { id: string; type: string };
  element2: { id: string; type: string };
  overlapArea: number;
  overlapPercentage: number;
  severity: 'error' | 'warning' | 'info';
  location: { x: number; y: number; width: number; height: number };
}

export interface ValidationResult {
  valid: boolean;
  issues: OverlapIssue[];
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
    severity: 'error' | 'warning' | 'info';
    element1: string;
    element2: string;
    overlapArea: number;
    overlapPercentage: number;
    location: { x: number; y: number; width: number; height: number };
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

export function extractBoundingBoxes(
  elements: DiagramElement[],
  values: Record<string, GSValue>,
  traces: Map<string, Trace>,
  offsetX = 0,
  offsetY = 0,
  parentId: string | null = null
): BoundingBox[] {
  const boxes: BoundingBox[] = [];

  for (const element of elements) {
    if (OVERLAP_TYPES_ALLOWED.has(element.type)) continue;

    const x = offsetX + getNumberProperty(element, values, traces, 'x', 0);
    const y = offsetY + getNumberProperty(element, values, traces, 'y', 0);
    const w = getNumberProperty(element, values, traces, 'w', 0);
    const h = getNumberProperty(element, values, traces, 'h', 0);

    if (w > 0 && h > 0) {
      const allowOverlap = isIntendedOverlap(element, values, traces, parentId !== null);
      boxes.push({
        id: element.name,
        type: element.type,
        x,
        y,
        width: w,
        height: h,
        allowOverlap,
        parentId: parentId || undefined,
      });
    }

    if (element.children?.length) {
      boxes.push(...extractBoundingBoxes(element.children, values, traces, x, y, element.name));
    }
  }

  return boxes;
}

export function isIntendedOverlap(
  element: DiagramElement,
  values: Record<string, GSValue>,
  traces: Map<string, Trace>,
  hasParent: boolean
): boolean {
  if (hasParent) return true;

  const fillOpacity = getNumberProperty(element, values, traces, 'fillOpacity', 1);
  if (fillOpacity < 1) return true;

  const strokeOpacity = getNumberProperty(element, values, traces, 'strokeOpacity', 1);
  if (strokeOpacity < 1) return true;

  if (getBooleanProperty(element, values, traces, 'allow_overlap', false)) return true;

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
): OverlapIssue[] {
  const issues: OverlapIssue[] = [];
  const toleranceArea = tolerance * tolerance;

  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];

      if (a.allowOverlap || b.allowOverlap) continue;

      if (a.parentId && a.parentId === b.parentId) continue;

      const overlap = calculateOverlap(a, b);

      if (overlap.area > toleranceArea) {
        const severity: 'error' | 'warning' | 'info' =
          overlap.percentage > 30 ? 'error' : overlap.percentage > 10 ? 'warning' : 'info';

        issues.push({
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

      const w = getNumberProperty(element, values, traces, 'w', 0);
      const h = getNumberProperty(element, values, traces, 'h', 0);
      const area = w * h;
      if (area > 0) {
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

export function calculateReadabilityScore(metrics: ReadabilityMetrics): number {
  let score = 100;

  if (metrics.minFontSize < MIN_FONT_SIZE) {
    score -= (MIN_FONT_SIZE - metrics.minFontSize) * 5;
  }

  if (metrics.minElementSize < MIN_ELEMENT_SIZE) {
    score -= (MIN_ELEMENT_SIZE - metrics.minElementSize) * 2;
  }

  if (metrics.elementCount > 50) {
    score -= Math.min(10, (metrics.elementCount - 50) * 0.2);
  }

  return Math.max(0, Math.min(100, score));
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
  issues: OverlapIssue[],
  metrics: ReadabilityMetrics,
  success: boolean,
  declName: string,
  declType: string
): ValidationReport {
  const suggestions: string[] = [];

  if (!success) {
    suggestions.push('Consider increasing canvas dimensions');
    suggestions.push('Reduce the number of elements or simplify the layout');
    suggestions.push('Use allow_overlap: true for intentional overlapping elements');
  }

  if (metrics.minFontSize < MIN_FONT_SIZE) {
    suggestions.push(`Increase minimum font size to at least ${MIN_FONT_SIZE}px`);
  }

  if (metrics.minElementSize < MIN_ELEMENT_SIZE) {
    suggestions.push(`Increase minimum element size to at least ${MIN_ELEMENT_SIZE}px`);
  }

  if (metrics.elementCount > 50) {
    suggestions.push('Consider splitting into multiple diagrams for better readability');
  }

  return {
    timestamp: new Date().toISOString(),
    file: '',
    declaration: declName,
    declarationType: declType,
    attempts,
    success,
    readabilityScore: calculateReadabilityScore(metrics),
    issues: issues.map((i) => ({
      severity: i.severity,
      element1: i.element1.id,
      element2: i.element2.id,
      overlapArea: i.overlapArea,
      overlapPercentage: i.overlapPercentage,
      location: i.location,
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

export function validateAndAdjust(
  decl: any,
  values: Record<string, GSValue>,
  traces: Map<string, Trace>,
  maxRetries = MAX_RETRIES
): {
  adjustedDecl: any;
  validation: ValidationResult;
  report: ValidationReport;
} {
  const declType = decl.type || 'Unknown';
  const declName = decl.name || 'unnamed';

  if (!needsRelayout(declType)) {
    const elements = decl.elements || [];
    const metrics = calculateReadability(elements, values, traces);
    const score = calculateReadabilityScore(metrics);

    return {
      adjustedDecl: decl,
      validation: {
        valid: true,
        issues: [],
        readabilityScore: score,
      },
      report: generateReport(0, [], metrics, true, declName, declType),
    };
  }

  let currentDecl = decl;
  let attempt = 0;
  let lastIssues: OverlapIssue[] = [];

  while (attempt <= maxRetries) {
    const elements = currentDecl.elements || [];

    if (elements.length === 0) {
      const metrics = calculateReadability([], values, traces);
      return {
        adjustedDecl: currentDecl,
        validation: { valid: true, issues: [], readabilityScore: 100 },
        report: generateReport(attempt, [], metrics, true, declName, declType),
      };
    }

    const boxes = extractBoundingBoxes(elements, values, traces);
    const issues = detectOverlaps(boxes);
    lastIssues = issues;

    const metrics = calculateReadability(elements, values, traces);
    const hasErrors = issues.some((i) => i.severity === 'error');
    const hasWarnings = issues.some((i) => i.severity === 'warning');

    if (!hasErrors && !hasWarnings) {
      return {
        adjustedDecl: currentDecl,
        validation: {
          valid: true,
          issues,
          readabilityScore: calculateReadabilityScore(metrics),
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

  const finalElements = currentDecl.elements || [];
  const finalMetrics = calculateReadability(finalElements, values, traces);

  return {
    adjustedDecl: currentDecl,
    validation: {
      valid: false,
      issues: lastIssues,
      readabilityScore: calculateReadabilityScore(finalMetrics),
    },
    report: generateReport(attempt, lastIssues, finalMetrics, false, declName, declType),
  };
}

export function validateDiagram(
  decl: any,
  values: Record<string, GSValue>,
  traces: Map<string, Trace>
): ValidationResult {
  const elements = decl.elements || [];

  if (elements.length === 0) {
    return { valid: true, issues: [], readabilityScore: 100 };
  }

  const boxes = extractBoundingBoxes(elements, values, traces);
  const issues = detectOverlaps(boxes);
  const metrics = calculateReadability(elements, values, traces);

  const hasErrors = issues.some((i) => i.severity === 'error');

  return {
    valid: !hasErrors,
    issues,
    readabilityScore: calculateReadabilityScore(metrics),
  };
}
