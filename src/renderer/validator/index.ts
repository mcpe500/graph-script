export * from './types';
export * from './helpers';
export * from './detection';
export * from './readability';
export * from './issues';
export * from './semantic-issues';
export * from './relayout';
export * from './report';

import { GSValue, Trace } from '../../runtime/values';
import { ValidationResult, MAX_RETRIES } from './types';
import { buildValidationSnapshot, calculateReadability, calculateReadabilityScore } from './readability';
import { collectValidationIssues } from './issues';
import { attemptRelayout } from './relayout';
import { generateReport } from './report';
import { isValidatableDeclaration, needsRelayout } from './types';

export async function validateAndAdjust(
  decl: any,
  values: Record<string, GSValue>,
  traces: Map<string, Trace>,
  maxRetries = MAX_RETRIES
): Promise<{
  adjustedDecl: any;
  validation: ValidationResult;
  report: import('./types').ValidationReport;
}> {
  const declType = decl.type || 'Unknown';
  const declName = decl.name || 'unnamed';

  if (!needsRelayout(declType)) {
    const snapshot = await buildValidationSnapshot(decl, values, traces);
    const metrics = calculateReadability(snapshot.elements, values, traces);
    const issues = collectValidationIssues(snapshot, values, traces);
    const score = calculateReadabilityScore(metrics, issues);

    return {
      adjustedDecl: decl,
      validation: {
        valid: !issues.some((issue) => issue.severity === 'error' || issue.severity === 'warning'),
        issues,
        readabilityScore: score,
      },
      report: generateReport(0, issues, metrics, !issues.some((issue) => issue.severity === 'error' || issue.severity === 'warning'), declName, declType),
    };
  }

  let currentDecl = decl;
  let attempt = 0;
  let lastIssues: import('./types').ValidationIssue[] = [];

  while (attempt <= maxRetries) {
    const snapshot = await buildValidationSnapshot(currentDecl, values, traces);
    if (snapshot.elements.length === 0 && snapshot.boxes.length === 0) {
      const metrics = calculateReadability([], values, traces);
      return {
        adjustedDecl: currentDecl,
        validation: { valid: true, issues: [], readabilityScore: 100 },
        report: generateReport(attempt, [], metrics, true, declName, declType),
      };
    }

    const issues = collectValidationIssues(snapshot, values, traces);
    lastIssues = issues;

    const metrics = calculateReadability(snapshot.elements, values, traces);
    const hasErrors = issues.some((i) => i.severity === 'error');

    if (!hasErrors) {
      return {
        adjustedDecl: currentDecl,
        validation: {
          valid: true,
          issues,
          readabilityScore: calculateReadabilityScore(metrics, issues),
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

  const finalSnapshot = await buildValidationSnapshot(currentDecl, values, traces);
  const finalMetrics = calculateReadability(finalSnapshot.elements, values, traces);

  return {
    adjustedDecl: currentDecl,
    validation: {
      valid: false,
      issues: lastIssues,
      readabilityScore: calculateReadabilityScore(finalMetrics, lastIssues),
    },
    report: generateReport(attempt, lastIssues, finalMetrics, false, declName, declType),
  };
}

export async function validateDiagram(
  decl: any,
  values: Record<string, GSValue>,
  traces: Map<string, Trace>
): Promise<ValidationResult> {
  const snapshot = await buildValidationSnapshot(decl, values, traces);
  if (snapshot.elements.length === 0 && snapshot.boxes.length === 0) {
    return { valid: true, issues: [], readabilityScore: 100 };
  }

  const issues = collectValidationIssues(snapshot, values, traces);
  const metrics = calculateReadability(snapshot.elements, values, traces);

  const hasErrors = issues.some((i) => i.severity === 'error');

  return {
    valid: !hasErrors,
    issues,
    readabilityScore: calculateReadabilityScore(metrics, issues),
  };
}
