import { Token, TokenType, AstNode, SourceLocation, Program, Position } from '@graphscript/ast';
import { Tokenizer } from './tokenizer';

export class Parser {
  private tokens: Token[] = [];
  private pos: number = 0;

  parse(source: string): Program {
    const tokenizer = new Tokenizer();
    this.tokens = tokenizer.tokenize(source);
    this.pos = 0;
    return this.parseProgram();
  }

  private parseProgram(): Program {
    const body: AstNode[] = [];
    const start = this.currentLocation();

    while (!this.isEof()) {
      this.skipNewlines();
      if (this.isEof()) break;
      
      const stmt = this.parseTopLevel();
      if (stmt) body.push(stmt);
    }

    return {
      type: 'Program',
      body,
      location: { start, end: this.currentLocation() }
    };
  }

  private parseTopLevel(): AstNode | null {
    const token = this.peek();
    if (token.type !== 'IDENTIFIER') {
      this.error(`Expected identifier, got ${token.type}`);
      return null;
    }

    switch (token.value) {
      case 'use': return this.parseUseStatement();
      case 'import': return this.parseImportStatement();
      case 'const': return this.parseConstDeclaration();
      case 'data': return this.parseDataDeclaration();
      case 'func': return this.parseFuncDeclaration();
      case 'theme': return this.parseThemeDeclaration();
      case 'style': return this.parseStyleDeclaration();
      case 'sub': return this.parseSubDeclaration();
      case 'component': return this.parseComponentDeclaration();
      case 'algo': return this.parseAlgoDeclaration();
      case 'pseudo': return this.parsePseudoDeclaration();
      case 'chart': return this.parseChartDeclaration();
      case 'flow': return this.parseFlowDeclaration();
      case 'diagram': return this.parseDiagramDeclaration();
      case 'table': return this.parseTableDeclaration();
      case 'plot3d': return this.parsePlot3dDeclaration();
      case 'scene3d': return this.parseScene3dDeclaration();
      case 'erd': return this.parseErdDeclaration();
      case 'infra': return this.parseInfraDeclaration();
      case 'page': return this.parsePageDeclaration();
      case 'render': return this.parseRenderDeclaration();
      default:
        this.error(`Unknown top-level declaration: ${token.value}`);
        return null;
    }
  }

  private parseUseStatement() {
    this.advance();
    const start = this.loc();
    const module = this.expect('IDENTIFIER').value;
    this.expect('NEWLINE');
    return { type: 'UseStatement', module, location: { start, end: this.currentLocation() } };
  }

  private parseImportStatement() {
    this.advance();
    const start = this.loc();
    const path = this.expect('STRING').value;
    this.expect('NEWLINE');
    return { type: 'ImportStatement', path, location: { start, end: this.currentLocation() } };
  }

  private parseConstDeclaration() {
    this.advance();
    const start = this.loc();
    const name = this.expect('IDENTIFIER').value;
    this.expect('EQUALS');
    const value = this.parseExpression();
    this.expect('NEWLINE');
    return { type: 'ConstDeclaration', name, value, location: { start, end: this.currentLocation() } };
  }

  private parseDataDeclaration() {
    this.advance();
    const start = this.loc();
    this.expect('COLON');
    this.expect('NEWLINE');
    
    const bindings: { name: string; value: any }[] = [];
    while (true) {
      this.skipNewlines();
      if (this.peek().type !== 'IDENTIFIER') break;
      const name = this.expect('IDENTIFIER').value;
      this.expect('EQUALS');
      const value = this.parseExpression();
      bindings.push({ name, value });
      this.expect('NEWLINE');
    }

    return { type: 'DataDeclaration', bindings, location: { start, end: this.currentLocation() } };
  }

