import { Token, TokenType } from './tokens.js';
import { Program, Statement, DataBlock, Assignment, Expression, StringLiteral, NumberLiteral, ArrayLiteral, CallExpression, ChartBlock } from '@graphscript/ast';

export class Parser {
  private current = 0;

  constructor(private tokens: Token[]) {}

  public parse(): Program {
    const statements: Statement[] = [];
    while (!this.isAtEnd()) {
      if (this.check(TokenType.Newline)) {
          this.advance();
          continue;
      }
      statements.push(this.declaration());
    }
    return { type: 'Program', body: statements };
  }

  private declaration(): Statement {
    if (this.match(TokenType.Use)) return this.useStatement();
    if (this.match(TokenType.Data)) return this.dataBlock();
    if (this.match(TokenType.Chart)) return this.chartBlock();

    // Fallback for now, consume token
    this.advance();
    return { type: 'UseStatement', module: 'fallback' } as Statement;
  }

  private useStatement(): Statement {
    let module = '';

    if (this.check(TokenType.Identifier) ||
        this.check(TokenType.Chart) ||
        this.check(TokenType.Flow) ||
        this.check(TokenType.Table) ||
        this.check(TokenType.Diagram)) {
        module = this.advance().value;
    } else {
        throw new Error("Expect module name after 'use'.");
    }

    while (this.match(TokenType.Dot)) {
        if (this.check(TokenType.Identifier)) {
            module += '.' + this.advance().value;
        } else {
            throw new Error("Expect identifier after '.'.");
        }
    }

    this.consume(TokenType.Newline, "Expect newline after use statement.");
    return { type: 'UseStatement', module };
  }

  private dataBlock(): DataBlock {
      this.consume(TokenType.Colon, "Expect ':' after 'data'.");
      this.consume(TokenType.Newline, "Expect newline after 'data:'.");
      this.consume(TokenType.Indent, "Expect indentation in data block.");

      const body: Assignment[] = [];
      while (!this.check(TokenType.Dedent) && !this.isAtEnd()) {
          if (this.check(TokenType.Newline)) {
              this.advance();
              continue;
          }
          body.push(this.assignment());
      }

      if (!this.isAtEnd()) {
          this.consume(TokenType.Dedent, "Expect dedent after data block.");
      }

      return { type: 'DataBlock', body };
  }

  private chartBlock(): ChartBlock {
      const nameToken = this.consume(TokenType.StringLiteral, "Expect chart name as string literal.");
      this.consume(TokenType.Colon, "Expect ':' after chart name.");
      this.consume(TokenType.Newline, "Expect newline after 'chart \"name\":'.");
      this.consume(TokenType.Indent, "Expect indentation in chart block.");

      const body: Assignment[] = [];
      while (!this.check(TokenType.Dedent) && !this.isAtEnd()) {
          if (this.check(TokenType.Newline)) {
              this.advance();
              continue;
          }
          body.push(this.assignment());
      }

      if (!this.isAtEnd()) {
          this.consume(TokenType.Dedent, "Expect dedent after chart block.");
      }

      return { type: 'ChartBlock', name: nameToken.value, body };
  }

  private assignment(): Assignment {
      const name = this.consume(TokenType.Identifier, "Expect variable name.").value;
      this.consume(TokenType.Equals, "Expect '=' after variable name.");
      const value = this.expression();
      if (!this.isAtEnd() && this.check(TokenType.Newline)) {
          this.advance();
      }
      return { type: 'Assignment', name, value };
  }

  private expression(): Expression {
      if (this.match(TokenType.StringLiteral)) {
          return { type: 'StringLiteral', value: this.previous().value };
      }
      if (this.match(TokenType.NumberLiteral)) {
          return { type: 'NumberLiteral', value: parseFloat(this.previous().value) };
      }
      if (this.match(TokenType.LBracket)) {
          return this.arrayLiteral();
      }
      if (this.match(TokenType.Identifier)) {
          const callee = this.previous().value;
          if (this.match(TokenType.LParen)) {
              return this.callExpression(callee);
          }
          // For now, treat standalone identifier in expression as string literal for simplicity
          // Proper variable resolution will come later
          return { type: 'StringLiteral', value: callee };
      }
      throw new Error(`Unexpected token in expression: ${this.peek().value}`);
  }

  private arrayLiteral(): ArrayLiteral {
      const elements: Expression[] = [];
      if (!this.check(TokenType.RBracket)) {
          do {
              elements.push(this.expression());
          } while (this.match(TokenType.Comma));
      }
      this.consume(TokenType.RBracket, "Expect ']' after array elements.");
      return { type: 'ArrayLiteral', elements };
  }

  private callExpression(callee: string): CallExpression {
      const args: Expression[] = [];
      if (!this.check(TokenType.RParen)) {
          do {
              args.push(this.expression());
          } while (this.match(TokenType.Comma));
      }
      this.consume(TokenType.RParen, "Expect ')' after arguments.");
      return { type: 'CallExpression', callee, args };
  }

  // Helpers
  private match(...types: TokenType[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private check(type: TokenType): boolean {
    if (this.isAtEnd()) return false;
    return this.peek().type === type;
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.previous();
  }

  private isAtEnd(): boolean {
    return this.peek().type === TokenType.EOF;
  }

  private peek(): Token {
    return this.tokens[this.current];
  }

  private previous(): Token {
    return this.tokens[this.current - 1];
  }

  private consume(type: TokenType, message: string): Token {
    if (this.check(type)) return this.advance();
    throw new Error(message + " found " + this.peek().type);
  }
}
