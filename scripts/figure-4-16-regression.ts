#!/usr/bin/env bun

import { readFileSync } from 'fs';
import * as path from 'path';
import { Parser } from '../src/parser';
import { Evaluator } from '../src/runtime';
import { Renderer } from '../src/renderer';
import { readNumber, resolveValue } from '../src/renderer/common';
import { prepareDiagramLayout } from '../src/renderer/diagram';
import { compileSemanticDiagram } from '../src/renderer/diagram-semantic';
import { validateDiagram } from '../src/renderer/validator';

const repoRoot = path.resolve(import.meta.dir, '..');
const filePath = path.join(repoRoot, 'temp', 'fig-4-16-vqe-measurement.gs');
const declarationName = 'Gambar 4.16 - Pengukuran Hamiltonian VQE';

function parseFigure(): { decl: any; values: Record<string, unknown>; traces: Map<string, unknown> } {
  const parser = new Parser();
  const evaluator = new Evaluator();
  const source = readFileSync(filePath, 'utf8');
  const program = parser.parse(source);
  const values = evaluator.execute(program) as Record<string, unknown>;
  const decl = Object.values(values).find((value) =>
    value
    && typeof value === 'object'
    && (value as { type?: string }).type === 'DiagramDeclaration'
    && (value as { name?: string }).name === declarationName,
  ) as any | undefined;
  if (!decl) throw new Error(`Declaration "${declarationName}" not found`);
  return { decl, values, traces: evaluator.getTraces() as Map<string, unknown> };
}

function elementBottom(element: any): number {
  const y = element.properties?.y?.value;
  const h = element.properties?.h?.value;
  return typeof y === 'number' && typeof h === 'number' ? y + h : 0;
}

async function main(): Promise<void> {
  const { decl, values, traces } = parseFigure();
  const authoredWidth = readNumber(resolveValue(decl.properties.width, values as any, traces as any), 1240);
  const authoredHeight = readNumber(resolveValue(decl.properties.height, values as any, traces as any), 1220);
  const semantic = await compileSemanticDiagram(decl.elements, values as any, traces as any, authoredWidth, authoredHeight, {});
  const prepared = await prepareDiagramLayout(decl, values as any, traces as any);

  if (prepared.height < semantic.minHeight) {
    throw new Error(`Figure 4.16: prepared canvas height ${prepared.height} is smaller than semantic minHeight ${semantic.minHeight}`);
  }

  const measurement = prepared.elements.find((element: any) => element.type === 'panel' && element.name === 'measurement');
  if (!measurement) {
    throw new Error('Figure 4.16: measurement panel is missing from prepared layout');
  }

  const measurementBottom = elementBottom(measurement);
  if (measurementBottom > prepared.height) {
    throw new Error(`Figure 4.16: measurement panel bottom ${measurementBottom} exceeds canvas height ${prepared.height}`);
  }

  const maxBottom = Math.max(...prepared.elements.map((element: any) => elementBottom(element)), 0);
  if (maxBottom > prepared.height) {
    throw new Error(`Figure 4.16: compiled content bottom ${maxBottom} exceeds canvas height ${prepared.height}`);
  }

  const validation = await validateDiagram(decl, values as any, traces as any);
  const clippingKinds = ['canvas_overflow_clipping', 'hard_constraint_overflow'];
  for (const kind of clippingKinds) {
    if (validation.issues.some((issue) => issue.kind === kind)) {
      throw new Error(`Figure 4.16: validation produced forbidden issue "${kind}"`);
    }
  }

  const renderer = new Renderer({ baseDir: path.dirname(filePath) });
  const svg = await renderer.renderDeclaration(declarationName, decl, values as any, traces as any, path.dirname(filePath));
  if (!svg) throw new Error('Figure 4.16: renderer returned no SVG');
  const sizeMatch = svg.match(/width="([0-9.]+)" height="([0-9.]+)"/);
  if (!sizeMatch) throw new Error('Figure 4.16: rendered SVG is missing width/height');
  const renderedHeight = Number(sizeMatch[2]);
  if (renderedHeight < semantic.minHeight) {
    throw new Error(`Figure 4.16: rendered SVG height ${renderedHeight} is smaller than semantic minHeight ${semantic.minHeight}`);
  }

  console.log(`PASS Figure 4.16 regression: authored=${authoredWidth}x${authoredHeight} semanticMin=${semantic.minHeight} final=${prepared.width}x${prepared.height} measurementBottom=${Math.round(measurementBottom)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
