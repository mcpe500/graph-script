import { readFileSync } from 'fs';
import * as path from 'path';
import { DiagramDeclaration, DiagramElement, Expression } from '../../src/ast/types';
import { Parser } from '../../src/parser';
import { Evaluator } from '../../src/runtime';
import { prepareDiagramLayout } from '../../src/renderer/diagram';

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

function literalNumber(expression: Expression | undefined): number {
  if (!expression || expression.type !== 'Literal') return Number.NaN;
  const value = typeof expression.value === 'number'
    ? expression.value
    : Number(expression.value);
  return Number.isFinite(value) ? value : Number.NaN;
}

function getRequiredLiteralNumber(element: DiagramElement, key: string): number {
  const value = literalNumber(element.properties[key]);
  if (!Number.isFinite(value)) {
    throw new Error(`Expected numeric literal for ${element.name}.${key}`);
  }
  return value;
}

function labelBox(element: DiagramElement): Box {
  const centerX = getRequiredLiteralNumber(element, 'label_x');
  const centerY = getRequiredLiteralNumber(element, 'label_y');
  const width = getRequiredLiteralNumber(element, 'label_w');
  const height = getRequiredLiteralNumber(element, 'label_h');

  return {
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
  };
}

function overlapArea(a: Box, b: Box): number {
  const xOverlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const yOverlap = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return xOverlap * yOverlap;
}

async function prepareFixtureLayout(): Promise<Awaited<ReturnType<typeof prepareDiagramLayout>>> {
  const sourcePath = path.resolve(__dirname, '../fixtures/usecase-website-relations.gs');
  const source = readFileSync(sourcePath, 'utf8');

  const parser = new Parser();
  const evaluator = new Evaluator();
  const program = parser.parse(source);
  const values = evaluator.execute(program);
  const decl = values.UseCaseLabels as DiagramDeclaration;

  return prepareDiagramLayout(decl, values as any, evaluator.getTraces());
}

describe('Use-case relation label placement', () => {
  test('applies smart label metadata with refinement bounded to 5 loops', async () => {
    const prepared = await prepareFixtureLayout();
    const relations = prepared.elements.filter((element) => element.type === 'include' || element.type === 'extend');
    expect(relations.length).toBeGreaterThan(0);

    for (const relation of relations) {
      const labelX = getRequiredLiteralNumber(relation, 'label_x');
      const labelY = getRequiredLiteralNumber(relation, 'label_y');
      const loopCount = getRequiredLiteralNumber(relation, 'label_refine_loops');

      expect(Number.isFinite(labelX)).toBe(true);
      expect(Number.isFinite(labelY)).toBe(true);
      expect(loopCount).toBeGreaterThanOrEqual(0);
      expect(loopCount).toBeLessThanOrEqual(5);
    }
  });

  test('distributes include labels without overlap and not all on a single side', async () => {
    const prepared = await prepareFixtureLayout();
    const includes = prepared.elements.filter((element) => element.type === 'include');
    expect(includes.length).toBe(3);

    for (let i = 0; i < includes.length; i += 1) {
      const boxA = labelBox(includes[i]);
      for (let j = i + 1; j < includes.length; j += 1) {
        const boxB = labelBox(includes[j]);
        expect(overlapArea(boxA, boxB)).toBe(0);
      }
    }

    const sides = new Set<number>();
    for (const include of includes) {
      const y1 = getRequiredLiteralNumber(include, 'y');
      const y2 = getRequiredLiteralNumber(include, 'y2');
      const labelY = getRequiredLiteralNumber(include, 'label_y');
      const delta = labelY - ((y1 + y2) / 2);
      const side = Math.sign(delta);
      if (side !== 0) sides.add(side);
    }

    expect(sides.size).toBeGreaterThanOrEqual(2);
  });
});
