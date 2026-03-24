import { Parser } from '../../src/parser';
import { FlowDeclaration } from '../../src/ast/types';
import { layoutFlow, renderFlow } from '../../src/renderer/flow';

function parseFlow(source: string): FlowDeclaration {
  const parser = new Parser();
  const program = parser.parse(source);
  return program.body[0] as FlowDeclaration;
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
  layout_mode = single_row
  node eq type=process label="$E = mc^2$"
`);

    const svg = renderFlow(layoutFlow(flow), flow.name);
    expect(svg).toContain('font-style="italic"');
    expect(svg).toContain('E = mc^2');
  });
});