  private parseFuncDeclaration() {
    this.advance();
    const start = this.loc();
    const name = this.expect('IDENTIFIER').value;
    this.expect('LPAREN');
    const params: string[] = [];
    while (!this.check('RPAREN')) {
      if (params.length > 0) this.expect('COMMA');
      params.push(this.expect('IDENTIFIER').value);
    }
    this.expect('RPAREN');
    this.expect('COLON');
    this.expect('NEWLINE');
    this.expect('INDENT');

    const body: any[] = [];
    while (!this.check('DEDENT') && !this.isEof()) {
      this.skipNewlines();
      if (this.check('DEDENT') || this.isEof()) break;
      body.push(this.parseStatement());
    }
    this.expect('DEDENT');

    return { type: 'FuncDeclaration', name, params, body, location: { start, end: this.currentLocation() } };
  }

  private parseStatement(): any {
    this.skipNewlines();
    const token = this.peek();
    
    if (token.type === 'IDENTIFIER') {
      if (this.peekAt(1)?.value === '=') {
        return this.parseAssignment();
      } else if (token.value === 'if') {
        return this.parseIfStatement();
      } else if (token.value === 'while') {
        return this.parseWhileStatement();
      } else if (token.value === 'for') {
        return this.parseForStatement();
      } else if (token.value === 'return') {
        return this.parseReturnStatement();
      } else if (token.value === 'break') {
        this.advance();
        this.expect('NEWLINE');
        return { type: 'BreakStatement', location: this.loc() };
      } else if (token.value === 'continue') {
        this.advance();
        this.expect('NEWLINE');
        return { type: 'ContinueStatement', location: this.loc() };
      } else if (token.value === 'emit') {
        return this.parseEmitStatement();
      }
    }

    const expr = this.parseExpression();
    this.expect('NEWLINE');
    return { type: 'ExpressionStatement', expression: expr, location: this.loc() };
  }

  private parseAssignment() {
    const start = this.loc();
    const target = this.expect('IDENTIFIER').value;
    this.expect('EQUALS');
    const value = this.parseExpression();
    this.expect('NEWLINE');
    return { type: 'AssignmentStatement', target, value, location: { start, end: this.currentLocation() } };
  }

  private parseIfStatement() {
    this.advance();
    const start = this.loc();
    const condition = this.parseExpression();
    this.expect('COLON');
    this.expect('NEWLINE');
    this.expect('INDENT');

    const thenBranch: any[] = [];
    while (!this.check('DEDENT') && !this.isEof()) {
      this.skipNewlines();
      if (this.check('DEDENT') || this.isEof()) break;
      thenBranch.push(this.parseStatement());
    }
    this.expect('DEDENT');

    const elseIfBranches: { condition: any; body: any[] }[] = [];
    let elseBranch: any[] | undefined;

    while (this.peek().value === 'else') {
      this.advance();
      if (this.peek().value === 'if') {
        this.advance();
        const elseIfCond = this.parseExpression();
        this.expect('COLON');
        this.expect('NEWLINE');
        this.expect('INDENT');
        const elseIfBody: any[] = [];
        while (!this.check('DEDENT') && !this.isEof()) {
          this.skipNewlines();
          if (this.check('DEDENT') || this.isEof()) break;
          elseIfBody.push(this.parseStatement());
        }
        this.expect('DEDENT');
        elseIfBranches.push({ condition: elseIfCond, body: elseIfBody });
      } else {
        this.expect('COLON');
        this.expect('NEWLINE');
        this.expect('INDENT');
        elseBranch = [];
        while (!this.check('DEDENT') && !this.isEof()) {
          this.skipNewlines();
          if (this.check('DEDENT') || this.isEof()) break;
          elseBranch.push(this.parseStatement());
        }
        this.expect('DEDENT');
        break;
      }
    }

    return { type: 'IfStatement', condition, thenBranch, elseIfBranches, elseBranch, location: { start, end: this.currentLocation() } };
  }

