import * as path from 'path';
import { Parser } from '../../src/parser';
import { Evaluator } from '../../src/runtime';
import { Renderer } from '../../src/renderer';
import { PageDeclaration } from '../../src/ast/types';
import { validateDiagram } from '../../src/renderer/validator';

function parseAndEval(source: string): { decl: PageDeclaration; values: Record<string, unknown>; traces: Map<string, any> } {
  const parser = new Parser();
  const evaluator = new Evaluator();
  const program = parser.parse(source);
  const values = evaluator.execute(program);
  const decl = Object.values(values).find((value) => value && typeof value === 'object' && (value as { type?: string }).type === 'PageDeclaration') as PageDeclaration;
  return { decl, values, traces: evaluator.getTraces() };
}

describe('Page renderer readability', () => {
  test('auto readability mode grows page dimensions to keep embedded figures readable', async () => {
    const { decl, values, traces } = parseAndEval(`diagram "Wide Manual":
  width = 1800
  height = 1020
  fixed_canvas = true
  box a x=100 y=100 w=500 h=120:
    text t1 x=48 y=42 w=420 h=24 value="Input" size=18 weight="800"
  box b x=650 y=100 w=500 h=120:
    text t2 x=48 y=42 w=420 h=24 value="Output" size=18 weight="800"
  box c x=1200 y=100 w=500 h=120:
    text t3 x=48 y=42 w=420 h=24 value="Contoh" size=18 weight="800"

page "Readable Page":
  width = 1000
  height = 620
  columns = 1
  rows = 1
  min_embed_scale = 0.72
  place "Wide Manual" at cell(1,1)
`);

    const renderer = new Renderer();
    const svg = await renderer.renderDeclaration('Readable Page', decl, values as any, traces as any, path.resolve(__dirname, '../../temp'));
    expect(svg).not.toBeNull();

    const widthMatch = svg!.match(/width="([0-9.]+)"/);
    const heightMatch = svg!.match(/height="([0-9.]+)"/);
    expect(Number(widthMatch?.[1] ?? 0)).toBeGreaterThan(1000);
    expect(Number(heightMatch?.[1] ?? 0)).toBeGreaterThanOrEqual(620);

    const validation = await validateDiagram(decl, values as any, traces as any);
    expect(validation.issues.some((issue) => issue.kind === 'embed_too_small')).toBe(false);
  });

  test('legacy readability mode keeps old shrink-to-fit behavior and exposes embed-too-small issue', async () => {
    const { decl, values, traces } = parseAndEval(`diagram "Wide Manual":
  width = 1800
  height = 1020
  fixed_canvas = true
  box a x=100 y=100 w=500 h=120:
    text t1 x=48 y=42 w=420 h=24 value="Input" size=18 weight="800"

page "Legacy Page":
  width = 900
  height = 520
  columns = 1
  rows = 1
  readability_mode = "legacy"
  min_embed_scale = 0.9
  place "Wide Manual" at cell(1,1)
`);

    const validation = await validateDiagram(decl, values as any, traces as any);
    expect(validation.issues.some((issue) => issue.kind === 'embed_too_small')).toBe(true);
  });

  test('page validation estimates nested pages from their final readable layout', async () => {
    const { decl, values, traces } = parseAndEval(`diagram "Wide Manual":
  width = 1800
  height = 1020
  fixed_canvas = true
  box a x=100 y=100 w=500 h=120:
    text t1 x=48 y=42 w=420 h=24 value="Input" size=18 weight="800"

page "Inner Page":
  width = 1000
  height = 620
  columns = 1
  rows = 1
  min_embed_scale = 0.72
  place "Wide Manual" at cell(1,1)

page "Outer Page":
  width = 1000
  height = 700
  columns = 1
  rows = 1
  readability_mode = "legacy"
  min_embed_scale = 0.9
  place "Inner Page" at cell(1,1)
`);

    const outer = Object.values(values).find((value) => value && typeof value === 'object' && (value as { name?: string }).name === 'Outer Page') as PageDeclaration;
    const validation = await validateDiagram(outer, values as any, traces as any);
    expect(validation.issues.some((issue) => issue.kind === 'embed_too_small')).toBe(true);
  });
});
