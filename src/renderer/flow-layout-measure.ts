import { wrapText } from './common';
import { FitMode, FlowNodeDecl, FlowTextMode, LayoutNode, NodeBox } from './flow-types';

/**
 * Node text measuring and node box creation for flow layout.
 */
export function measureNodes(
  orderedNodeIds: string[],
  nodeById: Map<string, FlowNodeDecl>,
  fontSize: number,
  fit: FitMode,
): Map<string, NodeBox> {
  const measured = new Map<string, NodeBox>();
  orderedNodeIds.forEach((id) => {
    const node = nodeById.get(id);
    if (!node) return;
    measured.set(id, measureNode(node.label || node.id, node.nodeType, fontSize, fit));
  });
  return measured;
}

export function createNode(id: string, box?: NodeBox): LayoutNode {
  const measured = box ?? measureNode(id, undefined, 17, 'readable');
  return {
    id,
    label: measured.label,
    nodeType: measured.nodeType,
    width: measured.width,
    height: measured.height,
    lines: measured.lines,
    lineModes: measured.lineModes,
    x: 0,
    y: 0,
    fontSize: measured.fontSize,
    lineHeight: measured.lineHeight,
  };
}

function measureNode(label: string, type: string | undefined, fontSize: number, fit: FitMode): NodeBox {
  const kind = (type ?? 'process').toLowerCase();
  const lineHeight = Math.round(fontSize * 1.22);
  const { lines, lineModes } = splitFlowLabel(label, kind, fit);
  const textWidth = Math.max(...lines.map((line, index) => approximateLineWidth(line, fontSize, lineModes[index])), fontSize * 6.2);
  const textHeight = lines.length * lineHeight;
  const hasFormulaLine = lineModes.includes('formula');
  const widthPadding = hasFormulaLine ? 78 : 64;
  const readable = fit === 'readable';

  switch (kind) {
    case 'decision':
      return {
        width: Math.max(readable ? 280 : 250, textWidth + 98),
        height: Math.max(readable ? 98 : 108, textHeight + (readable ? 42 : 52)),
        lines,
        lineModes,
        fontSize,
        lineHeight,
        label,
        nodeType: type,
      };
    case 'start':
    case 'end':
      return {
        width: Math.max(readable ? 210 : 190, textWidth + 74),
        height: Math.max(readable ? 68 : 74, textHeight + (readable ? 30 : 36)),
        lines,
        lineModes,
        fontSize,
        lineHeight,
        label,
        nodeType: type,
      };
    case 'data':
      return {
        width: Math.max(readable ? 360 : 280, textWidth + 72),
        height: Math.max(readable ? 90 : 96, textHeight + (readable ? 36 : 42)),
        lines,
        lineModes,
        fontSize,
        lineHeight,
        label,
        nodeType: type,
      };
    default:
      return {
        width: Math.max(readable ? 340 : 290, textWidth + widthPadding),
        height: Math.max(readable ? 90 : 98, textHeight + (readable ? 36 : 42)),
        lines,
        lineModes,
        fontSize,
        lineHeight,
        label,
        nodeType: type,
      };
  }
}

function splitFlowLabel(label: string, kind: string, fit: FitMode): { lines: string[]; lineModes: FlowTextMode[] } {
  const normalized = (label || '').replace(/\\n/g, '\n').trim();
  if (!normalized) return { lines: [''], lineModes: ['plain'] };

  const maxChars = fit === 'compact'
    ? (kind === 'decision' ? 18 : kind === 'data' ? 26 : 24)
    : (kind === 'decision' ? 24 : kind === 'data' ? 38 : 34);
  const maxLines = kind === 'decision'
    ? 2
    : kind === 'start' || kind === 'end'
      ? 3
      : 4;

  const lines: string[] = [];
  const lineModes: FlowTextMode[] = [];
  const paragraphs = normalized.split('\n').map((part) => part.trim()).filter(Boolean);

  for (const paragraph of paragraphs) {
    if (lines.length >= maxLines) break;
    const explicitFormula = parseExplicitFormulaLine(paragraph);
    if (explicitFormula) {
      lines.push(explicitFormula);
      lineModes.push('formula');
      continue;
    }

    const remaining = maxLines - lines.length;
    const wrapped = wrapText(paragraph, maxChars, remaining);
    wrapped.forEach((line) => {
      lines.push(line);
      lineModes.push('plain');
    });
  }

  if (!lines.length) return { lines: [''], lineModes: ['plain'] };
  return { lines, lineModes };
}