  private parseWhileStatement() {
    this.advance();
    const start = this.loc();
    const condition = this.parseExpression();
    this.expect('COLON');
    this.expect('NEWLINE');
    this.expect('INDENT');

    const body: any[] = [];
    while (!this.check('DEDENT') && !this.isEof()) {
      this.skipNewlines();
      if (this.check('DEDENT') || this.isEof()) break;
      body.push(this.parseStatement());
    }
    this.expect('DEDENT');

    return { type: 'WhileStatement', condition, body, location: { start, end: this.currentLocation() } };
  }

  private parseForStatement() {
    this.advance();
    const start = this.loc();
    const variable = this.expect('IDENTIFIER').value;
    this.expect('IN');
    const iterable = this.parseExpression();
    this.expect('COLON');
    this.expect('NEWLINE');
    this.expect('INDENT');

    const body: any[] = [];
    while (!this.check('DEDENT') && !this.isEof()) {
      this.skipNewlines();
      if (this.check('DEDENT') || this.isEof()) break;
      body.push(this.parseStatement());
    }
    this.expect('DEDENT');

    return { type: 'ForStatement', variable, iterable, body, location: { start, end: this.currentLocation() } };
  }

  private parseReturnStatement() {
    this.advance();
    const start = this.loc();
    const value = this.peek().type !== 'NEWLINE' ? this.parseExpression() : undefined;
    this.expect('NEWLINE');
    return { type: 'ReturnStatement', value, location: { start, end: this.currentLocation() } };
  }

  private parseEmitStatement() {
    this.advance();
    const start = this.loc();
    this.expect('COLON');
    this.expect('NEWLINE');
    
    const fields: { name: string; value: any }[] = [];
    while (true) {
      this.skipNewlines();
      if (this.peek().type !== 'IDENTIFIER') break;
      const name = this.expect('IDENTIFIER').value;
      this.expect('EQUALS');
      const value = this.parseExpression();
      fields.push({ name, value });
      this.expect('NEWLINE');
    }

    return { type: 'EmitStatement', fields, location: { start, end: this.currentLocation() } };
  }

  private parseExpression(): any {
    return this.parseBinary();
  }

  private parseBinary(): any {
    let left = this.parseUnary();
    
    while (this.peek().type === 'OPERATOR' || this.peek().type === 'IDENTIFIER') {
      const operator = this.peek().value;
      if (!['+', '-', '*', '/', '%', '^', '==', '!=', '<', '>', '<=', '>=', 'and', 'or'].includes(operator)) {
        break;
      }
      this.advance();
      const right = this.parseUnary();
      left = { type: 'BinaryExpression', operator, left, right, location: this.loc() };
    }

    return left;
  }

  private parseUnary(): any {
    if (this.peek().type === 'OPERATOR' && ['-', 'not'].includes(this.peek().value)) {
      const operator = this.peek().value;
      this.advance();
      const operand = this.parseUnary();
      return { type: 'UnaryExpression', operator, operand, location: this.loc() };
    }
    return this.parsePostfix();
  }

  private parsePostfix(): any {
    let expr = this.parsePrimary();

    while (true) {
      if (this.check('LPAREN')) {
        this.advance();
        const args: any[] = [];
        while (!this.check('RPAREN')) {
          if (args.length > 0) this.expect('COMMA');
          args.push(this.parseExpression());
        }
        this.expect('RPAREN');
        expr = { type: 'CallExpression', callee: expr, args, location: this.loc() };
      } else if (this.check('LBRACKET')) {
        this.advance();
        const index = this.parseExpression();
        this.expect('RBRACKET');
        expr = { type: 'MemberExpression', object: expr, property: index, location: this.loc() };
      } else if (this.check('PERIOD')) {
        this.advance();
        const property = this.expect('IDENTIFIER').value;
        expr = { type: 'MemberExpression', object: expr, property, location: this.loc() };
      } else {
        break;
      }
    }

    return expr;
  }

