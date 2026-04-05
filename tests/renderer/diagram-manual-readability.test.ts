import { Parser } from '../../src/parser';
import { Evaluator } from '../../src/runtime';
import { DiagramDeclaration } from '../../src/ast/types';
import { buildValidationSnapshot, validateDiagram } from '../../src/renderer/validator';

function parseAndEval(source: string): { decl: DiagramDeclaration; values: Record<string, unknown>; traces: Map<string, any> } {
  const parser = new Parser();
  const evaluator = new Evaluator();
  const program = parser.parse(source);
  const values = evaluator.execute(program);
  const decl = Object.values(values).find((value) => value && typeof value === 'object' && (value as { type?: string }).type === 'DiagramDeclaration') as DiagramDeclaration;
  return { decl, values, traces: evaluator.getTraces() };
}

describe('Manual diagram readability normalization', () => {
  test('auto mode floors small text and snaps nearly aligned panels into the same row', async () => {
    const { decl, values, traces } = parseAndEval(`diagram "Manual":
  width = 920
  height = 420
  fixed_canvas = true
  readability_mode = "auto"
  box left x=40 y=60 w=180 h=240:
    text body x=20 y=24 w=120 h=20 value="Tiny" size=12
  box right x=420 y=72 w=180 h=240:
    text body x=20 y=24 w=120 h=20 value="Tiny 2" size=12
`);

    const snapshot = await buildValidationSnapshot(decl, values as any, traces as any);
    const panels = snapshot.elements.filter((element) => element.type === 'box');
    expect((panels[0].properties.y as any).value).toBe((panels[1].properties.y as any).value);
    expect((panels[0].children?.[0].properties.size as any).value).toBeGreaterThanOrEqual(16);
    expect((panels[1].children?.[0].properties.size as any).value).toBeGreaterThanOrEqual(16);
  });

  test('legacy mode still reports misalignment and excessive empty space', async () => {
    const { decl, values, traces } = parseAndEval(`diagram "Manual":
  width = 920
  height = 520
  fixed_canvas = true
  readability_mode = "legacy"
  box left x=40 y=60 w=240 h=320:
    text body x=20 y=24 w=120 h=20 value="Tiny" size=12
  box right x=360 y=72 w=240 h=320:
    text body x=20 y=24 w=120 h=20 value="Tiny 2" size=12
`);

    const validation = await validateDiagram(decl, values as any, traces as any);
    expect(validation.issues.some((issue) => issue.kind === 'misaligned_siblings')).toBe(true);
    expect(validation.issues.some((issue) => issue.kind === 'excessive_empty_space')).toBe(true);
  });

  test('auto mode remeasures inline math and formula children, then pushes stacked content down', async () => {
    const { decl, values, traces } = parseAndEval(`diagram "Manual":
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
    const panel = snapshot.elements.find((element) => element.name === 'panel')!;
    const intro = panel.children?.find((child) => child.name === 'intro')!;
    const eq = panel.children?.find((child) => child.name === 'eq')!;
    const tail = panel.children?.find((child) => child.name === 'tail')!;

    expect((intro.properties.h as any).value).toBeGreaterThan(18);
    expect((eq.properties.h as any).value).toBeGreaterThan(0);
    expect((tail.properties.y as any).value).toBeGreaterThan(86);
    expect((panel.properties.h as any).value).toBeGreaterThanOrEqual(180);
  });
});
