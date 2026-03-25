import { DiagramElement } from '../../ast/types';
import { GSValue, Trace } from '../../runtime/values';
import { RelayoutStrategy, ZERO_LOC, MIN_LAYOUT_GAP } from './types';
import { getNumberProperty } from './helpers';

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

export function getRelayoutStrategy(attempt: number): RelayoutStrategy {
  const strategies: RelayoutStrategy[] = [
    { type: 'spacing', factor: 1.1 },
    { type: 'spacing', factor: 1.2 },
    { type: 'scaling', factor: 0.95 },
    { type: 'spacing', factor: 1.3 },
    { type: 'scaling', factor: 0.9 },
  ];

  return strategies[Math.min(attempt, strategies.length - 1)];
}

export function applySpacingToElement(
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

export function applyScalingToElement(
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

export function adjustFlowDeclaration(decl: any, strategy: RelayoutStrategy): any {
  const newProperties = { ...decl.properties };

  if (strategy.type === 'spacing') {
    const currentWidth = getNumberFromExpr(newProperties.target_width, 1400);
    const currentHeight = getNumberFromExpr(newProperties.target_height, 860);

    newProperties.target_width = { type: 'Literal', value: currentWidth * strategy.factor, location: ZERO_LOC };
    newProperties.target_height = { type: 'Literal', value: currentHeight * strategy.factor, location: ZERO_LOC };
  }

  return { ...decl, properties: newProperties };
}

export function getNumberFromExpr(expr: any, fallback: number): number {
  if (!expr) return fallback;
  if (expr.type === 'Literal' && typeof expr.value === 'number') return expr.value;
  return fallback;
}

export function setLiteralProperty(properties: Record<string, any>, key: string, value: number | string | boolean): void {
  properties[key] = { type: 'Literal', value, location: ZERO_LOC };
}

export function adjustSemanticDiagramDeclaration(decl: any, strategy: RelayoutStrategy, attempt: number): any {
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

export function adjustSemanticElement(element: DiagramElement, strategy: RelayoutStrategy, attempt: number): DiagramElement {
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