  private parsePrimary(): any {
    const token = this.peek();

    if (token.type === 'NUMBER') {
      this.advance();
      return { type: 'Literal', value: parseFloat(token.value), location: token.location };
    }

    if (token.type === 'STRING') {
      this.advance();
      return { type: 'Literal', value: token.value, location: token.location };
    }

    if (token.type === 'BOOLEAN') {
      this.advance();
      return { type: 'Literal', value: token.value === 'true', location: token.location };
    }

    if (token.type === 'NULL') {
      this.advance();
      return { type: 'Literal', value: null, location: token.location };
    }

    if (token.type === 'IDENTIFIER') {
      this.advance();
      return { type: 'Identifier', name: token.value, location: token.location };
    }

    if (token.type === 'LPAREN') {
      this.advance();
      const expr = this.parseExpression();
      this.expect('RPAREN');
      return expr;
    }

    if (token.type === 'LBRACKET') {
      this.advance();
      const elements: any[] = [];
      while (!this.check('RBRACKET')) {
        if (elements.length > 0) this.expect('COMMA');
        elements.push(this.parseExpression());
      }
      this.expect('RBRACKET');
      return { type: 'ArrayExpression', elements, location: this.loc() };
    }

    if (token.type === 'LBRACE') {
      this.advance();
      const properties: { key: string; value: any }[] = [];
      while (!this.check('RBRACE')) {
        if (properties.length > 0) this.expect('COMMA');
        const key = this.expect('IDENTIFIER').value;
        this.expect('COLON');
        const value = this.parseExpression();
        properties.push({ key, value });
      }
      this.expect('RBRACE');
      return { type: 'ObjectExpression', properties, location: this.loc() };
    }

    this.error(`Unexpected token: ${token.type}`);
    return { type: 'Literal', value: null, location: this.loc() };
  }

  private parseThemeDeclaration() {
    this.advance();
    const start = this.loc();
    const name = this.expect('IDENTIFIER').value;
    this.expect('COLON');
    this.expect('NEWLINE');
    const properties = this.parseBlockProperties();
    return { type: 'ThemeDeclaration', name, properties, location: { start, end: this.currentLocation() } };
  }

  private parseStyleDeclaration() {
    this.advance();
    const start = this.loc();
    const name = this.expect('IDENTIFIER').value;
    this.expect('COLON');
    this.expect('NEWLINE');
    const properties = this.parseBlockProperties();
    return { type: 'StyleDeclaration', name, properties, location: { start, end: this.currentLocation() } };
  }

  private parseBlockProperties(): Record<string, any> {
    const props: Record<string, any> = {};
    this.expect('INDENT');
    while (!this.check('DEDENT') && !this.isEof()) {
      this.skipNewlines();
      if (this.check('DEDENT') || this.isEof()) break;
      const key = this.expect('IDENTIFIER').value;
      this.expect('EQUALS');
      props[key] = this.parseExpression();
      this.expect('NEWLINE');
    }
    if (this.check('DEDENT')) this.advance();
    return props;
  }

  private parseSubDeclaration() {
    this.advance();
    const start = this.loc();
    const name = this.expect('IDENTIFIER').value;
    this.expect('LPAREN');
    const params: string[] = [];
    while (!this.check('RPAREN')) {
      if (params.length > 0) this.expect('COMMA');
      params.push(this.expect('IDENTIFIER').value);
    }
    this.expect('RPAREN');
    this.expect('COLON');
    this.expect('NEWLINE');
    this.expect('INDENT');

    const body: AstNode[] = [];
    const exports: { name: string; value: string }[] = [];
    while (!this.check('DEDENT') && !this.isEof()) {
      this.skipNewlines();
      if (this.check('DEDENT') || this.isEof()) break;
      const stmt = this.parseTopLevel();
      if (stmt) body.push(stmt);
      if (stmt.type === 'ExportStatement') {
        exports.push({ name: (stmt as any).name, value: (stmt as any).value });
      }
    }
    this.expect('DEDENT');

    return { type: 'SubDeclaration', name, params, body, exports, location: { start, end: this.currentLocation() } };
  }

