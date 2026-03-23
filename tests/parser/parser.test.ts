import { expect, test } from 'vitest';
import { Lexer } from '../../packages/parser/src/lexer.js';
import { Parser } from '../../packages/parser/src/parser.js';

test('Parser parses use statement', () => {
  const source = `use chart\n`;
  const lexer = new Lexer(source);
  const parser = new Parser(lexer.tokenize());
  const ast = parser.parse();

  expect(ast.type).toBe('Program');
  expect(ast.body.length).toBe(1);
  expect(ast.body[0].type).toBe('UseStatement');
  expect((ast.body[0] as any).module).toBe('chart');
});

test('Parser parses data block', () => {
  const source = `data:
  xs = [1, 2, 3]
  ys = [4, 5, 6]
`;
  const lexer = new Lexer(source);
  const parser = new Parser(lexer.tokenize());
  const ast = parser.parse();

  expect(ast.type).toBe('Program');
  expect(ast.body.length).toBe(1);
  expect(ast.body[0].type).toBe('DataBlock');
});
