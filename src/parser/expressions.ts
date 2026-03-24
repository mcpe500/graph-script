import { Token, Expression, Position } from '../ast/types';

export class ExpressionParser {
  constructor(
    private tokens: Token[],
    private pos: number,
    private peek: () => Token,
    private advance: () => Token,
    private check: (type: string, value?: string) => boolean,
    private loc: () => Position
  ) {}

  parseExpression(): Expression {
    return this.parseConditional();
  }

  private parseConditional(): Expression {
    const start = this.loc();
    const test = this.parseOr();

    if (this.check('OPERATOR', '?')) {
      this.advance();
      const consequent = this.parseExpression();
      this.expect('COLON');
      const alternate = this.parseExpression();
      return {
        type: 'ConditionalExpression',
        test,
        consequent,
        alternate,
        location: { start, end: this.loc() },
      };
    }

    return test;
  }

  private parseOr(): Expression {
    let left = this.parseAnd();
    while (this.check('OPERATOR', '||') || this.check('IDENTIFIER', 'or')) {
      const operator = this.advance().value === 'or' ? '||' : '||';
      const right = this.parseAnd();
      left = {
        type: 'BinaryExpression',
        operator,
        left,
        right,
        location: { start: left.location.start, end: this.loc() },
      };
    }
    return left;
  }

  private parseAnd(): Expression {
    let left = this.parseEquality();
    while (this.check('OPERATOR', '&&') || this.check('IDENTIFIER', 'and')) {
      this.advance();
      const right = this.parseEquality();
      left = {
        type: 'BinaryExpression',
        operator: '&&',
        left,
        right,
        location: { start: left.location.start, end: this.loc() },
      };
    }
    return left;
  }

  private parseEquality(): Expression {
    let left = this.parseComparison();
    while (this.check('OPERATOR', '==') || this.check('OPERATOR', '!=')) {
      const operator = this.advance().value;
      const right = this.parseComparison();
      left = {
        type: 'BinaryExpression',
        operator,
        left,
        right,
        location: { start: left.location.start, end: this.loc() },
      };
    }
    return left;
  }

  private parseComparison(): Expression {
    let left = this.parseTerm();
    while (
      this.check('OPERATOR', '<') ||
      this.check('OPERATOR', '>') ||
      this.check('OPERATOR', '<=') ||
      this.check('OPERATOR', '>=')
    ) {
      const operator = this.advance().value;
      const right = this.parseTerm();
      left = {
        type: 'BinaryExpression',
        operator,
        left,
        right,
        location: { start: left.location.start, end: this.loc() },
      };
    }
    return left;
  }

  private parseTerm(): Expression {
    let left = this.parseFactor();
    while (this.check('OPERATOR', '+') || this.check('OPERATOR', '-')) {
      const operator = this.advance().value;
      const right = this.parseFactor();
      left = {
        type: 'BinaryExpression',
        operator,
        left,
        right,
        location: { start: left.location.start, end: this.loc() },
      };
    }
    return left;
  }

  private parseFactor(): Expression {
    let left = this.parseUnary();
    while (this.check('OPERATOR', '*') || this.check('OPERATOR', '/') || this.check('OPERATOR', '%')) {
      const operator = this.advance().value;
      const right = this.parseUnary();
      left = {
        type: 'BinaryExpression',
        operator,
        left,
        right,
        location: { start: left.location.start, end: this.loc() },
      };
    }
    return left;
  }

  private parseUnary(): Expression {
    if (this.check('OPERATOR', '-') || this.check('IDENTIFIER', 'not')) {
      const start = this.loc();
      const operator = this.advance().value;
      const operand = this.parseUnary();
      return {
        type: 'UnaryExpression',
        operator,
        operand,
        location: { start, end: this.loc() },
      };
    }
    return this.parsePower();
  }