  private parseComponentDeclaration() {
    this.advance();
    const start = this.loc();
    const name = this.expect('IDENTIFIER').value;
    this.expect('EQUALS');
    const module = this.expect('IDENTIFIER').value;
    this.expect('LPAREN');
    const args: Record<string, any> = {};
    while (!this.check('RPAREN')) {
      if (Object.keys(args).length > 0) this.expect('COMMA');
      const key = this.expect('IDENTIFIER').value;
      this.expect('EQUALS');
      args[key] = this.parseExpression();
    }
    this.expect('RPAREN');
    this.expect('NEWLINE');
    return { type: 'ComponentDeclaration', name, module, args, location: { start, end: this.currentLocation() } };
  }

  private parseAlgoDeclaration() {
    this.advance();
    const start = this.loc();
    const name = this.expect('IDENTIFIER').value;
    this.expect('LPAREN');
    const params: string[] = [];
    while (!this.check('RPAREN')) {
      if (params.length > 0) this.expect('COMMA');
      params.push(this.expect('IDENTIFIER').value);
    }
    this.expect('RPAREN');
    this.expect('COLON');
    this.expect('NEWLINE');
    this.expect('INDENT');

    const body: any[] = [];
    while (!this.check('DEDENT') && !this.isEof()) {
      this.skipNewlines();
      if (this.check('DEDENT') || this.isEof()) break;
      body.push(this.parseStatement());
    }
    this.expect('DEDENT');

    return { type: 'AlgoDeclaration', name, params, body, location: { start, end: this.currentLocation() } };
  }

  private parsePseudoDeclaration() {
    this.advance();
    const start = this.loc();
    const nameToken = this.peek();
    const name = nameToken.type === 'STRING' ? nameToken.value : this.expect('IDENTIFIER').value;
    if (nameToken.type === 'STRING') this.advance();

    const lines: string[] = [];
    if (this.check('FROM')) {
      this.advance();
      lines.push(this.expect('IDENTIFIER').value);
    } else if (this.check('COLON')) {
      this.advance();
      this.expect('NEWLINE');
      this.expect('INDENT');
      while (!this.check('DEDENT') && !this.isEof()) {
        this.skipNewlines();
        if (this.check('DEDENT') || this.isEof()) break;
        const lineToken = this.peek();
        if (lineToken.type === 'STRING') {
          lines.push(lineToken.value);
          this.advance();
        } else {
          lines.push(this.expect('IDENTIFIER').value);
        }
        this.expect('NEWLINE');
      }
      if (this.check('DEDENT')) this.advance();
    } else {
      this.expect('NEWLINE');
    }

    return { type: 'PseudoDeclaration', name, source: lines[0], lines: lines.slice(1), location: { start, end: this.currentLocation() } };
  }

  private parseChartDeclaration() {
    this.advance();
    const start = this.loc();
    const nameToken = this.peek();
    const name = nameToken.type === 'STRING' ? nameToken.value : this.expect('IDENTIFIER').value;
    if (nameToken.type === 'STRING') this.advance();
    this.expect('COLON');
    this.expect('NEWLINE');
    const properties = this.parseBlockProperties();
    return { type: 'ChartDeclaration', name, properties, location: { start, end: this.currentLocation() } };
  }

