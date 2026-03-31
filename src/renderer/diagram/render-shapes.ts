import { asStringArray, escapeXml, resolveValue, round } from '../common';
import { renderDisplayFormula, renderRichTextBlock } from '../latex';
import { loadImageHref, sanitizeId } from './image';
import { ElementRenderState } from './render-state';
import { buildTextLineCap, escapeMarkerId, resolveLineEndpoints, resolveNumber, resolveString } from './render-utils';

export async function renderPanelOrBox(state: ElementRenderState): Promise<string> {
  const { x, y, w, h, radius, fill, stroke, strokeWidth, dashAttr, fillOpacityAttr, strokeOpacityAttr, label, subtitle, color, textSize, latexMode, fontFamily, element } = state;
  let svg = `<rect x="${round(x)}" y="${round(y)}" width="${round(w)}" height="${round(h)}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${dashAttr}${fillOpacityAttr}${strokeOpacityAttr}/>`;
  const titleBlock = label
    ? await renderRichTextBlock(label, {
        x: x + w / 2,
        y: y + 18,
        maxWidth: w - 28,
        fontSize: Math.max(18, textSize),
        weight: '800',
        color,
        anchor: 'middle',
        maxLines: 3,
        latex: latexMode,
        fontFamily,
      })
    : { svg: '', height: 0, lines: 0 };
  svg += titleBlock.svg;
  const subtitleBlock = subtitle
    ? await renderRichTextBlock(subtitle, {
        x: x + w / 2,
        y: y + 22 + titleBlock.height,
        maxWidth: w - 32,
        fontSize: 14,
        weight: '500',
        color: '#64748b',
        anchor: 'middle',
        maxLines: 4,
        latex: latexMode,
        fontFamily,
      })
    : { svg: '', height: 0, lines: 0 };
  svg += subtitleBlock.svg;
  return svg;
}

export function renderGrid(state: ElementRenderState): string {
  const { x, y, w, h, gridRows, gridCols, fill } = state;
  let svg = '';
  const cellW = w / gridCols;
  const cellH = h / gridRows;
  for (let row = 0; row < gridRows; row += 1) {
    for (let col = 0; col < gridCols; col += 1) {
      svg += `<rect x="${round(x + col * cellW)}" y="${round(y + row * cellH)}" width="${round(cellW - 2)}" height="${round(cellH - 2)}" rx="6" fill="${fill}" stroke="#ffffff" stroke-width="2"/>`;
    }
  }
  return svg;
}

export function renderChecker(state: ElementRenderState): string {
  const { x, y, w, h, gridRows, gridCols, element, values, traces } = state;
  const colors = asStringArray(resolveValue(element.properties.colors, values, traces));
  const a = colors[0] ?? '#2563eb';
  const b = colors[1] ?? '#f97316';
  let svg = '';
  const cellW = w / gridCols;
  const cellH = h / gridRows;
  for (let row = 0; row < gridRows; row += 1) {
    for (let col = 0; col < gridCols; col += 1) {
      const colorFill = (row + col) % 2 === 0 ? a : b;
      svg += `<rect x="${round(x + col * cellW)}" y="${round(y + row * cellH)}" width="${round(cellW - 2)}" height="${round(cellH - 2)}" rx="6" fill="${colorFill}" stroke="#ffffff" stroke-width="2"/>`;
    }
  }
  return svg;
}

export async function renderText(state: ElementRenderState): Promise<string> {
  const { x, y, w, h, textSize, weight, color, label, latexMode, fontFamily } = state;
  const value = resolveString(state, 'value', label);
  const anchor = resolveString(state, 'anchor', 'start');
  const block = await renderRichTextBlock(value, {
    x,
    y,
    maxWidth: w,
    fontSize: textSize,
    weight,
    color,
    anchor: anchor as 'start' | 'middle' | 'end',
    maxLines: Math.max(1, Math.floor(h / Math.max(textSize + 4, 1))) || 6,
    latex: latexMode,
    fontFamily,
  });
  return block.svg;
}

export async function renderFormula(state: ElementRenderState): Promise<string> {
  const value = resolveString(state, 'value', state.label);
  return renderDisplayFormula(value, state.x, state.y, {
    fontSize: state.textSize || 22,
    color: state.color,
    anchor: 'middle',
  });
}

