import {
  extractBoundingBoxes,
  detectOverlaps,
  calculateOverlap,
  calculateReadability,
  calculateReadabilityScore,
  isIntendedOverlap,
  validateAndAdjust,
  validateDiagram,
  isValidatableDeclaration,
  needsRelayout,
  isContainerContentContainment,
  buildValidationSnapshot,
  MIN_FONT_SIZE,
  MIN_ELEMENT_SIZE,
  BoundingBox,
  ReadabilityMetrics,
} from '../../src/renderer/validator';
import { DiagramElement } from '../../src/ast/types';
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

describe('Validator', () => {
  test('recognizes validatable and relayout declaration types', () => {
    expect(isValidatableDeclaration('DiagramDeclaration')).toBe(true);
    expect(isValidatableDeclaration('FlowDeclaration')).toBe(true);
    expect(isValidatableDeclaration('UnknownDeclaration')).toBe(false);
    expect(needsRelayout('DiagramDeclaration')).toBe(true);
    expect(needsRelayout('ChartDeclaration')).toBe(false);
  });

  test('extracts bounding boxes from nested children', () => {
    const elements: DiagramElement[] = [
      makeElement('container', 'panel', { x: 100, y: 100, w: 400, h: 300 }, [
        makeElement('child1', 'box', { x: 20, y: 40, w: 150, h: 80 }),
        makeElement('child2', 'box', { x: 200, y: 40, w: 150, h: 80 }),
      ]),
    ];

    const boxes = extractBoundingBoxes(elements, makeValues(), makeTraces());
    expect(boxes).toHaveLength(3);
    expect(boxes[1].x).toBe(120);
    expect(boxes[1].y).toBe(140);
  });

  test('detects overlapping boxes', () => {
    const boxes: BoundingBox[] = [
      { id: 'box1', type: 'box', x: 0, y: 0, width: 100, height: 100, allowOverlap: false },
      { id: 'box2', type: 'box', x: 50, y: 50, width: 100, height: 100, allowOverlap: false },
    ];
    const issues = detectOverlaps(boxes);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].kind).toBe('overlap');
  });

  test('ignores full containment when panel or box acts as a container', () => {
    const container: BoundingBox = { id: 'panel', type: 'panel', x: 0, y: 0, width: 300, height: 200, allowOverlap: false };
    const childText: BoundingBox = { id: 'title', type: 'text', x: 24, y: 24, width: 180, height: 32, allowOverlap: false };
    const childBox: BoundingBox = { id: 'card', type: 'box', x: 32, y: 72, width: 120, height: 70, allowOverlap: false };

    expect(isContainerContentContainment(container, childText)).toBe(true);
    expect(isContainerContentContainment(container, childBox)).toBe(true);
    expect(detectOverlaps([container, childText, childBox])).toHaveLength(0);
  });

  test('still detects partial overlap when boxes are not fully contained', () => {
    const boxes: BoundingBox[] = [
      { id: 'container', type: 'box', x: 0, y: 0, width: 100, height: 100, allowOverlap: false },
      { id: 'partial', type: 'text', x: 70, y: 70, width: 60, height: 40, allowOverlap: false },
    ];

    const issues = detectOverlaps(boxes);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].kind).toBe('overlap');
  });

  test('calculates overlap and readability metrics', () => {
    const a: BoundingBox = { id: 'a', type: 'box', x: 0, y: 0, width: 100, height: 100, allowOverlap: false };
    const b: BoundingBox = { id: 'b', type: 'box', x: 50, y: 50, width: 100, height: 100, allowOverlap: false };
    const overlap = calculateOverlap(a, b);
    expect(overlap.area).toBe(2500);
    expect(overlap.percentage).toBe(25);

    const elements: DiagramElement[] = [
      makeElement('text1', 'text', { x: 0, y: 0, size: 16, value: 'Hello' }),
      makeElement('box1', 'box', { x: 0, y: 0, w: 100, h: 60 }),
    ];
    const metrics = calculateReadability(elements, makeValues(), makeTraces());
    expect(metrics.minFontSize).toBe(16);
    expect(metrics.minElementSize).toBe(60);
  });

  test('penalizes poor readability and keeps minimum defaults', () => {
    const emptyMetrics = calculateReadability([], makeValues(), makeTraces());
    expect(emptyMetrics.minFontSize).toBe(MIN_FONT_SIZE);
    expect(emptyMetrics.minElementSize).toBe(MIN_ELEMENT_SIZE);

    const weak: ReadabilityMetrics = {
      minFontSize: 10,
      avgFontSize: 12,
      minElementSize: 18,
      density: 10000,
      elementCount: 64,
    };
    expect(calculateReadabilityScore(weak)).toBeLessThan(100);
    expect(calculateReadabilityScore(weak, [{
      kind: 'tight_gap',
      element1: { id: 'a', type: 'box' },
      element2: { id: 'b', type: 'box' },
      overlapArea: 0,
      overlapPercentage: 0,
      severity: 'warning',
      location: { x: 0, y: 0, width: 10, height: 10 },
      message: 'Gap too small',
    }])).toBeLessThan(calculateReadabilityScore(weak));
  });

  test('treats transparent and explicit overlaps as intended', () => {
    const transparent = makeElement('transparent', 'box', { x: 0, y: 0, w: 100, h: 80, fillOpacity: 0.3 });
    const explicit = makeElement('allowed', 'box', { x: 0, y: 0, w: 100, h: 80, allow_overlap: true });
    const normal = makeElement('normal', 'box', { x: 0, y: 0, w: 100, h: 80 });
    expect(isIntendedOverlap(transparent, makeValues(), makeTraces(), null)).toBe(true);
    expect(isIntendedOverlap(explicit, makeValues(), makeTraces(), null)).toBe(true);
    expect(isIntendedOverlap(normal, makeValues(), makeTraces(), null)).toBe(false);
  });

  test('validateAndAdjust and validateDiagram are async and detect issues', async () => {
    const decl = {
      type: 'DiagramDeclaration',
      name: 'test',
      properties: {},
      elements: [
        makeElement('box1', 'box', { x: 50, y: 50, w: 200, h: 100 }),
        makeElement('box2', 'box', { x: 100, y: 80, w: 200, h: 100 }),
      ],
    };

    const adjusted = await validateAndAdjust(decl, makeValues(), makeTraces());
    expect(adjusted.validation.issues.length).toBeGreaterThan(0);
    expect(adjusted.report).toBeDefined();

    const validation = await validateDiagram(decl, makeValues(), makeTraces());
    expect(validation.valid).toBe(false);
    expect(validation.issues.some((issue) => issue.kind === 'overlap')).toBe(true);
  });

  test('validateAndAdjust keeps container-content diagrams valid without relayout', async () => {
    const decl = {
      type: 'DiagramDeclaration',
      name: 'container-ok',
      properties: {},
      elements: [
        makeElement('outer', 'panel', { x: 20, y: 20, w: 320, h: 220 }),
        makeElement('title', 'text', { x: 48, y: 48, w: 220, h: 30, value: 'Hello', size: 18 }),
        makeElement('card', 'box', { x: 52, y: 92, w: 160, h: 80 }),
      ],
    };

    const adjusted = await validateAndAdjust(decl, makeValues(), makeTraces());
    expect(adjusted.validation.valid).toBe(true);
    expect(adjusted.validation.issues).toHaveLength(0);

    const validation = await validateDiagram(decl, makeValues(), makeTraces());
    expect(validation.valid).toBe(true);
    expect(validation.issues).toHaveLength(0);
  });

  test('buildValidationSnapshot expands graph elements and keeps graph containers valid', async () => {
    const decl = {
      type: 'DiagramDeclaration',
      name: 'graph-ok',
      properties: {},
      elements: [
        makeElement('panel', 'panel', { x: 20, y: 20, w: 360, h: 260 }),
        makeElement('k3', 'graph', { x: 60, y: 56, w: 220, h: 160, layout: 'circle', padding: 26 }, [
          makeElement('n1', 'node', { label: '1' }),
          makeElement('n0', 'node', { label: '0' }),
          makeElement('n2', 'node', { label: '2' }),
          makeElement('e10', 'edge', { from: 'n1', to: 'n0' }),
          makeElement('e12', 'edge', { from: 'n1', to: 'n2', dash: '8 6' }),
        ]),
      ],
    };

    const snapshot = await buildValidationSnapshot(decl, makeValues(), makeTraces());
    expect(snapshot.elements.some((element) => element.type === 'graph')).toBe(false);
    expect(snapshot.elements.some((element) => element.type === 'circle')).toBe(true);

    const validation = await validateDiagram(decl, makeValues(), makeTraces());
    expect(validation.valid).toBe(true);
    expect(validation.issues).toHaveLength(0);
  });

  test('detects embed-too-small for legacy page layouts', async () => {
    const targetDecl = {
      type: 'DiagramDeclaration',
      name: 'wide',
      properties: {
        width: { type: 'Literal', value: 1800, location: ZERO_LOC },
        height: { type: 'Literal', value: 1020, location: ZERO_LOC },
        fixed_canvas: { type: 'Literal', value: true, location: ZERO_LOC },
      },
      elements: [
        makeElement('top', 'box', { x: 100, y: 100, w: 500, h: 120 }),
      ],
    };
    const pageDecl = {
      type: 'PageDeclaration',
      name: 'page',
      properties: {
        width: { type: 'Literal', value: 900, location: ZERO_LOC },
        height: { type: 'Literal', value: 520, location: ZERO_LOC },
        readability_mode: { type: 'Literal', value: 'legacy', location: ZERO_LOC },
        min_embed_scale: { type: 'Literal', value: 0.9, location: ZERO_LOC },
      },
      placements: [{ target: 'wide', position: 'cell(1,1)' }],
    };

    const validation = await validateDiagram(pageDecl, { wide: targetDecl } as any, makeTraces());
    expect(validation.issues.some((issue) => issue.kind === 'embed_too_small')).toBe(true);
  });

  test('detects excessive empty space and misaligned sibling panels', async () => {
    const decl = {
      type: 'DiagramDeclaration',
      name: 'manual',
      properties: {
        readability_mode: { type: 'Literal', value: 'legacy', location: ZERO_LOC },
      },
      elements: [
        makeElement('left', 'box', { x: 40, y: 40, w: 260, h: 320 }, [
          makeElement('tiny', 'text', { x: 20, y: 20, w: 120, h: 20, value: 'Tiny', size: 12 }),
        ]),
        makeElement('right', 'box', { x: 340, y: 52, w: 260, h: 320 }, [
          makeElement('tiny2', 'text', { x: 20, y: 20, w: 120, h: 20, value: 'Tiny 2', size: 12 }),
        ]),
      ],
    };

    const validation = await validateDiagram(decl, makeValues(), makeTraces());
    expect(validation.issues.some((issue) => issue.kind === 'misaligned_siblings')).toBe(true);
    expect(validation.issues.some((issue) => issue.kind === 'excessive_empty_space')).toBe(true);
  });

  test('detects final canvas clipping when strict sizing keeps content outside the canvas', async () => {
    const decl = {
      type: 'DiagramDeclaration',
      name: 'clipped',
      properties: {
        width: { type: 'Literal', value: 300, location: ZERO_LOC },
        height: { type: 'Literal', value: 200, location: ZERO_LOC },
        fixed_canvas: { type: 'Literal', value: true, location: ZERO_LOC },
        layout_mode: { type: 'Literal', value: 'manual', location: ZERO_LOC },
      },
      elements: [
        makeElement('panel', 'box', { x: 20, y: 160, w: 220, h: 80 }),
      ],
    };

    const validation = await validateDiagram(decl, makeValues(), makeTraces());
    expect(validation.issues.some((issue) => issue.kind === 'canvas_overflow_clipping')).toBe(true);
    expect(validation.issues.some((issue) => issue.kind === 'hard_constraint_overflow')).toBe(true);
  });

  test('detects plain math text but ignores inline LaTeX that is already typed correctly', async () => {
    const decl = {
      type: 'DiagramDeclaration',
      name: 'plain-math',
      properties: {},
      elements: [
        makeElement('k3', 'text', { x: 20, y: 20, w: 320, h: 28, value: '(I - Z0Z1)/2 + (I - Z0Z2)/2' }),
        makeElement('edge', 'text', { x: 20, y: 60, w: 320, h: 28, value: 'z0=+1  ->  1' }),
        makeElement('result', 'text', { x: 20, y: 100, w: 320, h: 28, value: 'Nilai C(z) = 2' }),
        makeElement('legend', 'text', { x: 20, y: 140, w: 320, h: 28, value: 'Biru = b_i = 0' }),
        makeElement('latex-ok', 'text', { x: 20, y: 180, w: 320, h: 28, value: 'Biru = $b_i = 0$, $C(z) = 2$', latex: 'auto' }),
      ],
    };

    const validation = await validateDiagram(decl, makeValues(), makeTraces());
    const plainMathIssues = validation.issues.filter((issue) => issue.kind === 'plain_math_text');

    expect(plainMathIssues.some((issue) => issue.element1.id === 'k3')).toBe(true);
    expect(plainMathIssues.some((issue) => issue.element1.id === 'edge')).toBe(true);
    expect(plainMathIssues.some((issue) => issue.element1.id === 'result')).toBe(false);
    expect(plainMathIssues.some((issue) => issue.element1.id === 'legend')).toBe(false);
    expect(plainMathIssues.some((issue) => issue.element1.id === 'latex-ok')).toBe(false);
  });
});