  private parseFlowDeclaration() {
    this.advance();
    const start = this.loc();
    const nameToken = this.peek();
    const name = nameToken.type === 'STRING' ? nameToken.value : this.expect('IDENTIFIER').value;
    if (nameToken.type === 'STRING') this.advance();
    this.expect('COLON');
    this.expect('NEWLINE');
    this.expect('INDENT');

    const nodes: any[] = [];
    const edges: any[] = [];

    while (!this.check('DEDENT') && !this.isEof()) {
      this.skipNewlines();
      if (this.check('DEDENT') || this.isEof()) break;
      
      const token = this.peek();
      if (token.value === 'node') {
        this.advance();
        const id = this.expect('IDENTIFIER').value;
        if (this.check('TYPE')) {
          this.advance();
          const nodeType = this.expect('IDENTIFIER').value;
          let label = '';
          if (this.check('LABEL')) {
            this.advance();
            label = this.peek().type === 'STRING' ? this.peek().value : this.expect('IDENTIFIER').value;
            if (this.peek().type === 'STRING') this.advance();
          }
          nodes.push({ type: 'FlowNode', id, nodeType, label });
        }
        this.expect('NEWLINE');
      } else if (token.value === 'embed') {
        this.advance();
        const target = this.expect('IDENTIFIER').value;
        this.expect('EQUALS');
        const source = this.parseExpression();
        this.expect('NEWLINE');
      } else if (token.type === 'IDENTIFIER') {
        const from = this.expect('IDENTIFIER').value;
        if (this.check('ARROW')) {
          this.expect('ARROW');
          const to = this.expect('IDENTIFIER').value;
          let label = '';
          if (this.check('IDENTIFIER')) {
            label = this.expect('IDENTIFIER').value;
          }
          edges.push({ type: 'FlowEdge', from, to, label });
        } else {
          this.expect('EQUALS');
          const value = this.parseExpression();
        }
        this.expect('NEWLINE');
      } else {
        this.advance();
        this.expect('NEWLINE');
      }
    }

    if (this.check('DEDENT')) this.advance();

    return { type: 'FlowDeclaration', name, properties: {}, nodes, edges, location: { start, end: this.currentLocation() } };
  }

  private parseDiagramDeclaration() {
    this.advance();
    const start = this.loc();
    const nameToken = this.peek();
    const name = nameToken.type === 'STRING' ? nameToken.value : this.expect('IDENTIFIER').value;
    if (nameToken.type === 'STRING') this.advance();
    this.expect('COLON');
    this.expect('NEWLINE');
    const elements = this.parseDiagramElements();
    return { type: 'DiagramDeclaration', name, elements, location: { start, end: this.currentLocation() } };
  }

  private parseDiagramElements(): any[] {
    const elements: any[] = [];
    this.expect('INDENT');
    while (!this.check('DEDENT') && !this.isEof()) {
      this.skipNewlines();
      if (this.check('DEDENT') || this.isEof()) break;
      const type = this.expect('IDENTIFIER').value;
      const name = this.expect('IDENTIFIER').value;
      const props: Record<string, any> = {};
      while (!this.check('NEWLINE') && !this.isEof()) {
        const key = this.peek();
        if (key.type === 'IDENTIFIER') {
          this.advance();
          if (this.check('EQUALS')) {
            this.advance();
            props[key.value] = this.parseExpression();
          } else {
            props[key.value] = true;
          }
        } else {
          break;
        }
      }
      this.expect('NEWLINE');
      elements.push({ type, name, properties: props });
    }
    if (this.check('DEDENT')) this.advance();
    return elements;
  }

  private parseTableDeclaration() {
    this.advance();
    const start = this.loc();
    const nameToken = this.peek();
    const name = nameToken.type === 'STRING' ? nameToken.value : this.expect('IDENTIFIER').value;
    if (nameToken.type === 'STRING') this.advance();
    this.expect('COLON');
    this.expect('NEWLINE');
    const props = this.parseBlockProperties();
    return { type: 'TableDeclaration', name, ...props, location: { start, end: this.currentLocation() } };
  }

  private parsePlot3dDeclaration() {
    this.advance();
    const start = this.loc();
    const nameToken = this.peek();
    const name = nameToken.type === 'STRING' ? nameToken.value : this.expect('IDENTIFIER').value;
    if (nameToken.type === 'STRING') this.advance();
    this.expect('COLON');
    this.expect('NEWLINE');
    const properties = this.parseBlockProperties();
    return { type: 'Plot3dDeclaration', name, properties, location: { start, end: this.currentLocation() } };
  }