export async function renderCircle(state: ElementRenderState): Promise<string> {
  const { x, y, w, h, fill, stroke, strokeWidth, dashAttr, fillOpacityAttr, strokeOpacityAttr, label, textSize, color, latexMode, fontFamily } = state;
  const radiusPx = Math.min(w, h) / 2;
  const cx = x + w / 2;
  const cy = y + h / 2;
  let svg = `<circle cx="${round(cx)}" cy="${round(cy)}" r="${round(radiusPx)}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth || 1.8}"${dashAttr}${fillOpacityAttr}${strokeOpacityAttr}/>`;
  if (label) {
    const block = await renderRichTextBlock(label, {
      x: cx,
      y: cy - Math.max(textSize, 14) / 2,
      maxWidth: w - 18,
      fontSize: Math.max(14, textSize),
      weight: '700',
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

export async function renderEllipse(state: ElementRenderState): Promise<string> {
  const { x, y, w, h, fill, stroke, strokeWidth, dashAttr, fillOpacityAttr, strokeOpacityAttr, label, textSize, color, latexMode, fontFamily } = state;
  const cx = x + w / 2;
  const cy = y + h / 2;
  let svg = `<ellipse cx="${round(cx)}" cy="${round(cy)}" rx="${round(w / 2)}" ry="${round(h / 2)}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth || 1.8}"${dashAttr}${fillOpacityAttr}${strokeOpacityAttr}/>`;
  if (label) {
    const block = await renderRichTextBlock(label, {
      x: cx,
      y: cy - Math.max(textSize, 14) / 2,
      maxWidth: w - 18,
      fontSize: Math.max(14, textSize),
      weight: '700',
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

export async function renderBadgeOrCallout(state: ElementRenderState): Promise<string> {
  const { x, y, w, h, radius, fill, stroke, strokeWidth, dashAttr, fillOpacityAttr, strokeOpacityAttr, label, subtitle, textSize, color, latexMode, fontFamily } = state;
  let svg = `<rect x="${round(x)}" y="${round(y)}" width="${round(w)}" height="${round(h)}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${dashAttr}${fillOpacityAttr}${strokeOpacityAttr}/>`;
  const labelBlock = label
    ? await renderRichTextBlock(label, {
        x: x + w / 2,
        y: y + 14,
        maxWidth: w - 20,
        fontSize: Math.max(14, textSize),
        weight: '800',
        color,
        anchor: 'middle',
        maxLines: 5,
        latex: latexMode,
        fontFamily,
      })
    : { svg: '', height: 0, lines: 0 };
  svg += labelBlock.svg;
  if (subtitle) {
    const subtitleBlock = await renderRichTextBlock(subtitle, {
      x: x + w / 2,
      y: Math.max(y + h - 30, y + 18 + labelBlock.height),
      maxWidth: w - 20,
      fontSize: 12,
      weight: '500',
      color: '#64748b',
      anchor: 'middle',
      maxLines: 2,
      latex: latexMode,
      fontFamily,
    });
    svg += subtitleBlock.svg;
  }
  return svg;
}

export function renderImage(state: ElementRenderState): string {
  const { element, values, traces, assetBaseDir, x, y, w, h, radius, fill, stroke, strokeWidth, dashAttr, fillOpacityAttr, strokeOpacityAttr } = state;
  const srcValue = resolveValue(element.properties.src, values, traces);
  const href = loadImageHref(srcValue, assetBaseDir);
  const fit = resolveString(state, 'fit', 'contain');
  const imageOpacity = resolveNumber(state, 'opacity', 1);
  const preserveAspectRatio = fit === 'stretch'
    ? 'none'
    : fit === 'cover'
      ? 'xMidYMid slice'
      : 'xMidYMid meet';
  const clipId = `clip-${sanitizeId(element.name)}-${Math.abs(Math.round(x))}-${Math.abs(Math.round(y))}`;
  const clipAttr = radius > 0 ? ` clip-path="url(#${clipId})"` : '';

  let svg = '';
  if (fill && fill !== 'none') {
    svg += `<rect x="${round(x)}" y="${round(y)}" width="${round(w)}" height="${round(h)}" rx="${radius}" fill="${fill}"${fillOpacityAttr}/>`;
  }
  if (radius > 0) {
    svg += `<defs><clipPath id="${clipId}"><rect x="${round(x)}" y="${round(y)}" width="${round(w)}" height="${round(h)}" rx="${radius}"/></clipPath></defs>`;
  }
  svg += `<image href="${escapeXml(href)}" x="${round(x)}" y="${round(y)}" width="${round(w)}" height="${round(h)}" preserveAspectRatio="${preserveAspectRatio}" opacity="${round(imageOpacity, 3)}"${clipAttr}/>`;
  if (stroke && stroke !== 'none' && strokeWidth > 0) {
    svg += `<rect x="${round(x)}" y="${round(y)}" width="${round(w)}" height="${round(h)}" rx="${radius}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"${dashAttr}${strokeOpacityAttr}/>`;
  }
  return svg;
}

export async function renderLineOrArrow(state: ElementRenderState): Promise<string> {
  const { element, x, y, stroke, strokeWidth, dashAttr, strokeOpacityAttr, label, color, latexMode, fontFamily } = state;
  const { x2, y2 } = resolveLineEndpoints(state);
  const arrow = element.type === 'arrow';
  let svg = '';
  if (arrow) {
    const markerSize = Math.max(5.25, strokeWidth * 1.45);
    svg += `<defs><marker id="arrow-${escapeMarkerId(element.name)}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="${round(markerSize, 2)}" markerHeight="${round(markerSize, 2)}" orient="auto-start-reverse"><path d="M 0 1.2 L 8.8 5 L 0 8.8 z" fill="${stroke}"/></marker></defs>`;
  }
  svg += `<line x1="${round(x)}" y1="${round(y)}" x2="${round(x2)}" y2="${round(y2)}" stroke="${stroke}" stroke-width="${strokeWidth}"${dashAttr}${strokeOpacityAttr} ${arrow ? `marker-end="url(#arrow-${escapeMarkerId(element.name)})"` : ''}/>`;
  if (label) {
    const labelBlock = await renderRichTextBlock(label, {
      x: (x + x2) / 2,
      y: (y + y2) / 2 - 24,
      maxWidth: buildTextLineCap(Math.abs(x2 - x) - 16, 120),
      fontSize: 12,
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
