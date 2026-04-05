import { readFileSync } from 'fs';
import * as path from 'path';
import { Parser } from '../../src/parser';
import { FlowDeclaration } from '../../src/ast/types';
import { layoutFlow, renderFlow } from '../../src/renderer/flow';

function parseFlow(source: string): FlowDeclaration {
  const parser = new Parser();
  const program = parser.parse(source);
  return program.body.find((item) => item.type === 'FlowDeclaration') as FlowDeclaration;
}

describe('Flow renderer', () => {
  test('parses flow sizing properties', () => {
    const flow = parseFlow(`flow "Sizing":
  target_width = 1500
  preferred_font_size = 20
  layout_mode = snake
  fit = compact
  node a type=process label="Alpha"
  node b type=end label="Beta"
  a -> b
`);

    expect(flow.properties.target_width.type).toBe('Literal');
    expect(flow.properties.preferred_font_size.type).toBe('Literal');
    expect(flow.properties.layout_mode.type).toBe('Identifier');
    expect(flow.properties.fit.type).toBe('Identifier');
  });

  test('uses snake layout for dense left-right flows', () => {
    const flow = parseFlow(`flow "Dense":
  direction = left_right
  node a type=process label="Studi pendahuluan kuantum dan kajian algoritma"
  node b type=process label="Instalasi dan konfigurasi simulator"
  node c type=process label="Implementasi algoritma kuantum dan klasik"
  node d type=process label="Pengujian terkontrol dengan parameter seragam"
  node e type=process label="Ekstraksi gate count, depth, waktu, akurasi"
  node f type=end label="Analisis komparatif"
  a -> b
  b -> c
  c -> d
  d -> e
  e -> f
`);

    const layout = layoutFlow(flow);
    const uniqueRows = new Set(layout.nodes.map((node) => Math.round(node.y)));
    expect(uniqueRows.size).toBeGreaterThan(1);
    expect(layout.nodes[0].fontSize).toBeGreaterThanOrEqual(14);
  });

  test('keeps short flows in a single row', () => {
    const flow = parseFlow(`flow "Short":
  direction = left_right
  node a type=start label="Mulai"
  node b type=process label="Proses"
  node c type=end label="Selesai"
  a -> b
  b -> c
`);

    const layout = layoutFlow(flow);
    const uniqueRows = new Set(layout.nodes.map((node) => Math.round(node.y)));
    expect(uniqueRows.size).toBeLessThanOrEqual(2);
  });

  test('renders formula labels with shared formula helper', () => {
    const flow = parseFlow(`flow "Math":
  layout_mode = dynamic
  flow_layout = algorithmic
  node init type=process label="SOLUSI_SEKARANG <- RANDOM_BITSTRING(|V|)"
  node eq type=decision label="$\\\\Delta E < 0$?"
  init -> eq
`);

    const layout = layoutFlow(flow);
    const initNode = layout.nodes.find((node) => node.id === 'init');
    const eqNode = layout.nodes.find((node) => node.id === 'eq');
    expect(initNode?.lineModes.every((mode) => mode === 'plain')).toBe(true);
    expect(eqNode?.lineModes[0]).toBe('formula');

    const svg = renderFlow(layout, flow.name);
    expect(svg).toContain('font-style="italic"');
    expect(svg).toContain('&#916; E &lt; 0?');
    expect(svg).toContain('SOLUSI_SEKARANG &lt;-');
    expect(svg).toContain('RANDOM_BITSTRING(|V|)');
  });

  test('auto readability mode preserves readable fonts by allowing the layout to grow', () => {
    const flow = parseFlow(`flow "Readable":
  readability_mode = auto
  target_width = 780
  target_height = 360
  preferred_font_size = 18
  node a type=process label="Tahap identifikasi parameter dan pemilihan konfigurasi simulasi"
  node b type=process label="Eksekusi optimasi dan evaluasi hasil terhadap baseline klasik"
  node c type=end label="Analisis akhir"
  a -> b
  b -> c
`);

    const layout = layoutFlow(flow);
    expect(Math.min(...layout.nodes.map((node) => node.fontSize))).toBeGreaterThanOrEqual(18);
    expect(layout.width).toBeGreaterThan(780);
  });

  test('preserves explicit newlines in flow labels instead of collapsing them into one line', () => {
    const flow = parseFlow(`flow "Multiline":
  layout_mode = dynamic
  flow_layout = algorithmic
  node a type=process label="Baris pertama\\nBaris kedua\\nBaris ketiga"
`);

    const layout = layoutFlow(flow);
    const node = layout.nodes.find((item) => item.id === 'a');
    expect(node?.lines).toEqual(['Baris pertama', 'Baris kedua', 'Baris ketiga']);
    expect(node?.lineModes).toEqual(['plain', 'plain', 'plain']);
  });

  test('auto mode prefers algorithmic planner for top-down control-flow graphs with loops', () => {
    const flow = parseFlow(`flow "Algorithmic Auto":
  direction = top_down
  layout_mode = auto
  node start type=start label="Mulai"
  node check type=decision label="$x > 0$?"
  node body type=process label="Proses"
  node done type=end label="Selesai"
  start -> check
  check -> body label="Ya"
  check -> done label="Tidak"
  body -> check
`);

    const layout = layoutFlow(flow);
    expect(layout.edges.some((edge) => edge.kind === 'back')).toBe(true);
    const done = layout.nodes.find((node) => node.id === 'done');
    const body = layout.nodes.find((node) => node.id === 'body');
    expect((done?.y ?? 0)).toBeGreaterThan(body?.y ?? 0);
  });

  test('keeps Figure 4.19 in a compact algorithmic flowchart structure', () => {
    const source = readFileSync(path.resolve(__dirname, '../../temp/fig-4-19-simulated-annealing-flow.gs'), 'utf8');
    const flow = parseFlow(source);
    const layout = layoutFlow(flow);
    const node = (id: string) => layout.nodes.find((item) => item.id === id);
    const edge = (from: string, to: string) => layout.edges.find((item) => item.from === from && item.to === to);

    expect(layout.options.layoutMode).toBe('algorithmic');
    expect(layout.height).toBeLessThanOrEqual(2200);
    expect(node('output')?.y).toBeGreaterThan(node('cool')?.y ?? 0);
    expect(node('cool')?.y).toBeGreaterThan(node('inc_iter')?.y ?? 0);
    expect(node('prob_calc')?.x).toBeGreaterThan(node('better_check')?.x ?? 0);
    expect(node('accept_update')?.x).toBeGreaterThan(node('prob_calc')?.x ?? 0);
    expect(Math.max(...layout.nodes.map((item) => item.width))).toBeLessThanOrEqual(530);
    expect(Math.max(...layout.nodes.map((item) => item.lines.length))).toBeLessThanOrEqual(3);
    expect(edge('inc_iter', 'iter_check')?.kind).toBe('back');
    expect(edge('cool', 'temp_check')?.kind).toBe('back');
    expect(edge('accept_update', 'best_check')?.kind).toBe('join');
    expect(node('iter_check')?.lineModes.every((mode) => mode === 'plain')).toBe(true);
    expect(node('better_check')?.lineModes[0]).toBe('formula');
  });
});
