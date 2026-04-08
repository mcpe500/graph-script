import { round } from '../common';
import { renderRichTextBlock } from '../latex';
import { ElementRenderState } from './render-state';
import { escapeMarkerId, resolveLineEndpoints, resolveNumber } from './render-utils';

// ============================================================================
// USE CASE DIAGRAM ELEMENTS
// ============================================================================

/**
 * Render actor as a stick figure with label below
 * Actor dimensions: head circle + body + arms + legs
 */
export async function renderActor(state: ElementRenderState): Promise<string> {
  const { x, y, w, h, stroke, strokeWidth, label, color, latexMode, fontFamily } = state;
  const actorStroke = stroke === '#cbd5e1' ? '#1e293b' : stroke;
  const lineWidth = strokeWidth > 1.5 ? strokeWidth : 2;
  
  // Calculate actor proportions
  const centerX = x + w / 2;
  const actorHeight = Math.min(h - 40, 100); // Leave space for label
  const headRadius = actorHeight * 0.12;
  const bodyTop = y + headRadius * 2 + 4;
  const bodyBottom = bodyTop + actorHeight * 0.35;
  const armY = bodyTop + actorHeight * 0.12;
  const armSpread = actorHeight * 0.28;
  const legSpread = actorHeight * 0.22;
  const legBottom = y + actorHeight;
  
  let svg = '';
  
  // Head (circle)
  svg += `<circle cx="${round(centerX)}" cy="${round(y + headRadius)}" r="${round(headRadius)}" fill="none" stroke="${actorStroke}" stroke-width="${lineWidth}"/>`;
  
  // Body (vertical line)
  svg += `<line x1="${round(centerX)}" y1="${round(bodyTop)}" x2="${round(centerX)}" y2="${round(bodyBottom)}" stroke="${actorStroke}" stroke-width="${lineWidth}"/>`;
  
  // Arms (horizontal line)
  svg += `<line x1="${round(centerX - armSpread)}" y1="${round(armY)}" x2="${round(centerX + armSpread)}" y2="${round(armY)}" stroke="${actorStroke}" stroke-width="${lineWidth}"/>`;
  
  // Left leg
  svg += `<line x1="${round(centerX)}" y1="${round(bodyBottom)}" x2="${round(centerX - legSpread)}" y2="${round(legBottom)}" stroke="${actorStroke}" stroke-width="${lineWidth}"/>`;
  
  // Right leg
  svg += `<line x1="${round(centerX)}" y1="${round(bodyBottom)}" x2="${round(centerX + legSpread)}" y2="${round(legBottom)}" stroke="${actorStroke}" stroke-width="${lineWidth}"/>`;
  
  // Label below actor
  if (label) {
    const labelBlock = await renderRichTextBlock(label, {
      x: centerX,
      y: legBottom + 8,
      maxWidth: Math.max(w, 120),
      fontSize: 14,
      weight: '500',
      color,
      anchor: 'middle',
      maxLines: 2,
      latex: latexMode,
      fontFamily,
    });
    svg += labelBlock.svg;
  }
  
  return svg;
}

/**
 * Render use case as an ellipse with label inside
 */
export async function renderUseCase(state: ElementRenderState): Promise<string> {
  const { x, y, w, h, fill, stroke, strokeWidth, label, color, latexMode, fontFamily } = state;
  const useCaseFill = fill === '#ffffff' ? '#ffffff' : fill;
  const useCaseStroke = stroke === '#cbd5e1' ? '#1e293b' : stroke;
  
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w / 2;
  const ry = h / 2;
  
  let svg = `<ellipse cx="${round(cx)}" cy="${round(cy)}" rx="${round(rx)}" ry="${round(ry)}" fill="${useCaseFill}" stroke="${useCaseStroke}" stroke-width="${strokeWidth || 1.5}"/>`;
  
  if (label) {
    const block = await renderRichTextBlock(label, {
      x: cx,
      y: cy - 10,
      maxWidth: w - 24,
      fontSize: 14,
      weight: '500',
      color,
      anchor: 'middle',
      maxLines: 3,
      latex: latexMode,
      fontFamily,
    });
    svg += block.svg;
  }
  
  return svg;
}

/**
 * Render system boundary as a rectangle with title at top
 */
export async function renderSystemBoundary(state: ElementRenderState): Promise<string> {
  const { x, y, w, h, fill, stroke, strokeWidth, label, color, latexMode, fontFamily } = state;
  const systemFill = fill === '#ffffff' ? 'none' : fill;
  const systemStroke = stroke === '#cbd5e1' ? '#1e293b' : stroke;
  
  let svg = '';
  
  // System boundary rectangle
  svg += `<rect x="${round(x)}" y="${round(y)}" width="${round(w)}" height="${round(h)}" fill="${systemFill}" stroke="${systemStroke}" stroke-width="${strokeWidth || 1.5}" rx="0"/>`;
  
  // System name at top
  if (label) {
    const labelBlock = await renderRichTextBlock(label, {
      x: x + w / 2,
      y: y + 16,
      maxWidth: w - 32,
      fontSize: 16,
      weight: '700',
      color,
      anchor: 'middle',
      maxLines: 2,
      latex: latexMode,
      fontFamily,
    });
    svg += labelBlock.svg;
  }
  
  return svg;
}

