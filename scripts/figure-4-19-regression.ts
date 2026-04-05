#!/usr/bin/env bun

import { readFileSync } from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { Parser } from '../src/parser';
import { Evaluator } from '../src/runtime';
import { Renderer } from '../src/renderer';
import { layoutFlow, renderFlow } from '../src/renderer/flow';
import { validateDiagram } from '../src/renderer/validator';

const repoRoot = path.resolve(import.meta.dir, '..');
const filePath = path.join(repoRoot, 'temp', 'fig-4-19-simulated-annealing-flow.gs');
const declarationName = 'Gambar 4.19 Simulated Annealing Max-Cut';

function parseFigure(): { decl: any; values: Record<string, unknown>; traces: Map<string, unknown> } {
  const parser = new Parser();
  const evaluator = new Evaluator();
  const source = readFileSync(filePath, 'utf8');
  const program = parser.parse(source);
  const values = evaluator.execute(program) as Record<string, unknown>;
  const decl = Object.values(values).find((value) =>
    value
    && typeof value === 'object'
    && (value as { type?: string }).type === 'FlowDeclaration'
    && (value as { name?: string }).name === declarationName,
  ) as any | undefined;
  if (!decl) throw new Error(`Declaration "${declarationName}" not found`);
  return { decl, values, traces: evaluator.getTraces() as Map<string, unknown> };
}

async function main(): Promise<void> {
  const { decl, values, traces } = parseFigure();
  const layout = layoutFlow(decl);
  const node = (id: string) => layout.nodes.find((item) => item.id === id);
  const edge = (from: string, to: string) => layout.edges.find((item) => item.from === from && item.to === to);

  if (layout.options.layoutMode !== 'algorithmic') {
    throw new Error(`Figure 4.19: expected algorithmic layout mode, got "${layout.options.layoutMode}"`);
  }
  if (layout.height > 2200) {
    throw new Error(`Figure 4.19: flow is still too tall for a landscape document (${layout.height})`);
  }
  if ((node('output')?.y ?? 0) <= (node('cool')?.y ?? 0)) {
    throw new Error('Figure 4.19: output is not below the cooling step');
  }
  if ((node('cool')?.y ?? 0) <= (node('inc_iter')?.y ?? 0)) {
    throw new Error('Figure 4.19: cooling step is not below the inner loop body');
  }
  if ((node('prob_calc')?.x ?? 0) <= (node('better_check')?.x ?? 0)) {
    throw new Error('Figure 4.19: probabilistic branch did not move into a side lane');
  }
  if ((node('accept_update')?.x ?? 0) <= (node('prob_calc')?.x ?? 0)) {
    throw new Error('Figure 4.19: accept_update should stay in a deeper side lane than prob_calc');
  }

  const widestNode = Math.max(...layout.nodes.map((item) => item.width));
  if (widestNode > 530) {
    throw new Error(`Figure 4.19: a flow node is still too wide (${widestNode})`);
  }
  if (Math.max(...layout.nodes.map((item) => item.lines.length)) > 3) {
    throw new Error('Figure 4.19: a flow node still wraps into more than three lines');
  }

  if (edge('inc_iter', 'iter_check')?.kind !== 'back') {
    throw new Error('Figure 4.19: inner loop edge inc_iter -> iter_check is not marked as a back edge');
  }
  if (edge('cool', 'temp_check')?.kind !== 'back') {
    throw new Error('Figure 4.19: outer loop edge cool -> temp_check is not marked as a back edge');
  }
  if (edge('accept_update', 'best_check')?.kind !== 'join') {
    throw new Error('Figure 4.19: accept_update should rejoin best_check through a join edge');
  }

  if (!node('init_sol')?.lineModes.every((mode) => mode === 'plain')) {
    throw new Error('Figure 4.19: init_sol should remain plain text, not formula');
  }
  if (!node('eval_new')?.lineModes.every((mode) => mode === 'plain')) {
    throw new Error('Figure 4.19: eval_new should remain plain text, not formula');
  }
  if (node('better_check')?.lineModes[0] !== 'formula') {
    throw new Error('Figure 4.19: better_check decision should render through the formula path');
  }
  if ((node('input')?.lines.length ?? 0) < 3) {
    throw new Error('Figure 4.19: input node lost its explicit multi-line structure');
  }

  const validation = await validateDiagram(decl, values as any, traces as any);
  if (!validation.valid || validation.issues.length > 0) {
    throw new Error(`Figure 4.19: validation is not clean (${validation.issues.map((issue) => issue.kind).join(', ')})`);
  }

  const svg = renderFlow(layout, decl.name);
  if (!svg.includes('&#916; E &lt; 0?')) {
    throw new Error('Figure 4.19: rendered SVG is missing the normalized Delta-E decision label');
  }
  if (!svg.includes('SOLUSI_SEKARANG &lt;-') || !svg.includes('RANDOM_BITSTRING(|V|)')) {
    throw new Error('Figure 4.19: rendered SVG is missing the plain-text initialization assignment');
  }

  const outputDir = path.join(repoRoot, 'output');
  const renderer = new Renderer({ outputDir, baseDir: path.dirname(filePath), format: 'png' });
  await renderer.render({ [declarationName]: decl } as any, traces as any, {
    outputDir,
    baseDir: path.dirname(filePath),
    format: 'png',
  });
  const outputPath = path.join(outputDir, 'Gambar 4.19 Simulated Annealing Max-Cut.png');
  const metadata = await sharp(outputPath).metadata();
  if ((metadata.width ?? 0) < 1500 || (metadata.height ?? 0) < 1800 || (metadata.height ?? 0) > 2400) {
    throw new Error(`Figure 4.19: raster export size is wrong (${metadata.width}x${metadata.height})`);
  }

  console.log(`PASS Figure 4.19 regression: ${layout.width.toFixed(1)}x${layout.height.toFixed(1)} widestNode=${Math.round(widestNode)} outputY=${Math.round(node('output')?.y ?? 0)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
