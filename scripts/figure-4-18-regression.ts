#!/usr/bin/env bun

import { readFileSync } from 'fs';
import * as path from 'path';
import { Parser } from '../src/parser';
import { Evaluator } from '../src/runtime';
import { Renderer } from '../src/renderer';
import { buildValidationSnapshot, validateDiagram } from '../src/renderer/validator';

const repoRoot = path.resolve(import.meta.dir, '..');
const parser = new Parser();

function parseDeclaration(source: string, declarationName?: string): { decl: any; values: Record<string, unknown>; traces: Map<string, unknown> } {
  const evaluator = new Evaluator();
  const program = parser.parse(source);
  const values = evaluator.execute(program) as Record<string, unknown>;
  const decl = Object.values(values).find((value) =>
    value
    && typeof value === 'object'
    && (value as { type?: string }).type?.endsWith('Declaration')
    && (!declarationName || (value as { name?: string }).name === declarationName),
  ) as any | undefined;
  if (!decl) throw new Error(`No declaration found${declarationName ? ` for "${declarationName}"` : ''}`);
  return { decl, values, traces: evaluator.getTraces() as Map<string, unknown> };
}

async function assertFigure418Fixtures(): Promise<void> {
  const directFile = path.join(repoRoot, 'temp', 'qaoa', 'Gambar_4_18_MaxCut_Problem_Statement.gs');
  const directSource = readFileSync(directFile, 'utf8');
  const direct = parseDeclaration(directSource, 'Gambar_4_18_MaxCut_Problem_Statement');
  const page = parseDeclaration(buildFigure418PageSource(directSource), 'Gambar_4_18_Page_Embed');

  const panelRight = findChildRecursive(direct.decl.elements, 'panelRight');
  if (!findChildRecursive(panelRight?.children ?? [], 'k3Formula', 'formula')) {
    throw new Error('Figure 4.18: K3 expression is not authored as a formula element');
  }

  const directValidation = await validateDiagram(direct.decl, direct.values as any, direct.traces as any);
  const pageValidation = await validateDiagram(page.decl, page.values as any, page.traces as any);
  const forbiddenKinds = ['plain_math_text', 'math_fallback'];
  for (const kind of forbiddenKinds) {
    if (directValidation.issues.some((issue) => issue.kind === kind)) {
      throw new Error(`Figure 4.18 direct produced forbidden issue "${kind}"`);
    }
    if (pageValidation.issues.some((issue) => issue.kind === kind)) {
      throw new Error(`Figure 4.18 page embed produced forbidden issue "${kind}"`);
    }
  }

  const renderer = new Renderer({ baseDir: path.dirname(directFile) });
  const svg = await renderer.renderDeclaration(
    'Gambar_4_18_MaxCut_Problem_Statement',
    direct.decl,
    direct.values as any,
    direct.traces as any,
    path.dirname(directFile),
  );
  if (!svg) throw new Error('Figure 4.18: renderer returned no SVG');
  if (!svg.includes('data-latex="\\frac{I - Z_0 Z_1}{2} + \\frac{I - Z_0 Z_2}{2} + \\frac{I - Z_1 Z_2}{2}"')) {
    throw new Error('Figure 4.18: rendered SVG is missing K3 formula LaTeX output');
  }
  if (svg.includes('(I - Z0Z1)/2')) {
    throw new Error('Figure 4.18: rendered SVG still contains legacy plain-text K3 math');
  }

  const snapshot = await buildValidationSnapshot(direct.decl, direct.values as any, direct.traces as any);
  const panelLeft = findChildRecursive(snapshot.elements, 'panelLeft');
  const panelMid = findChildRecursive(snapshot.elements, 'panelMid');
  const panelRightCompiled = findChildRecursive(snapshot.elements, 'panelRight');
  if (!panelLeft || !panelMid || !panelRightCompiled) {
    throw new Error('Figure 4.18: expected panels are missing from validation snapshot');
  }

  const panelHeights = [
    (panelLeft.properties.h as any).value,
    (panelMid.properties.h as any).value,
    (panelRightCompiled.properties.h as any).value,
  ];
  if (panelHeights.some((height) => Math.abs(height - 690) > 12)) {
    throw new Error(`Figure 4.18: panel heights drifted too far from authored layout (${panelHeights.join(', ')})`);
  }

  const graphChildren = (panelLeft.children ?? []).filter((child) => (child.properties.compiled_from_graph as any)?.value === true);
  const panelLeftDescendants = flattenChildren(panelLeft.children ?? []);
  const graphDescendants = panelLeftDescendants.filter((child) => (child.properties.compiled_from_graph as any)?.value === true);
  const legendBlue = panelLeftDescendants.find((child) => child.name === 'legendBlue');
  const legendOrange = panelLeftDescendants.find((child) => child.name === 'legendOrange');
  const legendCut = panelLeftDescendants.find((child) => child.name === 'legendCut');
  if (!legendBlue || !legendOrange || !legendCut || graphDescendants.length === 0) {
    throw new Error('Figure 4.18: expected graph and legend children are missing from left panel');
  }

  const graphBottom = Math.max(...graphDescendants.map((child) => child.properties.y?.value + (child.properties.h?.value ?? 0)));
  const legendTop = Math.min(
    (legendBlue.properties.y as any).value,
    (legendOrange.properties.y as any).value,
    (legendCut.properties.y as any).value,
  );
  const legendBottom = Math.max(
    (legendBlue.properties.y as any).value + (legendBlue.properties.h as any).value,
    (legendOrange.properties.y as any).value + (legendOrange.properties.h as any).value,
    (legendCut.properties.y as any).value + (legendCut.properties.h as any).value,
  );
  if (graphBottom > 520) {
    throw new Error(`Figure 4.18: graph content drifted too low inside left panel (${graphBottom})`);
  }
  if (legendTop < 480 || legendBottom > 650) {
    throw new Error(`Figure 4.18: legend block drifted out of its intended region (${legendTop}-${legendBottom})`);
  }

  console.log(`PASS Figure 4.18 regression: panels=${panelHeights.join('/')} graphBottom=${Math.round(graphBottom)} legend=${Math.round(legendTop)}-${Math.round(legendBottom)}`);
}