/**
 * Render association line (solid line connecting actor to use case)
 */
export async function renderAssociation(state: ElementRenderState): Promise<string> {
  const { x, y, stroke, strokeWidth, strokeOpacityAttr } = state;
  const { x2, y2 } = resolveLineEndpoints(state);
  const assocStroke = stroke === '#cbd5e1' ? '#1e293b' : stroke;
  
  return `<line x1="${round(x)}" y1="${round(y)}" x2="${round(x2)}" y2="${round(y2)}" stroke="${assocStroke}" stroke-width="${strokeWidth || 1.5}"${strokeOpacityAttr}/>`;
}

function resolveRelationLabelCenter(
  state: ElementRenderState,
  x: number,
  y: number,
  x2: number,
  y2: number,
): { x: number; y: number } {
  const manualLabelX = resolveNumber(state, 'label_x', Number.NaN);
  const manualLabelY = resolveNumber(state, 'label_y', Number.NaN);
  if (Number.isFinite(manualLabelX) && Number.isFinite(manualLabelY)) {
    return {
      x: state.offsetX + manualLabelX,
      y: state.offsetY + manualLabelY,
    };
  }

  const midX = (x + x2) / 2;
  const midY = (y + y2) / 2;
  const dx = x2 - x;
  const dy = y2 - y;
  const length = Math.sqrt(dx * dx + dy * dy) || 1;
  const perpX = -dy / length;
  const perpY = dx / length;
  const offset = 20;

  return {
    x: midX + perpX * offset,
    y: midY + perpY * offset,
  };
}

/**
 * Render include relationship (dashed line with arrow and <<include>> label)
 */
export async function renderInclude(state: ElementRenderState): Promise<string> {
  const { element, x, y, stroke, strokeWidth, color, latexMode, fontFamily } = state;
  const { x2, y2 } = resolveLineEndpoints(state);
  const includeStroke = stroke === '#cbd5e1' ? '#1e293b' : stroke;
  const lineWidth = strokeWidth || 1.5;
  
  let svg = '';
  
  // Arrow marker for include
  const markerSize = Math.max(6, lineWidth * 1.8);
  svg += `<defs><marker id="include-arrow-${escapeMarkerId(element.name)}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="${round(markerSize, 2)}" markerHeight="${round(markerSize, 2)}" orient="auto-start-reverse"><path d="M 0 1 L 9 5 L 0 9" fill="none" stroke="${includeStroke}" stroke-width="1.5"/></marker></defs>`;
  
  // Dashed line with arrow
  svg += `<line x1="${round(x)}" y1="${round(y)}" x2="${round(x2)}" y2="${round(y2)}" stroke="${includeStroke}" stroke-width="${lineWidth}" stroke-dasharray="8 4" marker-end="url(#include-arrow-${escapeMarkerId(element.name)})"/>`;
  
  const labelCenter = resolveRelationLabelCenter(state, x, y, x2, y2);
  
  const labelBlock = await renderRichTextBlock('<<include>>', {
    x: labelCenter.x,
    y: labelCenter.y,
    maxWidth: 120,
    fontSize: 12,
    weight: '400',
    color: color || '#1e293b',
    anchor: 'middle',
    maxLines: 1,
    latex: latexMode,
    fontFamily,
  });
  svg += labelBlock.svg;
  
  return svg;
}

/**
 * Render extend relationship (dashed line with arrow and <<extend>> label)
 */
export async function renderExtend(state: ElementRenderState): Promise<string> {
  const { element, x, y, stroke, strokeWidth, color, latexMode, fontFamily } = state;
  const { x2, y2 } = resolveLineEndpoints(state);
  const extendStroke = stroke === '#cbd5e1' ? '#1e293b' : stroke;
  const lineWidth = strokeWidth || 1.5;
  
  let svg = '';
  
  // Arrow marker for extend
  const markerSize = Math.max(6, lineWidth * 1.8);
  svg += `<defs><marker id="extend-arrow-${escapeMarkerId(element.name)}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="${round(markerSize, 2)}" markerHeight="${round(markerSize, 2)}" orient="auto-start-reverse"><path d="M 0 1 L 9 5 L 0 9" fill="none" stroke="${extendStroke}" stroke-width="1.5"/></marker></defs>`;
  
  // Dashed line with arrow
  svg += `<line x1="${round(x)}" y1="${round(y)}" x2="${round(x2)}" y2="${round(y2)}" stroke="${extendStroke}" stroke-width="${lineWidth}" stroke-dasharray="8 4" marker-end="url(#extend-arrow-${escapeMarkerId(element.name)})"/>`;
  
  const labelCenter = resolveRelationLabelCenter(state, x, y, x2, y2);
  
  const labelBlock = await renderRichTextBlock('<<extend>>', {
    x: labelCenter.x,
    y: labelCenter.y,
    maxWidth: 120,
    fontSize: 12,
    weight: '400',
    color: color || '#1e293b',
    anchor: 'middle',
    maxLines: 1,
    latex: latexMode,
    fontFamily,
  });
  svg += labelBlock.svg;
  
  return svg;
}
