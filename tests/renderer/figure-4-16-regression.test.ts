import * as fs from 'fs';
import * as path from 'path';
import { Parser } from '../../src/parser';
import { Evaluator } from '../../src/runtime';
import { Renderer } from '../../src/renderer';
import { readNumber, resolveValue } from '../../src/renderer/common';
import { prepareDiagramLayout } from '../../src/renderer/diagram';
import { compileSemanticDiagram } from '../../src/renderer/diagram-semantic';
import { validateDiagram } from '../../src/renderer/validator';

const repoRoot = path.resolve(__dirname, '../..');
const filePath = path.join(repoRoot, 'temp', 'fig-4-16-vqe-measurement.gs');
const declarationName = 'Gambar 4.16 - Pengukuran Hamiltonian VQE';

function parseFigure(): { decl: any; values: Record<string, unknown>; traces: Map<string, unknown> } {
  const parser = new Parser();
  const evaluator = new Evaluator();
  const source = fs.readFileSync(filePath, 'utf8');
  const program = parser.parse(source);
  const values = evaluator.execute(program);
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

describe('Figure 4.16 regression', () => {
  test('dynamic diagram height grows to semantic minimum without clipping', async () => {
    const { decl, values, traces } = parseFigure();
    const authoredWidth = readNumber(resolveValue(decl.properties.width, values as any, traces as any), 1240);
    const authoredHeight = readNumber(resolveValue(decl.properties.height, values as any, traces as any), 1220);
    const semantic = await compileSemanticDiagram(decl.elements, values as any, traces as any, authoredWidth, authoredHeight, {});
    const prepared = await prepareDiagramLayout(decl, values as any, traces as any);

    expect(prepared.height).toBeGreaterThanOrEqual(semantic.minHeight);

    const measurement = prepared.elements.find((element: any) => element.type === 'panel' && element.name === 'measurement');
    expect(measurement).toBeTruthy();
    expect(elementBottom(measurement)).toBeLessThanOrEqual(prepared.height);
    expect(Math.max(...prepared.elements.map((element: any) => elementBottom(element)), 0)).toBeLessThanOrEqual(prepared.height);
  });

  test('validation and rendered SVG stay free of canvas clipping issues', async () => {
    const { decl, values, traces } = parseFigure();
    const validation = await validateDiagram(decl, values as any, traces as any);
    expect(validation.issues.some((issue) => issue.kind === 'canvas_overflow_clipping')).toBe(false);
    expect(validation.issues.some((issue) => issue.kind === 'hard_constraint_overflow')).toBe(false);

    const renderer = new Renderer({ baseDir: path.dirname(filePath) });
    const svg = await renderer.renderDeclaration(declarationName, decl, values as any, traces as any, path.dirname(filePath));
    expect(svg).not.toBeNull();

    const { decl: parsedDecl, values: parsedValues, traces: parsedTraces } = parseFigure();
    const prepared = await prepareDiagramLayout(parsedDecl, parsedValues as any, parsedTraces as any);
    const sizeMatch = svg!.match(/width="([0-9.]+)" height="([0-9.]+)"/);
    expect(sizeMatch).toBeTruthy();
    expect(Number(sizeMatch?.[2] ?? 0)).toBe(prepared.height);
  });
});
