import { Parser } from '@graphscript/parser';

describe('Parser', () => {
  test('parses simple data declaration', () => {
    const parser = new Parser();
    const program = parser.parse(`data:
  x = 1
  y = 2
`);
    expect(program.body.length).toBe(1);
    expect(program.body[0].type).toBe('DataDeclaration');
  });

  test('parses constant declaration', () => {
    const parser = new Parser();
    const program = parser.parse(`const x = 10`);
    expect(program.body.length).toBe(1);
    expect(program.body[0].type).toBe('ConstDeclaration');
  });

  test('parses use statement', () => {
    const parser = new Parser();
    const program = parser.parse(`use chart`);
    expect(program.body.length).toBe(1);
    expect(program.body[0].type).toBe('UseStatement');
  });

  test('parses chart declaration', () => {
    const parser = new Parser();
    const program = parser.parse(`chart "Test":
  type = line
  x = [1, 2, 3]
  y = [4, 5, 6]
`);
    expect(program.body.length).toBe(1);
    expect(program.body[0].type).toBe('ChartDeclaration');
  });

  test('parses algorithm with emit', () => {
    const parser = new Parser();
    const program = parser.parse(`algo Test(arr):
  x = 1
  emit:
    x = x
`);
    expect(program.body.length).toBe(1);
    expect(program.body[0].type).toBe('AlgoDeclaration');
  });

  test('parses flow declaration with nodes', () => {
    const parser = new Parser();
    const program = parser.parse(`flow "Test":
  node a type=start
  node b type=end
  a -> b
`);
    expect(program.body.length).toBe(1);
    expect(program.body[0].type).toBe('FlowDeclaration');
  });

  test('parses semantic diagram elements', () => {
    const parser = new Parser();
    const program = parser.parse(`diagram "Semantic":
  header top title="Header"
  separator split labels=["Bagian Klasik", "Bagian Kuantum"]
  lane classical section="classical" order=1 columns=1
  lane quantum section="quantum" order=2 columns=2
  card energy section="classical" row=1 label="Energi":
    group group1 layout="stack":
      formula eq value="<H> = Sum_i c_i <P_i>"
      divider cut
      spacer gap h=18
  connector link from="energy.right" to="energy.left"
`);
    const diagram = program.body[0] as any;
    expect(diagram.type).toBe('DiagramDeclaration');
    expect(diagram.elements.map((element: any) => element.type)).toEqual([
      'header',
      'separator',
      'lane',
      'lane',
      'card',
      'connector',
    ]);
    expect(diagram.elements[4].children.map((element: any) => element.type)).toEqual([
      'group',
    ]);
  });

  test('parses non-semantic diagram container children', () => {
    const parser = new Parser();
    const program = parser.parse(`diagram "Container":
  box outer x=40 y=60 w=320 h=180 label="":
    text title x=24 y=24 w=220 h=30 value="Nested title" size=18
    circle node x=36 y=80 w=40 h=40 label="A"
`);
    const diagram = program.body[0] as any;
    expect(diagram.type).toBe('DiagramDeclaration');
    expect(diagram.elements).toHaveLength(1);
    expect(diagram.elements[0].type).toBe('box');
    expect(diagram.elements[0].children.map((element: any) => element.type)).toEqual([
      'text',
      'circle',
    ]);
  });

  test('parses graph with node and edge children inside diagram containers', () => {
    const parser = new Parser();
    const program = parser.parse(`diagram "Graph":
  panel host x=40 y=50 w=360 h=240 label="":
    graph k3 x=42 y=54 w=220 h=160 layout="circle":
      node a label="A"
      node b label="B"
      node c label="C"
      edge ab from="a" to="b"
      edge bc from="b" to="c"
`);
    const diagram = program.body[0] as any;
    expect(diagram.type).toBe('DiagramDeclaration');
    expect(diagram.elements[0].type).toBe('panel');
    expect(diagram.elements[0].children[0].type).toBe('graph');
    expect(diagram.elements[0].children[0].children.map((element: any) => element.type)).toEqual([
      'node',
      'node',
      'node',
      'edge',
      'edge',
    ]);
  });
});
