import { execFileSync } from 'child_process';
import { escapeXml, round } from './common';

export type LatexMode = 'auto' | 'on' | 'off';

interface MathFragment {
  body: string;
  viewBox: string;
  width: number;
  height: number;
  ascent: number;
}

interface RichToken {
  type: 'text' | 'math';
  value: string;
  display: boolean;
}

export interface RichTextRenderOptions {
  x: number;
  y: number;
  maxWidth: number;
  fontSize?: number;
  color?: string;
  weight?: string;
  anchor?: 'start' | 'middle' | 'end';
  lineGap?: number;
  latex?: LatexMode;
  maxLines?: number;
}

const EX_RATIO = 0.431;
const mathCache = new Map<string, Promise<MathFragment>>();
let mathJaxPromise: Promise<any> | null = null;

export function readLatexMode(value: unknown, fallback: LatexMode = 'auto'): LatexMode {
  return value === 'on' || value === 'off' || value === 'auto' ? value : fallback;
}

export function hasLatexDelimiters(value: string): boolean {
  return /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\$[^$]+\$|\\\([\s\S]+?\\\))/.test(value);
}

export async function renderDisplayFormula(
  value: string,
  x: number,
  y: number,
  options: {
    fontSize?: number;
    color?: string;
    anchor?: 'start' | 'middle' | 'end';
  } = {},
): Promise<string> {
  const fontSize = options.fontSize ?? 22;
  const color = options.color ?? '#0f172a';
  const anchor = options.anchor ?? 'middle';
  const fragment = await renderMathFragment(stripMathDelimiters(value), true, fontSize);
  return renderPlacedMath(fragment, x, y, anchor, color);
}

export async function renderRichTextBlock(value: string, options: RichTextRenderOptions): Promise<{ svg: string; height: number; lines: number }> {
  const fontSize = options.fontSize ?? 16;
  const lineGap = options.lineGap ?? Math.max(6, Math.round(fontSize * 0.3));
  const lineHeight = fontSize + lineGap;
  const anchor = options.anchor ?? 'start';
  const color = options.color ?? '#0f172a';
  const weight = options.weight ?? '600';
  const latexMode = options.latex ?? 'auto';
  const maxWidth = options.maxWidth > 0 ? options.maxWidth : Number.POSITIVE_INFINITY;
  const maxLines = Math.max(1, options.maxLines ?? 6);
  const logicalLines = value.split(/\n/g);
  const renderedLines: RichToken[][] = [];

  for (const logicalLine of logicalLines) {
    const wrapped = await wrapTokens(tokenizeRichText(logicalLine, latexMode), maxWidth, fontSize, maxLines - renderedLines.length);
    renderedLines.push(...wrapped);
    if (renderedLines.length >= maxLines) break;
  }

  let svg = '';
  for (let lineIndex = 0; lineIndex < renderedLines.length; lineIndex += 1) {
    const line = renderedLines[lineIndex];
    const lineWidth = await measureLine(line, fontSize, weight);
    const lineHeightPx = await measureLineHeight(line, fontSize);
    const ascent = Math.max(fontSize * 0.8, await measureLineAscent(line, fontSize));
    let cursorX = options.x;
    if (anchor === 'middle') cursorX -= lineWidth / 2;
    if (anchor === 'end') cursorX -= lineWidth;
    const baselineY = options.y + lineIndex * lineHeight + ascent;
    for (const token of line) {
      if (token.type === 'text') {
        const textValue = token.value;
        if (textValue) {
          svg += `<text x="${round(cursorX)}" y="${round(baselineY)}" font-size="${round(fontSize)}" font-weight="${escapeXml(weight)}" fill="${color}" xml:space="preserve">${escapeXml(textValue)}</text>`;
        }
        cursorX += measureTextWidth(textValue, fontSize, weight);
      } else {
        const fragment = await renderMathFragment(token.value, token.display, fontSize);
        svg += renderPlacedMath(fragment, cursorX, baselineY, 'start', color);
        cursorX += fragment.width;
      }
    }
    if (!line.length) {
      svg += `<text x="${round(cursorX)}" y="${round(baselineY)}" font-size="${round(fontSize)}" font-weight="${escapeXml(weight)}" fill="${color}"></text>`;
    }
    if (lineIndex === renderedLines.length - 1) {
      const usedHeight = Math.max(lineHeightPx, fontSize);
      return { svg, height: lineIndex * lineHeight + usedHeight, lines: renderedLines.length };
    }
  }

  return { svg, height: 0, lines: 0 };
}