function parseExplicitFormulaLine(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const dollar = trimmed.match(/^\$(.+)\$([?!.:])?$/);
  if (dollar) return normalizeExplicitFormula(dollar[1], dollar[2]);
  const inline = trimmed.match(/^\\\((.+)\\\)([?!.:])?$/);
  if (inline) return normalizeExplicitFormula(inline[1], inline[2]);
  return null;
}

function normalizeExplicitFormula(value: string, trailing = ''): string {
  let normalized = value.trim().replace(/\\\\/g, '\\');
  normalized = normalized
    .replace(/\\Delta/g, '\u0394')
    .replace(/\\alpha/g, '\u03B1')
    .replace(/\\beta/g, '\u03B2')
    .replace(/\\gamma/g, '\u03B3')
    .replace(/\\theta/g, '\u03B8')
    .replace(/\\lambda/g, '\u03BB')
    .replace(/\\leq?/g, '\u2264')
    .replace(/\\geq?/g, '\u2265')
    .replace(/\\neq/g, '\u2260')
    .replace(/\\times/g, '\u00D7')
    .replace(/\\cdot/g, '\u00B7')
    .replace(/\\leftarrow/g, '\u2190')
    .replace(/\\rightarrow/g, '\u2192')
    .replace(/\\exp/g, 'exp')
    .replace(/\\mathrm\{([^}]+)\}/g, '$1')
    .replace(/\\text\{([^}]+)\}/g, '$1')
    .replace(/\{([^}]+)\}/g, '$1')
    .replace(/\\_/g, '_')
    .replace(/\s+/g, ' ')
    .trim();

  normalized = normalized.replace(/([A-Za-z0-9])_([A-Za-z0-9]+)/g, (_match, base: string, sub: string) => `${base}${toSubscript(sub)}`);
  normalized = normalized.replace(/\^(-?[A-Za-z0-9]+)/g, (_match, sup: string) => toSuperscript(sup));
  return `${normalized}${trailing}`;
}

function approximateLineWidth(line: string, fontSize: number, mode: FlowTextMode): number {
  if (mode === 'formula') return Math.max(fontSize * 5.2, line.length * fontSize * 0.72);
  return Math.max(fontSize * 5.2, line.length * fontSize * 0.64);
}

function toSubscript(value: string): string {
  const map: Record<string, string> = {
    '0': '\u2080', '1': '\u2081', '2': '\u2082', '3': '\u2083', '4': '\u2084', '5': '\u2085', '6': '\u2086', '7': '\u2087', '8': '\u2088', '9': '\u2089',
    '+': '\u208A', '-': '\u208B', '=': '\u208C', '(': '\u208D', ')': '\u208E',
    a: '\u2090', e: '\u2091', h: '\u2095', i: '\u1D62', j: '\u2C7C', k: '\u2096', l: '\u2097', m: '\u2098', n: '\u2099', o: '\u2092', p: '\u209A', r: '\u1D63', s: '\u209B', t: '\u209C', u: '\u1D64', v: '\u1D65', x: '\u2093',
  };
  return value.split('').map((char) => map[char] ?? char).join('');
}

function toSuperscript(value: string): string {
  const map: Record<string, string> = {
    '0': '\u2070', '1': '\u00B9', '2': '\u00B2', '3': '\u00B3', '4': '\u2074', '5': '\u2075', '6': '\u2076', '7': '\u2077', '8': '\u2078', '9': '\u2079',
    '+': '\u207A', '-': '\u207B', '=': '\u207C', '(': '\u207D', ')': '\u207E',
    a: '\u1D43', b: '\u1D47', c: '\u1D9C', d: '\u1D48', e: '\u1D49', f: '\u1DA0', g: '\u1D4D', h: '\u02B0', i: '\u2071', j: '\u02B2', k: '\u1D4F', l: '\u02E1', m: '\u1D50', n: '\u207F', o: '\u1D52', p: '\u1D56', r: '\u02B3', s: '\u02E2', t: '\u1D57', u: '\u1D58', v: '\u1D5B', w: '\u02B7', x: '\u02E3', y: '\u02B8', z: '\u1DBB',
  };
  return value.split('').map((char) => map[char] ?? char).join('');
}
