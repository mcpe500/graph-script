import { escapeXml, round } from '../common';
import { DEFAULT_FONT_FAMILY, MathFragment } from './types';
import { normalizeFormulaForLatex } from './normalize';
import { EX_RATIO } from './measure';
import { MathRenderer } from './math-renderer';
import { NodeMathRenderer } from './math-node';
import { BrowserMathRenderer } from './math-browser';

const mathCache = new Map<string, Promise<MathFragment>>();

let activeMathRenderer: MathRenderer | null = null;
let fallbackMathRenderer: MathRenderer = new NodeMathRenderer();

export function setMathRenderer(renderer: MathRenderer): void {
  activeMathRenderer = renderer;
}

export function getMathRenderer(): MathRenderer {
  if (activeMathRenderer) return activeMathRenderer;
  return fallbackMathRenderer;
}

export function renderPlacedMath(
  fragment: MathFragment,
  x: number,
  baselineY: number,
  anchor: 'start' | 'middle' | 'end',
  color: string,
): string {
  const left = anchor === 'middle' ? x - fragment.width / 2 : anchor === 'end' ? x - fragment.width : x;
  const top = baselineY - fragment.ascent;
  const fallbackAttr = fragment.fallback ? ' data-math-fallback="true"' : '';
  const normalizedAttr = fragment.normalizedValue ? ` data-latex="${escapeXml(fragment.normalizedValue)}"` : '';
  return `<svg x="${round(left)}" y="${round(top)}" width="${round(fragment.width, 3)}" height="${round(fragment.height, 3)}" viewBox="${escapeXml(fragment.viewBox)}" overflow="visible" style="color:${escapeXml(color)}"${fallbackAttr}${normalizedAttr}>${fragment.body}</svg>`;
}

export async function renderMathFragment(value: string, display: boolean, fontSize: number): Promise<MathFragment> {
  const normalizedValue = normalizeFormulaForLatex(value);
  const key = `${display ? 'display' : 'inline'}:${round(fontSize, 3)}:${normalizedValue}`;
  if (!mathCache.has(key)) {
    mathCache.set(key, buildMathFragment(normalizedValue, display, fontSize));
  }
  return mathCache.get(key)!;
}

async function buildMathFragment(value: string, display: boolean, fontSize: number): Promise<MathFragment> {
  let html: string | null = null;
  const renderer = getMathRenderer();

  try {
    html = renderer.renderToSvgHtml(value, display, fontSize, fontSize * EX_RATIO);
  } catch {
    html = null;
  }

  if (!html) {
    try {
      html = await renderer.renderToSvgHtmlAsync(value, display, fontSize, fontSize * EX_RATIO);
    } catch {
      html = null;
    }
  }

  if (!html) {
    return buildFallbackFragment(value, fontSize);
  }

  const svgMatch = html.match(/<svg\b([^>]*)>([\s\S]*?)<\/svg>/i);
  if (!svgMatch) return buildFallbackFragment(value, fontSize);

  const attrs = svgMatch[1];
  const body = sanitizeMathSvgBody(svgMatch[2]);
  const width = parseSvgLength(attrs.match(/\bwidth="([^"]+)"/)?.[1], fontSize);
  const height = parseSvgLength(attrs.match(/\bheight="([^"]+)"/)?.[1], fontSize);
  const viewBox = attrs.match(/\bviewBox="([^"]+)"/)?.[1] ?? `0 0 ${round(width, 3)} ${round(height, 3)}`;
  const view = viewBox.split(/\s+/).map((part) => Number(part));
  const minY = Number.isFinite(view[1]) ? view[1] : 0;
  const viewHeight = Number.isFinite(view[3]) && view[3] > 0 ? view[3] : height;
  const ascent = minY < 0 ? height * (-minY / viewHeight) : height * 0.8;
  return { body, viewBox, width, height, ascent, fallback: false, normalizedValue: value };
}

function sanitizeMathSvgBody(body: string): string {
  return body.replace(/\sdata-latex="([^"]*)"/g, (_match, rawValue: string) => ` data-latex="${escapeXml(rawValue)}"`);
}

function parseSvgLength(raw: string | undefined, fontSize: number): number {
  if (!raw) return fontSize;
  const match = raw.match(/^([0-9.]+)(ex|em|px)?$/);
  if (!match) return Number(raw) || fontSize;
  const value = Number(match[1]);
  const unit = match[2] ?? 'px';
  if (unit === 'ex') return value * fontSize * EX_RATIO;
  if (unit === 'em') return value * fontSize;
  return value;
}

function buildFallbackFragment(value: string, fontSize: number): MathFragment {
  const width = Math.max(fontSize, value.length * fontSize * 0.64);
  const height = fontSize * 1.3;
  const ascent = fontSize * 0.9;
  const body = `<text x="0" y="${round(ascent)}" font-size="${round(fontSize)}" font-style="italic" font-family="${escapeXml(DEFAULT_FONT_FAMILY)}">${escapeXml(value)}</text>`;
  return {
    body,
    viewBox: `0 0 ${round(width, 3)} ${round(height, 3)}`,
    width,
    height,
    ascent,
    fallback: true,
    normalizedValue: value,
  };
}