async function wrapTokens(tokens: RichToken[], maxWidth: number, fontSize: number, maxLines: number): Promise<RichToken[][]> {
  if (!tokens.length) return [[]];
  const lines: RichToken[][] = [];
  let current: RichToken[] = [];
  let currentWidth = 0;
  const atoms = await flattenWrapTokens(tokens);

  for (const atom of atoms) {
    const token = { ...atom };
    const width = token.type === 'text' ? measureTextWidth(token.value, fontSize) : (await renderMathFragment(token.value, token.display, fontSize)).width;
    const trimmed = token.type === 'text' && current.length === 0 ? token.value.replace(/^\s+/, '') : token.value;
    const effectiveWidth = token.type === 'text' ? measureTextWidth(trimmed, fontSize) : width;
    if (token.type === 'text') token.value = trimmed;
    if (!token.value && token.type === 'text') continue;

    if (current.length > 0 && currentWidth + effectiveWidth > maxWidth) {
      lines.push(trimTrailingWhitespace(current));
      if (lines.length >= maxLines) return lines;
      current = [];
      currentWidth = 0;
      if (token.type === 'text') token.value = token.value.replace(/^\s+/, '');
    }

    current.push(token);
    currentWidth += token.type === 'text' ? measureTextWidth(token.value, fontSize) : effectiveWidth;
  }

  lines.push(trimTrailingWhitespace(current));
  return lines.slice(0, maxLines);
}

async function flattenWrapTokens(tokens: RichToken[]): Promise<RichToken[]> {
  const atoms: RichToken[] = [];
  tokens.forEach((token) => {
    if (token.type === 'math') {
      atoms.push(token);
      return;
    }
    const chunks = token.value.match(/\S+\s*|\s+/g) ?? [''];
    chunks.forEach((chunk) => atoms.push({ type: 'text', value: chunk, display: false }));
  });
  return atoms;
}

async function measureLine(tokens: RichToken[], fontSize: number, weight = '600'): Promise<number> {
  let width = 0;
  for (const token of tokens) {
    if (token.type === 'text') width += measureTextWidth(token.value, fontSize, weight);
    else width += (await renderMathFragment(token.value, token.display, fontSize)).width;
  }
  return width;
}

async function measureLineHeight(tokens: RichToken[], fontSize: number): Promise<number> {
  let maxHeight = fontSize;
  for (const token of tokens) {
    if (token.type === 'math') {
      const fragment = await renderMathFragment(token.value, token.display, fontSize);
      maxHeight = Math.max(maxHeight, fragment.height);
    }
  }
  return maxHeight;
}

async function measureLineAscent(tokens: RichToken[], fontSize: number): Promise<number> {
  let maxAscent = fontSize * 0.8;
  for (const token of tokens) {
    if (token.type === 'math') {
      const fragment = await renderMathFragment(token.value, token.display, fontSize);
      maxAscent = Math.max(maxAscent, fragment.ascent);
    }
  }
  return maxAscent;
}

function tokenizeRichText(value: string, latexMode: LatexMode): RichToken[] {
  if (latexMode === 'off') return [{ type: 'text', value, display: false }];
  const hasDelimiters = hasLatexDelimiters(value);
  if (latexMode === 'on' && !hasDelimiters) return [{ type: 'math', value: stripMathDelimiters(value), display: false }];
  if (!hasDelimiters) return [{ type: 'text', value, display: false }];

  const tokens: RichToken[] = [];
  const pattern = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\$[^$]+\$|\\\([\s\S]+?\\\))/g;
  let lastIndex = 0;
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > lastIndex) tokens.push({ type: 'text', value: value.slice(lastIndex, index), display: false });
    const raw = match[0];
    tokens.push({ type: 'math', value: stripMathDelimiters(raw), display: raw.startsWith('$$') || raw.startsWith('\\[') });
    lastIndex = index + raw.length;
  }
  if (lastIndex < value.length) tokens.push({ type: 'text', value: value.slice(lastIndex), display: false });
  return tokens;
}

function stripMathDelimiters(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('$$') && trimmed.endsWith('$$')) return trimmed.slice(2, -2).trim();
  if (trimmed.startsWith('\\[') && trimmed.endsWith('\\]')) return trimmed.slice(2, -2).trim();
  if (trimmed.startsWith('$') && trimmed.endsWith('$')) return trimmed.slice(1, -1).trim();
  if (trimmed.startsWith('\\(') && trimmed.endsWith('\\)')) return trimmed.slice(2, -2).trim();
  return trimmed;
}

