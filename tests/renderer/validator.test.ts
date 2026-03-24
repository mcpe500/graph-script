import {
  extractBoundingBoxes,
  detectOverlaps,
  calculateOverlap,
  calculateReadability,
  calculateReadabilityScore,
  isIntendedOverlap,
  validateAndAdjust,
  isValidatableDeclaration,
  needsRelayout,
  OVERLAP_TOLERANCE,
  MIN_FONT_SIZE,
  MIN_ELEMENT_SIZE,
  BoundingBox,
  OverlapIssue,
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
  children?: DiagramElement[]
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
  describe('isValidatableDeclaration', () => {
    it('returns true for DiagramDeclaration', () => {
      expect(isValidatableDeclaration('DiagramDeclaration')).toBe(true);
    });

    it('returns true for FlowDeclaration', () => {
      expect(isValidatableDeclaration('FlowDeclaration')).toBe(true);
    });

    it('returns true for ChartDeclaration', () => {
      expect(isValidatableDeclaration('ChartDeclaration')).toBe(true);
    });

    it('returns true for TableDeclaration', () => {
      expect(isValidatableDeclaration('TableDeclaration')).toBe(true);
    });

    it('returns true for ErdDeclaration', () => {
      expect(isValidatableDeclaration('ErdDeclaration')).toBe(true);
    });

    it('returns true for InfraDeclaration', () => {
      expect(isValidatableDeclaration('InfraDeclaration')).toBe(true);
    });

    it('returns true for PageDeclaration', () => {
      expect(isValidatableDeclaration('PageDeclaration')).toBe(true);
    });

    it('returns true for Plot3dDeclaration', () => {
      expect(isValidatableDeclaration('Plot3dDeclaration')).toBe(true);
    });

    it('returns true for Scene3dDeclaration', () => {
      expect(isValidatableDeclaration('Scene3dDeclaration')).toBe(true);
    });

    it('returns false for unknown types', () => {
      expect(isValidatableDeclaration('UnknownDeclaration')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isValidatableDeclaration('')).toBe(false);
    });
  });

  describe('needsRelayout', () => {
    it('returns true for DiagramDeclaration', () => {
      expect(needsRelayout('DiagramDeclaration')).toBe(true);
    });

    it('returns true for FlowDeclaration', () => {
      expect(needsRelayout('FlowDeclaration')).toBe(true);
    });

    it('returns true for ErdDeclaration', () => {
      expect(needsRelayout('ErdDeclaration')).toBe(true);
    });

    it('returns true for InfraDeclaration', () => {
      expect(needsRelayout('InfraDeclaration')).toBe(true);
    });

    it('returns true for PageDeclaration', () => {
      expect(needsRelayout('PageDeclaration')).toBe(true);
    });

    it('returns false for ChartDeclaration', () => {
      expect(needsRelayout('ChartDeclaration')).toBe(false);
    });

    it('returns false for TableDeclaration', () => {
      expect(needsRelayout('TableDeclaration')).toBe(false);
    });
  });

  describe('extractBoundingBoxes', () => {
    it('extracts boxes from panel elements', () => {
      const elements: DiagramElement[] = [
        makeElement('panel1', 'panel', { x: 50, y: 50, w: 200, h: 100 }),
      ];
      const values = makeValues();
      const traces = makeTraces();

      const boxes = extractBoundingBoxes(elements, values, traces);

      expect(boxes).toHaveLength(1);
      expect(boxes[0].id).toBe('panel1');
      expect(boxes[0].x).toBe(50);
      expect(boxes[0].y).toBe(50);
      expect(boxes[0].width).toBe(200);
      expect(boxes[0].height).toBe(100);
    });

    it('extracts boxes from nested children', () => {
      const elements: DiagramElement[] = [
        makeElement('container', 'panel', { x: 100, y: 100, w: 400, h: 300 }, [
          makeElement('child1', 'box', { x: 20, y: 40, w: 150, h: 80 }),
          makeElement('child2', 'box', { x: 200, y: 40, w: 150, h: 80 }),
        ]),
      ];
      const values = makeValues();
      const traces = makeTraces();

      const boxes = extractBoundingBoxes(elements, values, traces);

      expect(boxes).toHaveLength(3);
      expect(boxes[0].id).toBe('container');
      expect(boxes[1].id).toBe('child1');
      expect(boxes[1].x).toBe(120);
      expect(boxes[1].y).toBe(140);
    });

    it('handles elements without dimensions', () => {
      const elements: DiagramElement[] = [
        makeElement('valid', 'box', { x: 50, y: 50, w: 200, h: 100 }),
        makeElement('invalid', 'box', { x: 100, y: 100 }),
      ];
      const values = makeValues();
      const traces = makeTraces();

      const boxes = extractBoundingBoxes(elements, values, traces);

      expect(boxes).toHaveLength(1);
      expect(boxes[0].id).toBe('valid');
    });

    it('skips line, arrow, and connector elements', () => {
      const elements: DiagramElement[] = [
        makeElement('box1', 'box', { x: 50, y: 50, w: 200, h: 100 }),
        makeElement('line1', 'line', { x: 0, y: 0, w: 100, h: 100 }),
        makeElement('arrow1', 'arrow', { x: 0, y: 0, w: 100, h: 100 }),
        makeElement('connector1', 'connector', { x: 0, y: 0, w: 100, h: 100 }),
      ];
      const values = makeValues();
      const traces = makeTraces();

      const boxes = extractBoundingBoxes(elements, values, traces);

      expect(boxes).toHaveLength(1);
      expect(boxes[0].id).toBe('box1');
    });
  });

  describe('detectOverlaps', () => {
    it('detects overlapping boxes', () => {
      const boxes: BoundingBox[] = [
        { id: 'box1', type: 'box', x: 0, y: 0, width: 100, height: 100, allowOverlap: false },
        { id: 'box2', type: 'box', x: 50, y: 50, width: 100, height: 100, allowOverlap: false },
      ];

      const issues = detectOverlaps(boxes);

      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].element1.id).toBe('box1');
      expect(issues[0].element2.id).toBe('box2');
    });

    it('ignores non-overlapping boxes', () => {
      const boxes: BoundingBox[] = [
        { id: 'box1', type: 'box', x: 0, y: 0, width: 100, height: 100, allowOverlap: false },
        { id: 'box2', type: 'box', x: 200, y: 200, width: 100, height: 100, allowOverlap: false },
      ];

      const issues = detectOverlaps(boxes);

      expect(issues).toHaveLength(0);
    });

    it('respects tolerance threshold', () => {
      const boxes: BoundingBox[] = [
        { id: 'box1', type: 'box', x: 0, y: 0, width: 100, height: 100, allowOverlap: false },
        { id: 'box2', type: 'box', x: 99, y: 99, width: 100, height: 100, allowOverlap: false },
      ];

      const issues = detectOverlaps(boxes, 5);

      expect(issues).toHaveLength(0);
    });

    it('skips boxes with allowOverlap=true', () => {
      const boxes: BoundingBox[] = [
        { id: 'box1', type: 'box', x: 0, y: 0, width: 100, height: 100, allowOverlap: true },
        { id: 'box2', type: 'box', x: 50, y: 50, width: 100, height: 100, allowOverlap: false },
      ];

      const issues = detectOverlaps(boxes);

      expect(issues).toHaveLength(0);
    });

    it('assigns correct severity based on overlap percentage', () => {
      const boxes: BoundingBox[] = [
        { id: 'box1', type: 'box', x: 0, y: 0, width: 100, height: 100, allowOverlap: false },
        { id: 'box2', type: 'box', x: 10, y: 10, width: 100, height: 100, allowOverlap: false },
      ];

      const issues = detectOverlaps(boxes);

      expect(issues[0].severity).toBe('error');
      expect(issues[0].overlapPercentage).toBeGreaterThan(30);
    });
  });

  describe('calculateOverlap', () => {
    it('calculates correct overlap area and percentage', () => {
      const a: BoundingBox = { id: 'a', type: 'box', x: 0, y: 0, width: 100, height: 100, allowOverlap: false };
      const b: BoundingBox = { id: 'b', type: 'box', x: 50, y: 50, width: 100, height: 100, allowOverlap: false };

      const result = calculateOverlap(a, b);

      expect(result.area).toBe(50 * 50);
      expect(result.percentage).toBe(25);
    });

    it('returns zero for non-overlapping boxes', () => {
      const a: BoundingBox = { id: 'a', type: 'box', x: 0, y: 0, width: 100, height: 100, allowOverlap: false };
      const b: BoundingBox = { id: 'b', type: 'box', x: 200, y: 200, width: 100, height: 100, allowOverlap: false };

      const result = calculateOverlap(a, b);

      expect(result.area).toBe(0);
      expect(result.percentage).toBe(0);
    });
  });

  describe('calculateReadability', () => {
    it('calculates min font size from text elements', () => {
      const elements: DiagramElement[] = [
        makeElement('text1', 'text', { x: 0, y: 0, size: 14, value: 'Hello' }),
        makeElement('text2', 'text', { x: 0, y: 50, size: 10, value: 'World' }),
        makeElement('text3', 'text', { x: 0, y: 100, size: 18, value: 'Test' }),
      ];
      const values = makeValues();
      const traces = makeTraces();

      const metrics = calculateReadability(elements, values, traces);

      expect(metrics.minFontSize).toBe(10);
      expect(metrics.avgFontSize).toBeCloseTo(14);
    });

    it('calculates min element size from box dimensions', () => {
      const elements: DiagramElement[] = [
        makeElement('box1', 'box', { x: 0, y: 0, w: 100, h: 80 }),
        makeElement('box2', 'box', { x: 0, y: 0, w: 50, h: 60 }),
        makeElement('box3', 'box', { x: 0, y: 0, w: 200, h: 150 }),
      ];
      const values = makeValues();
      const traces = makeTraces();

      const metrics = calculateReadability(elements, values, traces);

      expect(metrics.minElementSize).toBe(50);
    });

    it('handles empty elements array', () => {
      const metrics = calculateReadability([], makeValues(), makeTraces());

      expect(metrics.minFontSize).toBe(MIN_FONT_SIZE);
      expect(metrics.minElementSize).toBe(MIN_ELEMENT_SIZE);
      expect(metrics.elementCount).toBe(0);
    });

    it('counts elements correctly', () => {
      const elements: DiagramElement[] = [
        makeElement('box1', 'box', { x: 0, y: 0, w: 100, h: 80 }),
        makeElement('box2', 'box', { x: 0, y: 0, w: 100, h: 80 }),
        makeElement('box3', 'box', { x: 0, y: 0, w: 100, h: 80 }),
      ];
      const values = makeValues();
      const traces = makeTraces();

      const metrics = calculateReadability(elements, values, traces);

      expect(metrics.elementCount).toBe(3);
    });

    it('processes nested children', () => {
      const elements: DiagramElement[] = [
        makeElement('parent', 'panel', { x: 0, y: 0, w: 400, h: 300 }, [
          makeElement('child', 'text', { x: 20, y: 20, size: 12, value: 'Nested' }),
        ]),
      ];
      const values = makeValues();
      const traces = makeTraces();

      const metrics = calculateReadability(elements, values, traces);

      expect(metrics.elementCount).toBe(2);
      expect(metrics.minFontSize).toBe(12);
    });
  });

  describe('calculateReadabilityScore', () => {
    it('returns 100 for perfect metrics', () => {
      const metrics: ReadabilityMetrics = {
        minFontSize: 16,
        avgFontSize: 18,
        minElementSize: 50,
        density: 10000,
        elementCount: 10,
      };

      const score = calculateReadabilityScore(metrics);

      expect(score).toBe(100);
    });

    it('penalizes small font sizes', () => {
      const metrics: ReadabilityMetrics = {
        minFontSize: 8,
        avgFontSize: 12,
        minElementSize: 50,
        density: 10000,
        elementCount: 10,
      };

      const score = calculateReadabilityScore(metrics);

      expect(score).toBeLessThan(100);
    });

    it('penalizes small element sizes', () => {
      const metrics: ReadabilityMetrics = {
        minFontSize: 16,
        avgFontSize: 18,
        minElementSize: 15,
        density: 10000,
        elementCount: 10,
      };

      const score = calculateReadabilityScore(metrics);

      expect(score).toBeLessThan(100);
    });

    it('penalizes high element count', () => {
      const metrics: ReadabilityMetrics = {
        minFontSize: 16,
        avgFontSize: 18,
        minElementSize: 50,
        density: 10000,
        elementCount: 60,
      };

      const score = calculateReadabilityScore(metrics);

      expect(score).toBeLessThan(100);
    });

    it('never goes below 0', () => {
      const metrics: ReadabilityMetrics = {
        minFontSize: 4,
        avgFontSize: 5,
        minElementSize: 5,
        density: 100000,
        elementCount: 100,
      };

      const score = calculateReadabilityScore(metrics);

      expect(score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('isIntendedOverlap', () => {
    it('allows parent-child relationships', () => {
      const element = makeElement('child', 'box', { x: 20, y: 20, w: 100, h: 80 });
      const values = makeValues();
      const traces = makeTraces();

      const result = isIntendedOverlap(element, values, traces, true);

      expect(result).toBe(true);
    });

    it('allows transparent elements', () => {
      const element = makeElement('transparent', 'box', { x: 0, y: 0, w: 100, h: 80, fillOpacity: 0.3 });
      const values = makeValues();
      const traces = makeTraces();

      const result = isIntendedOverlap(element, values, traces, false);

      expect(result).toBe(true);
    });

    it('allows explicit allow_overlap flag', () => {
      const element = makeElement('allowed', 'box', { x: 0, y: 0, w: 100, h: 80, allow_overlap: true });
      const values = makeValues();
      const traces = makeTraces();

      const result = isIntendedOverlap(element, values, traces, false);

      expect(result).toBe(true);
    });

    it('returns false for normal elements', () => {
      const element = makeElement('normal', 'box', { x: 0, y: 0, w: 100, h: 80 });
      const values = makeValues();
      const traces = makeTraces();

      const result = isIntendedOverlap(element, values, traces, false);

      expect(result).toBe(false);
    });
  });

  describe('validateAndAdjust', () => {
    it('passes clean diagrams', () => {
      const decl = {
        type: 'DiagramDeclaration',
        name: 'test',
        elements: [
          makeElement('box1', 'box', { x: 50, y: 50, w: 200, h: 100 }),
          makeElement('box2', 'box', { x: 300, y: 50, w: 200, h: 100 }),
        ],
      };
      const values = makeValues();
      const traces = makeTraces();

      const result = validateAndAdjust(decl, values, traces);

      expect(result.validation.valid).toBe(true);
      expect(result.validation.issues).toHaveLength(0);
    });

    it('detects overlapping elements', () => {
      const decl = {
        type: 'DiagramDeclaration',
        name: 'test',
        elements: [
          makeElement('box1', 'box', { x: 50, y: 50, w: 200, h: 100 }),
          makeElement('box2', 'box', { x: 100, y: 80, w: 200, h: 100 }),
        ],
      };
      const values = makeValues();
      const traces = makeTraces();

      const result = validateAndAdjust(decl, values, traces);

      expect(result.validation.issues.length).toBeGreaterThan(0);
    });

    it('skips validation for non-relayout types', () => {
      const decl = {
        type: 'ChartDeclaration',
        name: 'test',
        elements: [],
      };
      const values = makeValues();
      const traces = makeTraces();

      const result = validateAndAdjust(decl, values, traces);

      expect(result.validation.valid).toBe(true);
    });

    it('handles empty elements array', () => {
      const decl = {
        type: 'DiagramDeclaration',
        name: 'test',
        elements: [],
      };
      const values = makeValues();
      const traces = makeTraces();

      const result = validateAndAdjust(decl, values, traces);

      expect(result.validation.valid).toBe(true);
    });

    it('generates report with correct structure', () => {
      const decl = {
        type: 'DiagramDeclaration',
        name: 'test',
        elements: [
          makeElement('box1', 'box', { x: 50, y: 50, w: 200, h: 100 }),
          makeElement('box2', 'box', { x: 300, y: 50, w: 200, h: 100 }),
        ],
      };
      const values = makeValues();
      const traces = makeTraces();

      const result = validateAndAdjust(decl, values, traces);

      expect(result.report).toBeDefined();
      expect(result.report.timestamp).toBeDefined();
      expect(result.report.declaration).toBe('test');
      expect(result.report.declarationType).toBe('DiagramDeclaration');
      expect(result.report.metrics).toBeDefined();
      expect(result.report.suggestions).toBeDefined();
    });
  });
});
