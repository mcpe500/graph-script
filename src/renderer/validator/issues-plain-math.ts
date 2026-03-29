import { DiagramElement } from '../../ast/types';
import { GSValue, Trace } from '../../runtime/values';
import { resolveValue } from '../common';
import { readLatexMode } from '../latex';
import { ValidationIssue } from './types';
import { getNumberProperty, getStringProperty } from './helpers';

const INLINE_MATH_PATTERN = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\$[^$]+\$|\\\([\s\S]+?\\\))/g;

const PLAIN_MATH_PATTERNS = [
  /\b[Zz]\d+\b/,
  /\([^)\n]+\)\s*\/\s*\d+/,
  /\b[Zz]\d+\s*=\s*[+\-]?\d+\b/,
  /\b[A-Z]_[A-Za-z0-9]+\s*=/,
  /->\s*[+\-]?\d+\b/,
];

export function detectPlainMathTextIssues(
  elements: DiagramElement[],
  values: Record<string, GSValue>,
  traces: Map<string, Trace>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const visit = (list: DiagramElement[]) => {
    for (const element of list) {
      if (element.type === 'text') {
        const value = getStringProperty(element, values, traces, 'value', getStringProperty(element, values, traces, 'label', ''));
        const latexMode = readLatexMode(resolveValue(element.properties.latex, values, traces), 'auto');
        if (value.trim() && latexMode !== 'on' && containsPlainMathOutsideLatex(value)) {
          const x = getNumberProperty(element, values, traces, 'x', 0);
          const y = getNumberProperty(element, values, traces, 'y', 0);
          const w = getNumberProperty(element, values, traces, 'w', 0);
          const h = getNumberProperty(element, values, traces, 'h', 0);
          issues.push({
            kind: 'plain_math_text',
            element1: { id: element.name, type: element.type },
            element2: { id: element.name, type: element.type },
            overlapArea: 0,
            overlapPercentage: 0,
            severity: 'warning',
            location: { x, y, width: w, height: h },
            message: `Text "${element.name}" contains math-like content that should use inline LaTeX or a formula element`,
          });
        }
      }

      if (element.children?.length) visit(element.children);
    }
  };

  visit(elements);
  return issues;
}

function containsPlainMathOutsideLatex(value: string): boolean {
  const plainSegments = value
    .split(INLINE_MATH_PATTERN)
    .filter((segment, index) => index % 2 === 0)
    .map((segment) => segment.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  return plainSegments.some((segment) => PLAIN_MATH_PATTERNS.some((pattern) => pattern.test(segment)));
}
