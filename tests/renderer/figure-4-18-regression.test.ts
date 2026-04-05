import * as fs from 'fs';
import * as path from 'path';
import { DiagramDeclaration, PageDeclaration } from '../../src/ast/types';
import { Parser } from '../../src/parser';
import { Renderer } from '../../src/renderer';
import { Evaluator } from '../../src/runtime';
import { validateDiagram } from '../../src/renderer/validator';

const repoRoot = path.resolve(__dirname, '../..');

function parseFile(filePath: string, declarationName: string): { decl: DiagramDeclaration | PageDeclaration; values: Record<string, unknown>; traces: Map<string, unknown> } {
  const source = fs.readFileSync(filePath, 'utf8');
  return parseSource(source, declarationName);
}

function parseSource(source: string, declarationName: string): { decl: DiagramDeclaration | PageDeclaration; values: Record<string, unknown>; traces: Map<string, unknown> } {
  const parser = new Parser();
  const evaluator = new Evaluator();
  const program = parser.parse(source);
  const values = evaluator.execute(program);
  const decl = Object.values(values).find((value) =>
    value
    && typeof value === 'object'
    && (value as { name?: string }).name === declarationName,
  ) as DiagramDeclaration | PageDeclaration | undefined;
  if (!decl) throw new Error(`Declaration "${declarationName}" not found in ${filePath}`);
  return { decl, values, traces: evaluator.getTraces() as Map<string, unknown> };
}

describe('Figure 4.18 regression', () => {
  const directFile = path.join(repoRoot, 'temp', 'qaoa', 'Gambar_4_18_MaxCut_Problem_Statement.gs');

  test('fixture uses a formula node for the K3 expression and validates without plain-math warnings', async () => {
    const { decl, values, traces } = parseFile(directFile, 'Gambar_4_18_MaxCut_Problem_Statement');
    expect(decl.type).toBe('DiagramDeclaration');

    const panelRight = findChildRecursive((decl as DiagramDeclaration).elements as any[], 'panelRight');
    expect(findChildRecursive(panelRight?.children ?? [], 'k3Formula', 'formula')).toBeTruthy();
    expect(findChildRecursive(panelRight?.children ?? [], 'k3FormulaText')).toBeFalsy();

    const directValidation = await validateDiagram(decl, values as any, traces as any);
    expect(directValidation.issues.some((issue) => issue.kind === 'plain_math_text')).toBe(false);
    expect(directValidation.issues.some((issue) => issue.kind === 'math_fallback')).toBe(false);

    const page = parseSource(buildFigure418PageSource(fs.readFileSync(directFile, 'utf8')), 'Gambar_4_18_Page_Embed');
    const pageValidation = await validateDiagram(page.decl, page.values as any, page.traces as any);
    expect(pageValidation.issues.some((issue) => issue.kind === 'plain_math_text')).toBe(false);
    expect(pageValidation.issues.some((issue) => issue.kind === 'math_fallback')).toBe(false);
  });

  test('rendered SVG keeps K3 on the formula path without legacy raw math', async () => {
    const { decl, values, traces } = parseFile(directFile, 'Gambar_4_18_MaxCut_Problem_Statement');
    const renderer = new Renderer({ baseDir: path.dirname(directFile) });
    const svg = await renderer.renderDeclaration('Gambar_4_18_MaxCut_Problem_Statement', decl, values as any, traces as any, path.dirname(directFile));

    expect(svg).not.toBeNull();
    expect(svg).toContain('data-latex="\\frac{I - Z_0 Z_1}{2} + \\frac{I - Z_0 Z_2}{2} + \\frac{I - Z_1 Z_2}{2}"');
    expect(svg).not.toContain('(I - Z0Z1)/2');
  });
});

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

function findChildRecursive(children: Array<{ name: string; type: string; children?: any[] }>, name: string, type?: string): any | undefined {
  for (const child of children) {
    if (child.name === name && (!type || child.type === type)) return child;
    const nested = findChildRecursive(child.children ?? [], name, type);
    if (nested) return nested;
  }
  return undefined;
}
