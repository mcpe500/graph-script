/**
 * Use Case Diagram Layout System
 * Handles automatic positioning of actors, use cases, system boundaries,
 * and connections for UML Use Case diagrams.
 */

import { DiagramElement, Expression } from '../../ast/types';
import { GSValue, Trace } from '../../runtime/values';
import { readNumber, readString, resolveValue } from '../common';
import { USE_CASE_ELEMENT_TYPES } from '../validator/types';
import {
  computeUseCaseRelationLabelPlacements,
  UseCaseLabelBlocker,
  UseCaseLabelSegment,
  UseCaseRelationGeometry,
} from './usecase-label-placement';

const ZERO_LOC = {
  start: { line: 0, column: 0, offset: 0 },
  end: { line: 0, column: 0, offset: 0 },
};

interface UseCaseLayoutConfig {
  width: number;
  height: number;
  padding: number;
  actorWidth: number;
  actorHeight: number;
  useCaseWidth: number;
  useCaseHeight: number;
  useCaseGap: number;
  useCaseColumnGap: number;
  systemPadding: number;
  actorGap: number;
}

interface ActorInfo {
  element: DiagramElement;
  id: string;
  label: string;
  side: 'left' | 'right';
  order: number;
}

interface UseCaseInfo {
  element: DiagramElement;
  id: string;
  label: string;
  order: number;
}

interface SystemInfo {
  element: DiagramElement;
  id: string;
  label: string;
}

interface ConnectionInfo {
  element: DiagramElement;
  type: 'association' | 'include' | 'extend';
  from: string;
  to: string;
}

