import { Token, TokenType } from './tokens.js';

export class Lexer {
  private pos = 0;
  private line = 1;
  private column = 1;
  private indentStack: number[] = [0];

  constructor(private source: string) {}

  public tokenize(): Token[] {
    const tokens: Token[] = [];

    while (this.pos < this.source.length) {
      const char = this.source[this.pos];

      // Handle newlines and indentation
      if (char === '\n') {
        tokens.push(this.makeToken(TokenType.Newline, '\n'));
        this.pos++;
        this.line++;
        this.column = 1;

        let indent = 0;
        while (this.pos < this.source.length && this.source[this.pos] === ' ') {
          indent++;
          this.pos++;
          this.column++;
        }

        if (this.pos < this.source.length && this.source[this.pos] !== '\n') {
          const currentIndent = this.indentStack[this.indentStack.length - 1];
          if (indent > currentIndent) {
            this.indentStack.push(indent);
            tokens.push(this.makeToken(TokenType.Indent, ''));
          } else if (indent < currentIndent) {
            while (this.indentStack.length > 1 && indent < this.indentStack[this.indentStack.length - 1]) {
              this.indentStack.pop();
              tokens.push(this.makeToken(TokenType.Dedent, ''));
            }
          }
        }
        continue;
      }

      // Skip whitespace
      if (/\s/.test(char)) {
        this.pos++;
        this.column++;
        continue;
      }

      // Skip comments
      if (char === '#') {
        while (this.pos < this.source.length && this.source[this.pos] !== '\n') {
          this.pos++;
          this.column++;
        }
        continue;
      }

      // Punctuation
      if (char === ':') { tokens.push(this.makeToken(TokenType.Colon, ':')); this.pos++; this.column++; continue; }
      if (char === '=') { tokens.push(this.makeToken(TokenType.Equals, '=')); this.pos++; this.column++; continue; }
      if (char === ',') { tokens.push(this.makeToken(TokenType.Comma, ',')); this.pos++; this.column++; continue; }
      if (char === '[') { tokens.push(this.makeToken(TokenType.LBracket, '[')); this.pos++; this.column++; continue; }
      if (char === ']') { tokens.push(this.makeToken(TokenType.RBracket, ']')); this.pos++; this.column++; continue; }
      if (char === '(') { tokens.push(this.makeToken(TokenType.LParen, '(')); this.pos++; this.column++; continue; }
      if (char === ')') { tokens.push(this.makeToken(TokenType.RParen, ')')); this.pos++; this.column++; continue; }
      if (char === '.') { tokens.push(this.makeToken(TokenType.Dot, '.')); this.pos++; this.column++; continue; }
      if (char === '{') { tokens.push(this.makeToken(TokenType.LBrace, '{')); this.pos++; this.column++; continue; }
      if (char === '}') { tokens.push(this.makeToken(TokenType.RBrace, '}')); this.pos++; this.column++; continue; }

      // Keywords & Identifiers
      if (/[a-zA-Z_]/.test(char)) {
        let val = '';
        const startCol = this.column;
        while (this.pos < this.source.length && /[a-zA-Z0-9_]/.test(this.source[this.pos])) {
          val += this.source[this.pos];
          this.pos++;
          this.column++;
        }

        const tokenType = this.getKeywordType(val);
        tokens.push({
          type: tokenType,
          value: val,
          line: this.line,
          column: startCol
        });
        continue;
      }

      // Numbers
      if (/[0-9]/.test(char) || (char === '-' && /[0-9]/.test(this.source[this.pos + 1]))) {
        let val = '';
        const startCol = this.column;
        if (char === '-') {
            val += '-';
            this.pos++;
            this.column++;
        }
        while (this.pos < this.source.length && /[0-9\.]/.test(this.source[this.pos])) {
            val += this.source[this.pos];
            this.pos++;
            this.column++;
        }
        tokens.push({
            type: TokenType.NumberLiteral,
            value: val,
            line: this.line,
            column: startCol
        });
        continue;
      }

      // Strings
      if (char === '"' || char === "'") {
          let val = '';
          const startCol = this.column;
          const quoteChar = char;
          this.pos++;
          this.column++;
          while (this.pos < this.source.length && this.source[this.pos] !== quoteChar) {
              val += this.source[this.pos];
              this.pos++;
              this.column++;
          }
          if (this.pos < this.source.length) {
              this.pos++;
              this.column++;
          }
          tokens.push({
              type: TokenType.StringLiteral,
              value: val,
              line: this.line,
              column: startCol
          });
          continue;
      }

      this.pos++;
      this.column++;
    }

    // Unwind indent stack at EOF
    while (this.indentStack.length > 1) {
      this.indentStack.pop();
      tokens.push(this.makeToken(TokenType.Dedent, ''));
    }

    tokens.push(this.makeToken(TokenType.EOF, ''));
    return tokens;
  }

  private makeToken(type: TokenType, value: string): Token {
    return { type, value, line: this.line, column: this.column };
  }

  private getKeywordType(val: string): TokenType {
    switch (val) {
      case 'use': return TokenType.Use;
      case 'import': return TokenType.Import;
      case 'const': return TokenType.Const;
      case 'data': return TokenType.Data;
      case 'func': return TokenType.Func;
      case 'theme': return TokenType.Theme;
      case 'style': return TokenType.Style;
      case 'sub': return TokenType.Sub;
      case 'algo': return TokenType.Algo;
      case 'pseudo': return TokenType.Pseudo;
      case 'chart': return TokenType.Chart;
      case 'flow': return TokenType.Flow;
      case 'diagram': return TokenType.Diagram;
      case 'table': return TokenType.Table;
      case 'plot3d': return TokenType.Plot3d;
      case 'scene3d': return TokenType.Scene3d;
      case 'erd': return TokenType.Erd;
      case 'infra': return TokenType.Infra;
      case 'page': return TokenType.Page;
      case 'render': return TokenType.Render;
      case 'true':
      case 'false': return TokenType.BooleanLiteral;
      default: return TokenType.Identifier;
    }
  }
}
