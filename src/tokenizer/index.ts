import { Token, Position, TokenType } from '../ast/types';

export class Tokenizer {
  private source = '';
  private pos = 0;
  private line = 1;
  private column = 1;
  private tokens: Token[] = [];

  tokenize(source: string): Token[] {
    this.source = source;
    this.pos = 0;
    this.line = 1;
    this.column = 1;
    this.tokens = [];

    while (!this.isAtEnd()) {
      const ch = this.peek();
      const start = this.currentPos();

      if (ch === ' ' || ch === '\t' || ch === '\r') {
        this.advance();
        continue;
      }

      if (ch === '\n') {
        this.advance();
        this.addToken('NEWLINE', '\n', start);
        continue;
      }

      if (ch === '#') {
        while (!this.isAtEnd() && this.peek() !== '\n') this.advance();
        continue;
      }

      if (ch === '"' || ch === "'") {
        this.scanString(start, ch);
        continue;
      }

      if (this.isDigit(ch)) {
        this.scanNumber(start);
        continue;
      }

      if (this.isAlpha(ch) || ch === '_') {
        this.scanIdentifier(start);
        continue;
      }

      if (this.scanOperator(start)) continue;
      if (this.scanPunctuation(start)) continue;

      this.advance();
    }

    this.addToken('EOF', '', this.currentPos());
    return this.tokens;
  }

  private scanString(start: Position, quote: string): void {
    this.advance();
    let value = '';

    while (!this.isAtEnd() && this.peek() !== quote) {
      const ch = this.advance();
      if (ch === '\\' && !this.isAtEnd()) {
        const next = this.advance();
        value += next === 'n' ? '\n' : next === 't' ? '\t' : next === 'r' ? '\r' : next;
      } else {
        value += ch;
      }
    }

    if (!this.isAtEnd()) this.advance();
    this.addToken('STRING', value, start);
  }

  private scanNumber(start: Position): void {
    let value = '';
    while (!this.isAtEnd() && this.isDigit(this.peek())) value += this.advance();
    if (!this.isAtEnd() && this.peek() === '.' && this.isDigit(this.peekNext())) {
      value += this.advance();
      while (!this.isAtEnd() && this.isDigit(this.peek())) value += this.advance();
    }
    this.addToken('NUMBER', value, start);
  }

  private scanIdentifier(start: Position): void {
    let value = '';
    while (!this.isAtEnd() && (this.isAlphaNumeric(this.peek()) || this.peek() === '_')) {
      value += this.advance();
    }

    if (value === 'true' || value === 'false') {
      this.addToken('BOOLEAN', value, start);
    } else if (value === 'null') {
      this.addToken('NULL', value, start);
    } else {
      this.addToken('IDENTIFIER', value, start);
    }
  }

  private scanOperator(start: Position): boolean {
    const ch = this.peek();
    const next = this.peekNext();

    if (ch === '-' && next === '>') {
      this.advance();
      this.advance();
      this.addToken('ARROW', '->', start);
      return true;
    }

    const twoChar = `${ch}${next}`;
    if (['==', '!=', '<=', '>=', '&&', '||'].includes(twoChar)) {
      this.advance();
      this.advance();
      this.addToken('OPERATOR', twoChar, start);
      return true;
    }

    if ('+-*/%^<>!?'.includes(ch)) {
      this.advance();
      this.addToken('OPERATOR', ch, start);
      return true;
    }

    return false;
  }

  private scanPunctuation(start: Position): boolean {
    const ch = this.peek();
    const map: Record<string, TokenType> = {
      '[': 'LBRACKET',
      ']': 'RBRACKET',
      '(': 'LPAREN',
      ')': 'RPAREN',
      '{': 'LBRACE',
      '}': 'RBRACE',
      ':': 'COLON',
      ',': 'COMMA',
      '|': 'PIPE',
      '.': 'PERIOD',
      '=': 'EQUALS',
    };

    const type = map[ch];
    if (!type) return false;
    this.advance();
    this.addToken(type, ch, start);
    return true;
  }

  private addToken(type: TokenType, value: string, start: Position): void {
    this.tokens.push({
      type,
      value,
      location: { start, end: this.currentPos() },
    });
  }

  private currentPos(): Position {
    return { line: this.line, column: this.column, offset: this.pos };
  }

  private advance(): string {
    const ch = this.source[this.pos++] ?? '';
    if (ch === '\n') {
      this.line += 1;
      this.column = 1;
    } else {
      this.column += 1;
    }
    return ch;
  }

  private peek(): string {
    return this.source[this.pos] ?? '';
  }

  private peekNext(): string {
    return this.source[this.pos + 1] ?? '';
  }

  private isAtEnd(): boolean {
    return this.pos >= this.source.length;
  }

  private isDigit(ch: string): boolean {
    return /[0-9]/.test(ch);
  }

  private isAlpha(ch: string): boolean {
    return /[A-Za-z]/.test(ch);
  }

  private isAlphaNumeric(ch: string): boolean {
    return /[A-Za-z0-9]/.test(ch);
  }
}