  private parsePower(): Expression {
    let left = this.parsePostfix();
    while (this.check('OPERATOR', '^')) {
      this.advance();
      const right = this.parseUnary();
      left = {
        type: 'BinaryExpression',
        operator: '^',
        left,
        right,
        location: { start: left.location.start, end: this.loc() },
      };
    }
    return left;
  }

  private parsePostfix(): Expression {
    let expr = this.parsePrimary();

    while (true) {
      if (this.check('LPAREN')) {
        const start = expr.location.start;
        this.advance();
        const args: Expression[] = [];
        while (!this.check('RPAREN') && !this.check('EOF')) {
          if (args.length > 0) this.expect('COMMA');
          args.push(this.parseExpression());
        }
        this.expect('RPAREN');
        expr = {
          type: 'CallExpression',
          callee: expr,
          args,
          location: { start, end: this.loc() },
        };
        continue;
      }

      if (this.check('LBRACKET')) {
        const start = expr.location.start;
        this.advance();
        const index = this.parseExpression();
        this.expect('RBRACKET');
        expr = {
          type: 'IndexExpression',
          object: expr,
          index,
          location: { start, end: this.loc() },
        };
        continue;
      }

      if (this.check('PERIOD')) {
        const start = expr.location.start;
        this.advance();
        const property = this.expect('IDENTIFIER').value;
        expr = {
          type: 'MemberExpression',
          object: expr,
          property,
          location: { start, end: this.loc() },
        };
        continue;
      }

      break;
    }

    return expr;
  }

  private parsePrimary(): Expression {
    const token = this.peek();
    const start = token.location.start;

    if (this.check('NUMBER')) {
      this.advance();
      return { type: 'Literal', value: Number(token.value), location: { start, end: this.loc() } };
    }

    if (this.check('STRING')) {
      this.advance();
      return { type: 'Literal', value: token.value, location: { start, end: this.loc() } };
    }

    if (this.check('BOOLEAN')) {
      this.advance();
      return { type: 'Literal', value: token.value === 'true', location: { start, end: this.loc() } };
    }

    if (this.check('NULL')) {
      this.advance();
      return { type: 'Literal', value: null, location: { start, end: this.loc() } };
    }

    if (this.check('LPAREN')) {
      this.advance();
      const expr = this.parseExpression();
      this.expect('RPAREN');
      return expr;
    }

    if (this.check('LBRACKET')) {
      this.advance();
      const elements: Expression[] = [];
      while (!this.check('RBRACKET') && !this.check('EOF')) {
        if (elements.length > 0) this.expect('COMMA');
        elements.push(this.parseExpression());
      }
      this.expect('RBRACKET');
      return { type: 'ArrayExpression', elements, location: { start, end: this.loc() } };
    }

    if (this.check('LBRACE')) {
      this.advance();
      const properties: { key: string; value: Expression }[] = [];
      while (!this.check('RBRACE') && !this.check('EOF')) {
        if (properties.length > 0) this.expect('COMMA');
        const keyToken = this.peek();
        if (!this.check('IDENTIFIER') && !this.check('STRING')) {
          throw new Error(`Expected object key, got ${keyToken.type}`);
        }
        this.advance();
        this.expect('COLON');
        const value = this.parseExpression();
        properties.push({ key: keyToken.value, value });
      }
      this.expect('RBRACE');
      return { type: 'ObjectExpression', properties, location: { start, end: this.loc() } };
    }

    if (this.check('IDENTIFIER')) {
      this.advance();
      return { type: 'Identifier', name: token.value, location: { start, end: this.loc() } };
    }

    throw new Error(`Unexpected token ${token.type} (${token.value})`);
  }

  private expect(type: string, value?: string): Token {
    const token = this.peek();
    if (token.type !== type || (value !== undefined && token.value !== value)) {
      throw new Error(`Expected ${value ? `${type} '${value}'` : type}, got ${token.type} (${token.value})`);
    }
    return this.advance();
  }
}
