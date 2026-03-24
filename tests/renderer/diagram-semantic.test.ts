import * as path from 'path';
import { Parser } from '../../src/parser';
import { Evaluator } from '../../src/runtime';
import { DiagramDeclaration } from '../../src/ast/types';
import { compileSemanticDiagram } from '../../src/renderer/diagram-semantic';
import { renderDiagram } from '../../src/renderer/diagram';

function parseAndEval(source: string): { decl: DiagramDeclaration; values: Record<string, unknown> } {
  const parser = new Parser();
  const evaluator = new Evaluator();
  const program = parser.parse(source);
  const values = evaluator.execute(program);
  return { decl: values.Semantic as DiagramDeclaration, values };
}

describe('Semantic diagram layout', () => {
  test('lays out lanes and cards without overlap', () => {
    const { decl, values } = parseAndEval(`diagram "Semantic":
  width = 1400
  height = 900
  header top title="Header"
  separator split labels=["Bagian Klasik", "Bagian Kuantum"]
  lane classical section="classical" order=1 columns=1
  lane quantum section="quantum" order=2 columns=2
  card hamiltonian section="classical" row=1 label="Hamiltonian":
    formula eq value="H = c0 II + c1 ZI"
  card energy section="classical" row=2 label="Energi":
    formula e value="<H> = Sum_i c_i <P_i>"
  card ansatz section="quantum" row=1 col=1 label="Ansatz":
    text prep value="State\\nPreparation"
  card measurement section="quantum" row=1 col=2 label="Measurement":
    text pauli value="Pauli strings"
`);
    const compiled = compileSemanticDiagram(decl.elements, values as any, new Map(), 1400, 900);
    const panels = compiled.elements.filter((element) => element.type === 'panel');
    expect(panels.length).toBe(4);

    const first = panels[0].properties;
    const second = panels[1].properties;
    const firstBottom = (first.y as any).value + (first.h as any).value;
    const secondTop = (second.y as any).value;
    expect(firstBottom).toBeLessThan(secondTop);
  });

  test('auto sizes card body with text, formula, and image children', () => {
    const source = `const ans = image("assets/vqe/ansatz.png")

diagram "Semantic":
  width = 1200
  height = 700
  header top title="Header"
  separator split labels=["Bagian Klasik", "Bagian Kuantum"]
  lane quantum section="quantum" order=1 columns=1
  card mixed section="quantum" row=1 label="Mixed Card":
    text intro value="Nilai ekspektasi"
    image ansatz src=ans w=160 h=72 fit="contain" fill="none" stroke="none"
    formula eq value="<ZI>, <IZ>, <ZZ>"
`;
    const parser = new Parser();
    const evaluator = new Evaluator();
    const program = parser.parse(source);
    const values = evaluator.execute(program);
    const decl = values.Semantic as DiagramDeclaration;
    const compiled = compileSemanticDiagram(decl.elements, values, new Map(), 1200, 700);
    const panel = compiled.elements.find((element) => element.type === 'panel' && element.name === 'mixed')!;
    expect((panel.properties.h as any).value).toBeGreaterThan(220);
  });

  test('renders semantic connector as orthogonal segments', () => {
    const { decl, values } = parseAndEval(`diagram "Semantic":
  width = 1200
  height = 700
  header top title="Header"
  separator split labels=["A", "B"]
  lane left section="left" order=1 columns=1
  lane right section="right" order=2 columns=1
  card a section="left" row=1 label="A":
    text t value="Alpha"
  card b section="right" row=1 label="B":
    text t value="Beta"
  connector link from="a.right" to="b.left" stroke="#2563eb" strokeWidth=4
`);
    const compiled = compileSemanticDiagram(decl.elements, values as any, new Map(), 1200, 700);
    const segments = compiled.elements.filter((element) => element.name.startsWith('link-seg-'));
    expect(segments.length).toBeGreaterThanOrEqual(1);
    expect(segments[segments.length - 1].type).toBe('arrow');
  });

  test('semantic rendering grows canvas height when needed', async () => {
    const parser = new Parser();
    const evaluator = new Evaluator();
    const program = parser.parse(`diagram "Semantic":
  width = 1200
  height = 500
  background = "#ffffff"
  header top title="Header"
  separator split labels=["A"]
  lane one section="one" order=1 columns=1
  card c1 section="one" row=1 label="One":
    text v value="Alpha"
  card c2 section="one" row=2 label="Two":
    text v value="Beta"
  card c3 section="one" row=3 label="Three":
    text v value="Gamma"
  card c4 section="one" row=4 label="Four":
    text v value="Delta"
`);
    const values = evaluator.execute(program);
    const decl = values.Semantic as DiagramDeclaration;
    const svg = await renderDiagram(decl, values, new Map(), async () => null, path.resolve(__dirname, '../../temp'));
    const heightMatch = svg.match(/height="([0-9.]+)"/);
    expect(Number(heightMatch?.[1] ?? 0)).toBeGreaterThan(500);
  });
});
