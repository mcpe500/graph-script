import { expect, test } from 'vitest';
import { Lexer } from '../../packages/parser/src/lexer.js';
import { TokenType } from '../../packages/parser/src/tokens.js';

test('Lexer parses basic tokens', () => {
  const source = `use chart
const title = "Hello"
`;
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();

  expect(tokens[0].type).toBe(TokenType.Use);
  expect(tokens[1].type).toBe(TokenType.Chart);
  expect(tokens[1].value).toBe('chart');
  expect(tokens[2].type).toBe(TokenType.Newline);
  expect(tokens[3].type).toBe(TokenType.Const);
  expect(tokens[4].type).toBe(TokenType.Identifier);
  expect(tokens[4].value).toBe('title');
  expect(tokens[5].type).toBe(TokenType.Equals);
  expect(tokens[6].type).toBe(TokenType.StringLiteral);
  expect(tokens[6].value).toBe('Hello');
  expect(tokens[7].type).toBe(TokenType.Newline);
  expect(tokens[8].type).toBe(TokenType.EOF);
});
