import { Token, TokenType, SourceLocation, Position } from '@graphscript/ast';

export class Tokenizer {
  private source: string = '';
  private pos: number = 0;
  private line: number = 1;
  private column: number = 1;
  private tokens: Token[] = [];
  private indentStack: number[] = [0];
  private lineStart: number = 0;

  tokenize(source: string): Token[] {
    this.source = source;
    this.reset();
    this.tokenizeAll();
    return this.tokens;
  }

  private reset(): void {
    this.pos = 0;
    this.line = 1;
    this.column = 1;
    this.tokens = [];
    this.indentStack = [0];
    this.lineStart = 0;
  }

  private tokenizeAll(): void {
    while (!this.isEof()) {
      this.skipWhitespace();
      if (this.isEof()) break;
      
      const start = this.currentLocation();
      
      if (this.match('#')) {
        this.skipComment();
        continue;
      }

      if (this.match('\n')) {
        this.newlineToken();
        continue;
      }

      if (this.match('"') || this.match("'")) {
        this.stringToken(start);
        continue;
      }

      if (this.isDigit(this.peek())) {
        this.numberToken(start);
        continue;
      }

      if (this.isAlpha(this.peek()) || this.peek() === '_') {
        this.identifierToken(start);
        continue;
      }

      if (this.match('[')) {
        this.addToken('LBRACKET', '[', start);
        continue;
      }
      if (this.match(']')) {
        this.addToken('RBRACKET', ']', start);
        continue;
      }
      if (this.match('(')) {
        this.addToken('LPAREN', '(', start);
        continue;
      }
      if (this.match(')')) {
        this.addToken('RPAREN', ')', start);
        continue;
      }
      if (this.match('{')) {
        this.addToken('LBRACE', '{', start);
        continue;
      }
      if (this.match('}')) {
        this.addToken('RBRACE', '}', start);
        continue;
      }
      if (this.match(':')) {
        this.addToken('COLON', ':', start);
        continue;
      }
      if (this.match(',')) {
        this.addToken('COMMA', ',', start);
        continue;
      }
      if (this.match('|')) {
        this.addToken('PIPE', '|', start);
        continue;
      }
      if (this.match('=')) {
        this.addToken('EQUALS', '=', start);
        continue;
      }
      if (this.match('-') && this.peek() === '>') {
        this.advance();
        this.addToken('ARROW', '->', start);
        continue;
      }

      if (this.isOperator(this.peek())) {
        this.operatorToken(start);
        continue;
      }

      this.error(`Unexpected character: ${this.peek()}`);
      this.advance();
    }

    this.addToken('EOF', '', this.currentLocation());
    
    while (this.indentStack.length > 1) {
      this.indentStack.pop();
      const loc = this.currentLocation();
      this.addToken('DEDENT', '', loc);
    }
  }

  private skipWhitespace(): void {
    while (!this.isEof() && ' \t'.includes(this.peek())) {
      this.advance();
    }
  }

  private skipComment(): void {
    while (!this.isEof() && this.peek() !== '\n') {
      this.advance();
    }
  }

  private newlineToken(): void {
    const indent = this.calculateIndent();
    const start = this.currentLocation();
    
    this.addToken('NEWLINE', '\n', start);
    
    if (indent > this.indentStack[this.indentStack.length - 1]) {
      this.indentStack.push(indent);
      this.addToken('INDENT', '', start);
    } else if (indent < this.indentStack[this.indentStack.length - 1]) {
      while (indent < this.indentStack[this.indentStack.length - 1]) {
        this.indentStack.pop();
        this.addToken('DEDENT', '', start);
      }
    }
  }

  private calculateIndent(): number {
    const start = this.pos;
    while (' \t'.includes(this.peek())) {
      this.advance();
    }
    const indent = this.pos - start;
    this.pos = start;
    return indent;
  }

  private stringToken(start: Position): void {
    const quote = this.peek();
    this.advance();
    let value = '';
    while (!this.isEof() && this.peek() !== quote) {
      if (this.peek() === '\\') {
        this.advance();
        const ch = this.peek();
        if (ch === 'n') value += '\n';
        else if (ch === 't') value += '\t';
        else value += ch;
      } else {
        value += this.peek();
      }
      this.advance();
    }
    this.advance();
    this.addToken('STRING', value, start);
  }

  private numberToken(start: Position): void {
    let value = '';
    while (!this.isEof() && (this.isDigit(this.peek()) || this.peek() === '.') {
      value += this.peek();
      this.advance();
    }
    this.addToken('NUMBER', value, start);
  }

  private identifierToken(start: Position): void {
    let value = '';
    while (!this.isEof() && (this.isAlphaNumeric(this.peek()) || this.peek() === '_' || this.peek() === '.')) {
      value += this.peek();
      this.advance();
    }

    if (value === 'true' || value === 'false') {
      this.addToken('BOOLEAN', value, start);
    } else if (value === 'null') {
      this.addToken('NULL', value, start);
    } else {
      this.addToken('IDENTIFIER', value, start);
    }
  }

  private operatorToken(start: Position): void {
    let value = '';
    while (!this.isEof() && this.isOperator(this.peek())) {
      value += this.peek();
      this.advance();
    }
    this.addToken('OPERATOR', value, start);
  }

  private isOperator(ch: string): boolean {
    return '+-*/%^=<>!&|'.includes(ch);
  }

  private isDigit(ch: string): boolean {
    return /[0-9]/.test(ch);
  }

  private isAlpha(ch: string): boolean {
    return /[a-zA-Z_]/.test(ch);
  }

  private isAlphaNumeric(ch: string): boolean {
    return /[a-zA-Z0-9_]/.test(ch);
  }

  private peek(): string {
    return this.source[this.pos];
  }

  private advance(): string {
    const ch = this.source[this.pos];
    this.pos++;
    if (ch === '\n') {
      this.line++;
      this.column = 1;
      this.lineStart = this.pos;
    } else {
      this.column++;
    }
    return ch;
  }

  private match(expected: string): boolean {
    return this.peek() === expected;
  }

  private isEof(): boolean {
    return this.pos >= this.source.length;
  }

  private currentLocation(): Position {
    return {
      line: this.line,
      column: this.column,
      offset: this.pos
    };
  }

  private addToken(type: TokenType, value: string, start: Position): void {
    this.tokens.push({
      type,
      value,
      location: {
        start,
        end: this.currentLocation()
      }
    });
  }

  private error(message: string): void {
    console.error(`Tokenizer error at ${this.line}:${this.column}: ${message}`);
  }
}