function trimTrailingWhitespace(tokens: RichToken[]): RichToken[] {
  if (!tokens.length) return tokens;
  const copy = tokens.map((token) => ({ ...token }));
  const last = copy[copy.length - 1];
  if (last?.type === 'text') last.value = last.value.replace(/\s+$/g, '');
  return copy;
}

function measureTextWidth(value: string, fontSize: number, weight = '600'): number {
  const normalized = value.replace(/\t/g, '    ');
  const weightFactor = weight === '800' ? 0.62 : weight === '700' ? 0.605 : 0.58;
  return normalized.length * fontSize * weightFactor;
}

function renderPlacedMath(fragment: MathFragment, x: number, baselineY: number, anchor: 'start' | 'middle' | 'end', color: string): string {
  const left = anchor === 'middle' ? x - fragment.width / 2 : anchor === 'end' ? x - fragment.width : x;
  const top = baselineY - fragment.ascent;
  return `<svg x="${round(left)}" y="${round(top)}" width="${round(fragment.width, 3)}" height="${round(fragment.height, 3)}" viewBox="${escapeXml(fragment.viewBox)}" overflow="visible" style="color:${escapeXml(color)}">${fragment.body}</svg>`;
}

async function renderMathFragment(value: string, display: boolean, fontSize: number): Promise<MathFragment> {
  const key = `${display ? 'display' : 'inline'}:${round(fontSize, 3)}:${value}`;
  if (!mathCache.has(key)) {
    mathCache.set(key, buildMathFragment(value, display, fontSize));
  }
  return mathCache.get(key)!;
}

async function buildMathFragment(value: string, display: boolean, fontSize: number): Promise<MathFragment> {
  let html: string | null = null;
  try {
    const MathJax = await getMathJaxInProcess();
    if (MathJax?.tex2svg && MathJax?.startup?.adaptor) {
      const node = MathJax.tex2svg(value, { display, em: fontSize, ex: fontSize * EX_RATIO });
      html = MathJax.startup.adaptor.outerHTML(node) as string;
    }
  } catch {
    html = null;
  }
  if (!html) {
    try {
      html = renderMathSvgWithChildProcess(value, display, fontSize);
    } catch {
      return buildFallbackFragment(value, fontSize);
    }
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
  return { body, viewBox, width, height, ascent };
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

function renderMathSvgWithChildProcess(value: string, display: boolean, fontSize: number): string {
  const payload = JSON.stringify({ value, display, fontSize, ex: fontSize * EX_RATIO });
  const script = `
const payload = JSON.parse(process.env.GRAPHSCRIPT_MATHJAX_PAYLOAD || '{}');
const mj = require('@mathjax/src/bundle/node-main.cjs');
globalThis.MathJax = mj;
(async () => {
  const ready = await mj.init({ loader: { load: ['input/tex', 'output/svg'] } });
  const node = ready.tex2svg(payload.value, { display: payload.display, em: payload.fontSize, ex: payload.ex });
  const html = ready.startup.adaptor.outerHTML(node);
  process.stdout.write(html);
})().catch((error) => {
  process.stderr.write(String(error && error.message ? error.message : error));
  process.exit(1);
});
`;

  return execFileSync(process.execPath, ['-e', script], {
    cwd: process.cwd(),
    env: { ...process.env, GRAPHSCRIPT_MATHJAX_PAYLOAD: payload },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function buildFallbackFragment(value: string, fontSize: number): MathFragment {
  const width = Math.max(fontSize, value.length * fontSize * 0.64);
  const height = fontSize * 1.3;
  const ascent = fontSize * 0.9;
  const body = `<text x="0" y="${round(ascent)}" font-size="${round(fontSize)}" font-style="italic">${escapeXml(value)}</text>`;
  return {
    body,
    viewBox: `0 0 ${round(width, 3)} ${round(height, 3)}`,
    width,
    height,
    ascent,
  };
}

async function getMathJaxInProcess(): Promise<any> {
  if (!mathJaxPromise) {
    const mathJax = require('@mathjax/src/bundle/node-main.cjs');
    (globalThis as any).MathJax = mathJax;
    mathJaxPromise = mathJax.init({
      loader: { load: ['input/tex', 'output/svg'] },
    });
  }
  return mathJaxPromise;
}