function findChildRecursive(children: any[], name: string, type?: string): any | undefined {
  for (const child of children) {
    if (child.name === name && (!type || child.type === type)) return child;
    const nested = findChildRecursive(child.children ?? [], name, type);
    if (nested) return nested;
  }
  return undefined;
}

function flattenChildren(children: any[]): any[] {
  const flat: any[] = [];
  for (const child of children) {
    flat.push(child);
    flat.push(...flattenChildren(child.children ?? []));
  }
  return flat;
}

async function assertManualMeasurementPass(): Promise<void> {
  const { decl, values, traces } = parseDeclaration(`diagram "Manual":
  width = 640
  height = 420
  fixed_canvas = true
  readability_mode = "auto"
  box panel x=40 y=40 w=240 h=180:
    text intro x=20 y=20 w=150 h=18 value="Narasi dengan $b_i = 0$, $z_i = +1$, dan $C(z) = 2$ yang harus tetap terbaca." latex="auto" size=12
    formula eq x=120 y=62 value="\\frac{I - Z_0 Z_1}{2} + \\frac{I - Z_0 Z_2}{2}" size=18
    text tail x=20 y=86 w=150 h=18 value="Penutup" size=12
`);
  const snapshot = await buildValidationSnapshot(decl, values as any, traces as any);
  const panel = snapshot.elements.find((element) => element.name === 'panel');
  const intro = panel?.children?.find((child) => child.name === 'intro');
  const eq = panel?.children?.find((child) => child.name === 'eq');
  const tail = panel?.children?.find((child) => child.name === 'tail');
  if (!panel || !intro || !eq || !tail) {
    throw new Error('Manual measurement smoke: expected panel children are missing');
  }

  if ((intro.properties.h as any).value <= 18) {
    throw new Error('Manual measurement smoke: intro text was not remeasured to a larger height');
  }
  if ((eq.properties.h as any).value <= 0) {
    throw new Error('Manual measurement smoke: formula did not receive measured height');
  }
  if ((tail.properties.y as any).value <= 86) {
    throw new Error('Manual measurement smoke: stacked tail text was not pushed down');
  }
  if ((panel.properties.h as any).value < 180) {
    throw new Error('Manual measurement smoke: panel height unexpectedly shrank');
  }

  console.log('PASS Manual measurement regression');
}

async function assertPlainMathGuardrail(): Promise<void> {
  const { decl, values, traces } = parseDeclaration(`diagram "Plain Math":
  width = 480
  height = 220
  text k3 x=20 y=20 w=320 h=28 value="(I - Z0Z1)/2 + (I - Z0Z2)/2"
  text latexOk x=20 y=60 w=320 h=28 value="Biru = $b_i = 0$, $C(z) = 2$" latex="auto"
`);
  const validation = await validateDiagram(decl, values as any, traces as any);
  if (!validation.issues.some((issue) => issue.kind === 'plain_math_text' && issue.element1.id === 'k3')) {
    throw new Error('Plain math guardrail: expected raw ASCII math to be flagged');
  }
  if (validation.issues.some((issue) => issue.kind === 'plain_math_text' && issue.element1.id === 'latexOk')) {
    throw new Error('Plain math guardrail: inline LaTeX text was flagged unexpectedly');
  }

  console.log('PASS Plain math guardrail');
}

async function main(): Promise<void> {
  await assertFigure418Fixtures();
  await assertManualMeasurementPass();
  await assertPlainMathGuardrail();
}

function buildFigure418PageSource(diagramSource: string): string {
  return `${diagramSource}

page "Gambar_4_18_Page_Embed":
  width = 1040
  height = 720
  columns = 1
  rows = 1
  min_embed_scale = 0.72
  place "Gambar_4_18_MaxCut_Problem_Statement" at cell(1,1)
`;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
