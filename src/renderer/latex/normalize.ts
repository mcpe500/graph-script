import { LatexMode } from './types';

const GREEK_WORDS = new Set([
  'alpha',
  'beta',
  'gamma',
  'delta',
  'epsilon',
  'zeta',
  'eta',
  'theta',
  'iota',
  'kappa',
  'lambda',
  'mu',
  'nu',
  'xi',
  'pi',
  'rho',
  'sigma',
  'tau',
  'phi',
  'chi',
  'psi',
  'omega',
]);

export function readLatexMode(value: unknown, fallback: LatexMode = 'auto'): LatexMode {
  return value === 'on' || value === 'off' || value === 'auto' ? value : fallback;
}

export function hasLatexDelimiters(value: string): boolean {
  return /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\$[^$]+\$|\\\([\s\S]+?\\\))/.test(value);
}

export function normalizeFormulaForLatex(value: string): string {
  const stripped = stripMathDelimiters(value);
  if (!stripped) return '';
  if (/\\[A-Za-z]+/.test(stripped)) return stripped;

  let normalized = stripped;
  normalized = normalized.replace(/\b(?:Sum|sum)_([A-Za-z0-9]+)\b/g, (_match, sub: string) => `\\sum_{${normalizeSubscriptToken(sub)}}`);
  normalized = normalized.replace(/\^dagger\b/g, '^\\dagger');
  normalized = normalized.replace(/->/g, '\\rightarrow');
  normalized = normalized.replace(/\|([A-Za-z]+)(\(([^)]*)\))?>/g, (_match, name: string, _group: string | undefined, args: string | undefined) =>
    `|${normalizeFunctionToken(name)}${args !== undefined ? `(${normalizeArgumentList(args)})` : ''}\\rangle`,
  );
  normalized = normalized.replace(/<([^<>\n]+)>/g, (_match, inner: string) => `\\langle ${normalizeMathExpression(inner)} \\rangle`);
  normalized = normalizeMathExpression(normalized);
  return normalized;
}

export function normalizeRichTextForLatex(value: string, latexMode: LatexMode = 'auto'): string {
  if (latexMode !== 'auto' || !value.trim()) return value;
  return replaceOutsideExistingMath(value, normalizePlainTextSegment);
}

export function stripMathDelimiters(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('$$') && trimmed.endsWith('$$')) return trimmed.slice(2, -2).trim();
  if (trimmed.startsWith('\\[') && trimmed.endsWith('\\]')) return trimmed.slice(2, -2).trim();
  if (trimmed.startsWith('$') && trimmed.endsWith('$')) return trimmed.slice(1, -1).trim();
  if (trimmed.startsWith('\\(') && trimmed.endsWith('\\)')) return trimmed.slice(2, -2).trim();
  return trimmed;
}

export function replaceOutsideExistingMath(value: string, transform: (segment: string) => string): string {
  const pattern = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\$[^$]+\$|\\\([\s\S]+?\\\))/g;
  let result = '';
  let lastIndex = 0;
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > lastIndex) result += transform(value.slice(lastIndex, index));
    result += match[0];
    lastIndex = index + match[0].length;
  }
  if (lastIndex < value.length) result += transform(value.slice(lastIndex));
  return result;
}

function normalizePlainTextSegment(segment: string): string {
  let result = segment;
  result = result.replace(/\|[A-Za-z]+(?:\([^)]*\))?>/g, (match) => `$${normalizeFormulaForLatex(match)}$`);
  result = result.replace(/<[^<>\n]+>/g, (match) => `$${normalizeFormulaForLatex(match)}$`);
  result = result.replace(/\b[A-Za-z]+\((theta|phi|psi|lambda|alpha|beta|gamma|delta|omega)\)\b/g, (match) => `$${normalizeFormulaForLatex(match)}$`);
  result = result.replace(/\b(?:Sum|sum)_[A-Za-z0-9]+\b/g, (match) => `$${normalizeFormulaForLatex(match)}$`);
  result = result.replace(/\(([A-Za-z]+_[A-Za-z0-9]+)\)/g, (_match, inner: string) => `($${normalizeFormulaForLatex(inner)}$)`);
  result = result.replace(/\b[A-Za-z]+_[A-Za-z0-9]+\b/g, (match) => `$${normalizeFormulaForLatex(match)}$`);
  result = result.replace(/\b[A-Za-z]\^dagger\s*->\s*[A-Za-z]+\b/g, (match) => `$${normalizeFormulaForLatex(match)}$`);
  result = result.replace(/\((theta|phi|psi|lambda|alpha|beta|gamma|delta|omega)\)/g, (_match, inner: string) => `($${normalizeFormulaForLatex(inner)}$)`);
  return result;
}

function normalizeMathExpression(value: string): string {
  let normalized = value.trim();
  normalized = normalized.replace(/(?<!\\)\bPi\b/g, 'P_i');
  normalized = normalized.replace(/(?<!\\)\b([A-Za-z]+)_([A-Za-z0-9]+)\b/g, (_match, base: string, sub: string) =>
    `${normalizeSymbol(base)}_{${normalizeSubscriptToken(sub)}}`,
  );
  normalized = normalized.replace(/(?<!\\)\b([A-Za-z]+)\(([^)]*)\)/g, (_match, name: string, args: string) =>
    `${normalizeFunctionToken(name)}(${normalizeArgumentList(args)})`,
  );
  normalized = normalized.replace(
    new RegExp(`(?<!\\\\)\\b(${[...GREEK_WORDS].join('|')})\\b`, 'gi'),
    (match) => `\\${match.toLowerCase()}`,
  );
  return normalized;
}

function normalizeArgumentList(value: string): string {
  return value
    .split(',')
    .map((part) => normalizeMathExpression(part.trim()))
    .join(', ');
}

function normalizeSubscriptToken(value: string): string {
  return normalizeMathExpression(value.trim());
}

function normalizeFunctionToken(word: string): string {
  return normalizeSymbol(word);
}

function normalizeSymbol(word: string): string {
  const lower = word.toLowerCase();
  if (GREEK_WORDS.has(lower)) return `\\${lower}`;
  return word;
}
