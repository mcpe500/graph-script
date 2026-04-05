import { DiagramElement } from '../../src/ast/types';
import { compileGraphElement, expandGraphElements } from '../../src/renderer/graph';
import { GSValue, Trace } from '../../src/runtime/values';

const ZERO_LOC = {
  start: { line: 0, column: 0, offset: 0 },
  end: { line: 0, column: 0, offset: 0 },
};

function makeElement(
  name: string,
  type: string,
  props: Record<string, any>,
  children?: DiagramElement[],
): DiagramElement {
  const properties: Record<string, any> = {};
  for (const [key, value] of Object.entries(props)) {
    properties[key] = { type: 'Literal', value, location: ZERO_LOC };
  }
  return { name, type, properties, ...(children ? { children } : {}) };
}

function makeValues(): Record<string, GSValue> {
  return {};
}

function makeTraces(): Map<string, Trace> {
  return new Map();
}

describe('Graph renderer support', () => {
  test('compiles manual graph edges to node perimeters', () => {
    const graph = makeElement('g', 'graph', { x: 20, y: 30, w: 220, h: 160, layout: 'manual', padding: 20 }, [
      makeElement('a', 'node', { label: 'A', x: 60, y: 80, radius: 20 }),
      makeElement('b', 'node', { label: 'B', x: 160, y: 80, radius: 20 }),
      makeElement('ab', 'edge', { from: 'a', to: 'b', stroke: '#334155', strokeWidth: 4 }),
    ]);

    const compiled = compileGraphElement(graph, makeValues(), makeTraces(), { includeOwnPosition: true });
    const edge = compiled.elements.find((element) => element.type === 'line');

    expect(edge).toBeDefined();
    expect(edge?.properties.x?.type).toBe('Literal');
    expect(edge?.properties.x?.value).toBe(100);
    expect(edge?.properties.x2?.value).toBe(160);
  });

  test('compiles circle layout deterministically and applies graph defaults', () => {
    const graph = makeElement('k3', 'graph', {
      w: 240,
      h: 200,
      layout: 'circle',
      node_radius: 18,
      node_fill: '#2563eb',
      node_stroke: '#1d4ed8',
      edge_stroke: '#94a3b8',
      edge_strokeWidth: 3,
    }, [
      makeElement('n1', 'node', { label: '1' }),
      makeElement('n0', 'node', { label: '0' }),
      makeElement('n2', 'node', { label: '2', fill: '#f97316', stroke: '#ea580c' }),
      makeElement('e1', 'edge', { from: 'n1', to: 'n0' }),
      makeElement('e2', 'edge', { from: 'n0', to: 'n2', dash: '8 6' }),
    ]);

    const first = compileGraphElement(graph, makeValues(), makeTraces());
    const second = compileGraphElement(graph, makeValues(), makeTraces());

    expect(first.nodes.map((node) => ({ id: node.id, x: node.x, y: node.y }))).toEqual(
      second.nodes.map((node) => ({ id: node.id, x: node.x, y: node.y })),
    );
    expect(first.nodes[0].fill).toBe('#2563eb');
    expect(first.nodes[2].fill).toBe('#f97316');
  });

  test('compiles force layout deterministically and expands nested graphs', () => {
    const graph = makeElement('forceGraph', 'graph', { x: 24, y: 32, w: 280, h: 220, layout: 'force', seed: 7, iterations: 60 }, [
      makeElement('a', 'node', { label: 'A' }),
      makeElement('b', 'node', { label: 'B' }),
      makeElement('c', 'node', { label: 'C' }),
      makeElement('ab', 'edge', { from: 'a', to: 'b' }),
      makeElement('bc', 'edge', { from: 'b', to: 'c' }),
    ]);

    const first = compileGraphElement(graph, makeValues(), makeTraces(), { includeOwnPosition: true });
    const second = compileGraphElement(graph, makeValues(), makeTraces(), { includeOwnPosition: true });
    expect(first.nodes.map((node) => ({ id: node.id, x: node.x, y: node.y }))).toEqual(
      second.nodes.map((node) => ({ id: node.id, x: node.x, y: node.y })),
    );

    const expanded = expandGraphElements([
      makeElement('outer', 'box', { x: 10, y: 10, w: 360, h: 260 }, [graph]),
    ], makeValues(), makeTraces());

    expect(expanded[0].children?.some((element) => element.type === 'circle')).toBe(true);
    expect(expanded[0].children?.some((element) => element.type === 'graph')).toBe(false);
  });

  test('derives readable graph defaults from compact boxes', () => {
    const graph = makeElement('denseGraph', 'graph', { w: 220, h: 180, layout: 'circle', readability_mode: 'auto' }, [
      makeElement('a', 'node', { label: 'A' }),
      makeElement('b', 'node', { label: 'B' }),
      makeElement('c', 'node', { label: 'C' }),
      makeElement('d', 'node', { label: 'D' }),
      makeElement('ab', 'edge', { from: 'a', to: 'b' }),
      makeElement('bc', 'edge', { from: 'b', to: 'c' }),
      makeElement('cd', 'edge', { from: 'c', to: 'd' }),
    ]);

    const compiled = compileGraphElement(graph, makeValues(), makeTraces());
    expect(Math.min(...compiled.nodes.map((node) => node.size))).toBeGreaterThanOrEqual(16);
    expect(Math.min(...compiled.nodes.map((node) => node.radius))).toBeGreaterThanOrEqual(18);
  });
});
