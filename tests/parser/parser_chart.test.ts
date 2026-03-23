import { expect, test } from 'vitest';
import { Lexer } from '../../packages/parser/src/lexer.js';
import { Parser } from '../../packages/parser/src/parser.js';

test('Parser parses chart block', () => {
  const source = `chart "Sigmoid":
  type = line
  x = xs
  y = ys
`;
  const lexer = new Lexer(source);
  const parser = new Parser(lexer.tokenize());
  const ast = parser.parse();

  expect(ast.type).toBe('Program');
  expect(ast.body.length).toBe(1);
  expect(ast.body[0].type).toBe('ChartBlock');
  expect((ast.body[0] as any).name).toBe('Sigmoid');
  expect((ast.body[0] as any).body.length).toBe(3);
  expect((ast.body[0] as any).body[0].name).toBe('type');
  expect((ast.body[0] as any).body[0].value.value).toBe('line');
});