  private parseScene3dDeclaration() {
    this.advance();
    const start = this.loc();
    const nameToken = this.peek();
    const name = nameToken.type === 'STRING' ? nameToken.value : this.expect('IDENTIFIER').value;
    if (nameToken.type === 'STRING') this.advance();
    this.expect('COLON');
    this.expect('NEWLINE');
    this.expect('INDENT');
    const elements: any[] = [];
    while (!this.check('DEDENT') && !this.isEof()) {
      this.skipNewlines();
      if (this.check('DEDENT') || this.isEof()) break;
      const type = this.expect('IDENTIFIER').value;
      const name = this.expect('IDENTIFIER').value;
      this.expect('NEWLINE');
      elements.push({ type, name, properties: {} });
    }
    if (this.check('DEDENT')) this.advance();
    return { type: 'Scene3dDeclaration', name, elements, location: { start, end: this.currentLocation() } };
  }

  private parseErdDeclaration() {
    this.advance();
    const start = this.loc();
    const nameToken = this.peek();
    const name = nameToken.type === 'STRING' ? nameToken.value : this.expect('IDENTIFIER').value;
    if (nameToken.type === 'STRING') this.advance();
    this.expect('COLON');
    this.expect('NEWLINE');
    return { type: 'ErdDeclaration', name, tables: [], relationships: [], location: { start, end: this.currentLocation() } };
  }

  private parseInfraDeclaration() {
    this.advance();
    const start = this.loc();
    const provider = this.expect('IDENTIFIER').value;
    const nameToken = this.peek();
    const name = nameToken.type === 'STRING' ? nameToken.value : this.expect('IDENTIFIER').value;
    if (nameToken.type === 'STRING') this.advance();
    this.expect('COLON');
    this.expect('NEWLINE');
    return { type: 'InfraDeclaration', provider, name, elements: [], location: { start, end: this.currentLocation() } };
  }

  private parsePageDeclaration() {
    this.advance();
    const start = this.loc();
    const nameToken = this.peek();
    const name = nameToken.type === 'STRING' ? nameToken.value : this.expect('IDENTIFIER').value;
    if (nameToken.type === 'STRING') this.advance();
    this.expect('COLON');
    this.expect('NEWLINE');
    const props = this.parseBlockProperties();
    return { type: 'PageDeclaration', name, placements: [], location: { start, end: this.currentLocation() } };
  }

  private parseRenderDeclaration() {
    this.advance();
    const start = this.loc();
    this.expect('COLON');
    this.expect('NEWLINE');
    return { type: 'RenderDeclaration', targets: [], location: { start, end: this.currentLocation() } };
  }

  private peek(): Token {
    return this.tokens[this.pos] || { type: 'EOF', value: '', location: { start: { line: 0, column: 0, offset: 0 }, end: { line: 0, column: 0, offset: 0 } } };
  }

  private peekAt(offset: number): Token | undefined {
    return this.tokens[this.pos + offset];
  }

  private advance(): Token {
    return this.tokens[this.pos++];
  }

  private check(type: TokenType | string): boolean {
    return this.peek().type === type || this.peek().value === type;
  }

  private expect(type: TokenType | string): Token {
    const token = this.peek();
    if (token.type === type || token.value === type) {
      return this.advance();
    }
    this.error(`Expected ${type}, got ${token.type} (${token.value})`);
    return token;
  }

  private isEof(): boolean {
    return this.pos >= this.tokens.length || this.peek().type === 'EOF';
  }

  private skipNewlines(): void {
    while (this.check('NEWLINE')) {
      this.advance();
    }
  }

  private loc(): SourceLocation {
    return this.peek().location;
  }

  private currentLocation(): SourceLocation {
    return this.peek().location.end;
  }

  private error(message: string): void {
    console.error(`Parse error at ${this.peek().location.start.line}:${this.peek().location.start.column}: ${message}`);
  }
}