interface PositionedConnection {
  element: DiagramElement;
  type: 'association' | 'include' | 'extend';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface LayoutResult {
  elements: DiagramElement[];
  width: number;
  height: number;
}

/**
 * Check if the diagram contains use case elements
 */
export function isUseCaseDiagram(elements: DiagramElement[]): boolean {
  return elements.some((el) => USE_CASE_ELEMENT_TYPES.has(el.type));
}

/**
 * Layout use case diagram elements
 */
export function layoutUseCaseDiagram(
  elements: DiagramElement[],
  values: Record<string, GSValue>,
  traces: Map<string, Trace>,
  requestedWidth: number,
  requestedHeight: number,
): LayoutResult {
  const config: UseCaseLayoutConfig = {
    width: requestedWidth,
    height: requestedHeight,
    padding: 80,
    actorWidth: 100,
    actorHeight: 140,
    useCaseWidth: 180,
    useCaseHeight: 55,
    useCaseGap: 35,
    useCaseColumnGap: 80,
    systemPadding: 50,
    actorGap: 60,
  };

  // Categorize elements
  const actors: ActorInfo[] = [];
  const useCases: UseCaseInfo[] = [];
  const connections: ConnectionInfo[] = [];
  let system: SystemInfo | null = null;

  for (const element of elements) {
    switch (element.type) {
      case 'actor':
        actors.push({
          element,
          id: element.name,
          label: readString(resolveValue(element.properties.label, values, traces), element.name),
          side: (readString(resolveValue(element.properties.side, values, traces), 'left') as 'left' | 'right'),
          order: readNumber(resolveValue(element.properties.order, values, traces), actors.length + 1),
        });
        break;
      case 'usecase':
        useCases.push({
          element,
          id: element.name,
          label: readString(resolveValue(element.properties.label, values, traces), element.name),
          order: readNumber(resolveValue(element.properties.order, values, traces), useCases.length + 1),
        });
        break;
      case 'system':
        system = {
          element,
          id: element.name,
          label: readString(resolveValue(element.properties.label, values, traces), element.name),
        };
        break;
      case 'association':
      case 'include':
      case 'extend':
        connections.push({
          element,
          type: element.type as 'association' | 'include' | 'extend',
          from: readString(resolveValue(element.properties.from, values, traces), ''),
          to: readString(resolveValue(element.properties.to, values, traces), ''),
        });
        break;
    }
  }

  // Sort actors and use cases by order
  actors.sort((a, b) => a.order - b.order);
  useCases.sort((a, b) => a.order - b.order);

  const leftActors = actors.filter((a) => a.side === 'left');
  const rightActors = actors.filter((a) => a.side === 'right');

  // Classify use cases into primary (has actor association) and secondary (no actor association)
  const actorIds = new Set(actors.map((a) => a.id));
  const useCasesWithActorAssociation = new Set<string>();
  for (const conn of connections) {
    if (conn.type === 'association') {
      if (actorIds.has(conn.from)) {
        useCasesWithActorAssociation.add(conn.to);
      }
      if (actorIds.has(conn.to)) {
        useCasesWithActorAssociation.add(conn.from);
      }
    }
  }

  const primaryUseCases = useCases.filter((uc) => useCasesWithActorAssociation.has(uc.id));
  const secondaryUseCases = useCases.filter((uc) => !useCasesWithActorAssociation.has(uc.id));
  const hasSecondaryColumn = secondaryUseCases.length > 0;

  // Calculate column heights based on primary and secondary use cases
  const primaryColumnHeight = primaryUseCases.length > 0
    ? primaryUseCases.length * (config.useCaseHeight + config.useCaseGap) - config.useCaseGap
    : 0;
  const secondaryColumnHeight = secondaryUseCases.length > 0
    ? secondaryUseCases.length * (config.useCaseHeight + config.useCaseGap) - config.useCaseGap
    : 0;
  const maxColumnHeight = Math.max(primaryColumnHeight, secondaryColumnHeight);
  const systemContentHeight = maxColumnHeight + config.systemPadding * 2 + 50; // 50 for title

  // Calculate actor column heights
  const leftActorTotalHeight = leftActors.length > 0 
    ? leftActors.length * config.actorHeight + (leftActors.length - 1) * config.actorGap 
    : 0;
  const rightActorTotalHeight = rightActors.length > 0 
    ? rightActors.length * config.actorHeight + (rightActors.length - 1) * config.actorGap 
    : 0;
  const maxActorHeight = Math.max(leftActorTotalHeight, rightActorTotalHeight);

  // System width: 2 columns if there are secondary use cases, otherwise 1 column
  const systemWidth = hasSecondaryColumn
    ? config.useCaseWidth * 2 + config.useCaseColumnGap + config.systemPadding * 2
    : config.useCaseWidth + config.systemPadding * 2;
  const systemHeight = Math.max(400, systemContentHeight, maxActorHeight);

  // Calculate total diagram dimensions
  const leftActorSpace = leftActors.length > 0 ? config.actorWidth + config.padding * 1.5 : 0;
  const rightActorSpace = rightActors.length > 0 ? config.actorWidth + config.padding * 1.5 : 0;
  
  // Center the system boundary
  const centerX = requestedWidth / 2;
  const systemX = centerX - systemWidth / 2;
  const systemY = config.padding + 60; // Leave space for diagram title

  const totalWidth = Math.max(requestedWidth, systemX + systemWidth + rightActorSpace + config.padding);
  const totalHeight = Math.max(requestedHeight, systemHeight + config.padding * 2 + 60);

  const elementPositions = new Map<string, { x: number; y: number; w: number; h: number; cx: number; cy: number }>();

  // Position primary use cases (left column inside system)
  const primaryStartX = systemX + config.systemPadding;
  const primaryStartY = systemY + (systemHeight - primaryColumnHeight) / 2 + 25; // 25 for title

  primaryUseCases.forEach((uc, index) => {
    const ucX = primaryStartX;
    const ucY = primaryStartY + index * (config.useCaseHeight + config.useCaseGap);
    elementPositions.set(uc.id, {
      x: ucX,
      y: ucY,
      w: config.useCaseWidth,
      h: config.useCaseHeight,
      cx: ucX + config.useCaseWidth / 2,
      cy: ucY + config.useCaseHeight / 2,
    });
  });

  // Position secondary use cases (right column) - Smart Y-Alignment
  // Build mapping: secondary UC → primary UCs that connect to it via include/extend
  const secondaryToConnectedPrimary = new Map<string, string[]>();
  const primaryIds = new Set(primaryUseCases.map((uc) => uc.id));
  const secondaryIds = new Set(secondaryUseCases.map((uc) => uc.id));

  for (const conn of connections) {
    if (conn.type === 'include' || conn.type === 'extend') {
      // include: from (primary) → to (secondary)
      // extend: from (secondary) → to (primary) - arrow points to primary
      if (primaryIds.has(conn.from) && secondaryIds.has(conn.to)) {
        // include case: primary → secondary
        const list = secondaryToConnectedPrimary.get(conn.to) || [];
        list.push(conn.from);
        secondaryToConnectedPrimary.set(conn.to, list);
      } else if (secondaryIds.has(conn.from) && primaryIds.has(conn.to)) {
        // extend case: secondary → primary
        const list = secondaryToConnectedPrimary.get(conn.from) || [];
        list.push(conn.to);
        secondaryToConnectedPrimary.set(conn.from, list);
      }
    }
  }

  // Calculate aligned Y for each secondary use case
  const secondaryStartX = systemX + config.systemPadding + config.useCaseWidth + config.useCaseColumnGap;
  const secondaryWithAlignedY: Array<{ uc: UseCaseInfo; alignedY: number }> = [];

  for (const secUC of secondaryUseCases) {
    const connectedPrimaries = secondaryToConnectedPrimary.get(secUC.id);
    let alignedY: number;

    if (connectedPrimaries && connectedPrimaries.length > 0) {
      // Get Y from the first connected primary use case
      const primaryPos = elementPositions.get(connectedPrimaries[0]);
      if (primaryPos) {
        alignedY = primaryPos.y;
      } else {
        // Fallback: use order-based position
        alignedY = primaryStartY + (secUC.order - 1) * (config.useCaseHeight + config.useCaseGap);
      }
    } else {
      // No connection found, use order-based position
      alignedY = primaryStartY + (secUC.order - 1) * (config.useCaseHeight + config.useCaseGap);
    }

    secondaryWithAlignedY.push({ uc: secUC, alignedY });
  }

  // Sort by alignedY to process in order
  secondaryWithAlignedY.sort((a, b) => a.alignedY - b.alignedY);

  // Position secondary use cases, handling conflicts (avoid overlap)
  let lastUsedY = -Infinity;
  const minGap = config.useCaseHeight + config.useCaseGap;

  for (const { uc, alignedY } of secondaryWithAlignedY) {
    // Ensure no overlap with previous secondary UC
    const finalY = Math.max(alignedY, lastUsedY + minGap);
    lastUsedY = finalY;

    elementPositions.set(uc.id, {
      x: secondaryStartX,
      y: finalY,
      w: config.useCaseWidth,
      h: config.useCaseHeight,
      cx: secondaryStartX + config.useCaseWidth / 2,
      cy: finalY + config.useCaseHeight / 2,
    });
  }

  // Layout left actors - vertically centered relative to system
  const leftActorX = systemX - config.padding - config.actorWidth;
  const leftActorStartY = systemY + (systemHeight - leftActorTotalHeight) / 2;
  leftActors.forEach((actor, index) => {
    const actorY = leftActorStartY + index * (config.actorHeight + config.actorGap);
    elementPositions.set(actor.id, {
      x: leftActorX,
      y: actorY,
      w: config.actorWidth,
      h: config.actorHeight,
      cx: leftActorX + config.actorWidth / 2,
      cy: actorY + config.actorHeight * 0.4, // Center at body, not whole height
    });
  });

  // Layout right actors - vertically centered relative to system
  const rightActorX = systemX + systemWidth + config.padding;
  const rightActorStartY = systemY + (systemHeight - rightActorTotalHeight) / 2;
  rightActors.forEach((actor, index) => {
    const actorY = rightActorStartY + index * (config.actorHeight + config.actorGap);
    elementPositions.set(actor.id, {
      x: rightActorX,
      y: actorY,
      w: config.actorWidth,
      h: config.actorHeight,
      cx: rightActorX + config.actorWidth / 2,
      cy: actorY + config.actorHeight * 0.4, // Center at body, not whole height
    });
  });

  // Create positioned elements
  const positionedElements: DiagramElement[] = [];

  // Add system boundary first (background) with validation_ignore to prevent overlap warnings
  if (system) {
    positionedElements.push({
      ...system.element,
      properties: {
        ...system.element.properties,
        x: literal(systemX),
        y: literal(systemY),
        w: literal(systemWidth),
        h: literal(systemHeight),
        validation_ignore: literal(true),
      },
    });
  }

  // Add use cases
  for (const uc of useCases) {
    const pos = elementPositions.get(uc.id)!;
    positionedElements.push({
      ...uc.element,
      properties: {
        ...uc.element.properties,
        x: literal(pos.x),
        y: literal(pos.y),
        w: literal(pos.w),
        h: literal(pos.h),
      },
    });
  }

  // Add actors
  for (const actor of actors) {
    const pos = elementPositions.get(actor.id)!;
    positionedElements.push({
      ...actor.element,
      properties: {
        ...actor.element.properties,
        x: literal(pos.x),
        y: literal(pos.y),
        w: literal(pos.w),
        h: literal(pos.h),
      },
    });
  }

  // Build connection geometry with calculated coordinates
  const positionedConnections: PositionedConnection[] = [];

  for (const conn of connections) {
    const fromPos = elementPositions.get(conn.from);
    const toPos = elementPositions.get(conn.to);

    if (fromPos && toPos) {
      // Calculate connection points based on element positions
      let x1: number, y1: number, x2: number, y2: number;

      // For include/extend between use cases (horizontal connections between columns)
      if (conn.type === 'include' || conn.type === 'extend') {
        // Horizontal connection: primary (left) to secondary (right) or vice versa
        if (fromPos.cx < toPos.cx) {
          // From is left of To
          x1 = fromPos.x + fromPos.w; // Right edge of from
          x2 = toPos.x;               // Left edge of to
          y1 = fromPos.cy;
          y2 = toPos.cy;
        } else {
          // From is right of To
          x1 = fromPos.x;             // Left edge of from
          x2 = toPos.x + toPos.w;     // Right edge of to
          y1 = fromPos.cy;
          y2 = toPos.cy;
        }
      } else {
        // For associations between actor and use case
        if (fromPos.cx < toPos.cx) {
          // Actor on left, use case on right
          x1 = fromPos.cx + 15; // Right of actor center
          x2 = toPos.x; // Left edge of use case ellipse
          y1 = fromPos.cy;
          y2 = toPos.cy;
        } else {
          // Actor on right, use case on left
          x1 = fromPos.cx - 15; // Left of actor center
          x2 = toPos.x + toPos.w; // Right edge of use case ellipse
          y1 = fromPos.cy;
          y2 = toPos.cy;
        }
      }

      positionedConnections.push({
        element: conn.element,
        type: conn.type,
        x1,
        y1,
        x2,
        y2,
      });
    }
  }

  const relationGeometries: UseCaseRelationGeometry[] = [];
  for (const conn of positionedConnections) {
    if (conn.type !== 'include' && conn.type !== 'extend') continue;
    relationGeometries.push({
      id: conn.element.name,
      type: conn.type,
      x1: conn.x1,
      y1: conn.y1,
      x2: conn.x2,
      y2: conn.y2,
      label: conn.type === 'include' ? '<<include>>' : '<<extend>>',
    });
  }

  const labelBlockers: UseCaseLabelBlocker[] = [];
  for (const actor of actors) {
    const pos = elementPositions.get(actor.id);
    if (!pos) continue;
    labelBlockers.push({
      id: actor.id,
      type: 'actor',
      x: pos.x,
      y: pos.y,
      width: pos.w,
      height: pos.h,
    });
  }
  for (const useCase of useCases) {
    const pos = elementPositions.get(useCase.id);
    if (!pos) continue;
    labelBlockers.push({
      id: useCase.id,
      type: 'usecase',
      x: pos.x,
      y: pos.y,
      width: pos.w,
      height: pos.h,
    });
  }

  const labelSegments: UseCaseLabelSegment[] = positionedConnections.map((conn) => ({
    id: conn.element.name,
    type: conn.type,
    x1: conn.x1,
    y1: conn.y1,
    x2: conn.x2,
    y2: conn.y2,
  }));

  const labelLayout = computeUseCaseRelationLabelPlacements({
    relations: relationGeometries,
    blockers: labelBlockers,
    segments: labelSegments,
    canvasWidth: totalWidth,
    canvasHeight: totalHeight,
    maxLoops: 5,
  });

  for (const conn of positionedConnections) {
    const relationLabel = labelLayout.placements.get(conn.element.name);
    const relationLabelProps: Record<string, Expression> = {};
    if ((conn.type === 'include' || conn.type === 'extend') && relationLabel) {
      relationLabelProps.label_x = literal(relationLabel.x);
      relationLabelProps.label_y = literal(relationLabel.y);
      relationLabelProps.label_w = literal(relationLabel.width);
      relationLabelProps.label_h = literal(relationLabel.height);
      relationLabelProps.label_refine_loops = literal(labelLayout.loopsUsed);
      relationLabelProps.label_layout_score = literal(Math.round(relationLabel.score));
    }

    positionedElements.push({
      ...conn.element,
      properties: {
        ...conn.element.properties,
        x: literal(conn.x1),
        y: literal(conn.y1),
        x2: literal(conn.x2),
        y2: literal(conn.y2),
        validation_ignore: literal(true),
        ...relationLabelProps,
      },
    });
  }

  return {
    elements: positionedElements,
    width: totalWidth,
    height: totalHeight,
  };
}

function literal(value: string | number | boolean): Expression {
  return { type: 'Literal', value, location: ZERO_LOC };
}
