import { Expression, Statement, Program, AstNode } from '@graphscript/ast';
import { GSValue, GSFunction, GSAlgorithm, Trace, isTruthy, equals, compare } from './values';

export interface RuntimeScope {
  parent?: RuntimeScope;
  values: Record<string, GSValue>;
}

export class Evaluator {
  private scope: RuntimeScope;
  private modules: Record<string, any> = {};
  private algorithms: Record<string, GSAlgorithm> = {};
  private traces: Record<string, Trace> = {};

  constructor() {
    this.scope = this.createScope();
    this.initBuiltins();
  }

  private createScope(parent?: RuntimeScope): RuntimeScope {
    return { parent, values: {} };
  }

  private initBuiltins(): void {
    this.scope.values = {
      ...Math,
      range: (start: number, end: number, step: number = 1): number[] => {
        const result: number[] = [];
        for (let i = start; i < end; i += step) result.push(i);
        return result;
      },
      linspace: (start: number, end: number, count: number): number[] => {
        const step = (end - start) / (count - 1);
        return Array.from({ length: count }, (_, i) => start + i * step);
      },
      sin: Math.sin,
      cos: Math.cos,
      tan: Math.tan,
      exp: Math.exp,
      log: Math.log,
      sqrt: Math.sqrt,
      abs: Math.abs,
      min: Math.min,
      max: Math.max,
      floor: Math.floor,
      ceil: Math.ceil,
      round: Math.round,
      pow: Math.pow,
      sigmoid: (x: number) => 1 / (1 + Math.exp(-x)),
      tanh: Math.tanh,
      len: (arr: GSValue): number => {
        if (Array.isArray(arr)) return arr.length;
        if (typeof arr === 'string') return arr.length;
        if (typeof arr === 'object' && arr !== null) return Object.keys(arr).length;
        return 0;
      },
      map: (arr: GSValue[], fn: (v: GSValue) => GSValue): GSValue[] => arr.map(fn),
      filter: (arr: GSValue[], fn: (v: GSValue) => boolean): GSValue[] => arr.filter(fn),
      zip: (...arrs: GSValue[][]): GSValue[] => {
        const len = Math.min(...arrs.map(a => a.length));
        return Array.from({ length: len }, (_, i) => arrs.map(a => a[i]));
      },
      true: true,
      false: false,
      null: null,
    };
  }

  execute(program: Program): Record<string, GSValue> {
    for (const node of program.body) {
      this.executeTopLevel(node);
    }
    return this.scope.values;
  }

  private executeTopLevel(node: AstNode): void {
    switch (node.type) {
      case 'UseStatement':
        break;
      case 'ImportStatement':
        break;
      case 'ConstDeclaration':
        this.scope.values[node.name] = this.evalExpression(node.value);
        break;
      case 'DataDeclaration':
        for (const binding of node.bindings) {
          this.scope.values[binding.name] = this.evalExpression(binding.value);
        }
        break;
      case 'FuncDeclaration':
        this.scope.values[node.name] = this.createFunction(node.params, node.body);
        break;
      case 'ThemeDeclaration':
      case 'StyleDeclaration':
        break;
      case 'SubDeclaration':
        this.scope.values[node.name] = this.createFunction(node.params, node.body);
        break;
      case 'ComponentDeclaration':
        break;
      case 'AlgoDeclaration':
        const algo: GSAlgorithm = {
          type: 'algorithm',
          name: node.name,
          params: node.params,
          body: node.body,
          trace: { type: 'trace', columns: [], rows: [] }
        };
        this.algorithms[node.name] = algo;
        this.traces[node.name] = algo.trace;
        this.scope.values[node.name] = algo;
        break;
      case 'PseudoDeclaration':
        break;
      case 'ChartDeclaration':
      case 'FlowDeclaration':
      case 'DiagramDeclaration':
      case 'TableDeclaration':
      case 'Plot3dDeclaration':
      case 'Scene3dDeclaration':
      case 'ErdDeclaration':
      case 'InfraDeclaration':
      case 'PageDeclaration':
      case 'RenderDeclaration':
        this.scope.values[node.name] = node;
        break;
    }
  }

  private createFunction(params: string[], body: any[]): GSFunction {
    return { type: 'function', params, body, closure: { ...this.scope.values } };
  }

  private evalExpression(expr: Expression): GSValue {
    switch (expr.type) {
      case 'Literal':
        return expr.value;
      case 'Identifier':
        const val = this.lookup(expr.name);
        if (val === undefined) throw new Error(`Undefined: ${expr.name}`);
        return val;
      case 'BinaryExpression':
        return this.evalBinary(expr);
      case 'UnaryExpression':
        return this.evalUnary(expr);
      case 'CallExpression':
        return this.evalCall(expr);
      case 'MemberExpression':
        return this.evalMember(expr);
      case 'ArrayExpression':
        return expr.elements.map(e => this.evalExpression(e));
      case 'ObjectExpression':
        const obj: Record<string, GSValue> = {};
        for (const prop of expr.properties) {
          obj[prop.key] = this.evalExpression(prop.value);
        }
        return obj;
      default:
        return null;
    }
  }

  private evalBinary(expr: any): GSValue {
    const left = this.evalExpression(expr.left);
    const right = this.evalExpression(expr.right);
    const op = expr.operator;

    switch (op) {
      case '+': return (left as number) + (right as number);
      case '-': return (left as number) - (right as number);
      case '*': return (left as number) * (right as number);
      case '/': return (left as number) / (right as number);
      case '%': return (left as number) % (right as number);
      case '^': return Math.pow(left as number, right as number);
      case '==': return equals(left, right);
      case '!=': return !equals(left, right);
      case '<': return compare(left, right, '<');
      case '>': return compare(left, right, '>');
      case '<=': return compare(left, right, '<=');
      case '>=': return compare(left, right, '>=');
      case 'and': return isTruthy(left) && isTruthy(right);
      case 'or': return isTruthy(left) || isTruthy(right);
      default: return null;
    }
  }

  private evalUnary(expr: any): GSValue {
    const operand = this.evalExpression(expr.operand);
    switch (expr.operator) {
      case '-': return -(operand as number);
      case 'not': return !isTruthy(operand);
      default: return null;
    }
  }

  private evalCall(expr: any): GSValue {
    const fn = this.evalExpression(expr.callee);
    const args = expr.args.map((a: Expression) => this.evalExpression(a));

    if (fn && typeof fn === 'object' && fn.type === 'function') {
      const newScope = this.createScope();
      newScope.values = { ...fn.closure };
      for (let i = 0; i < fn.params.length; i++) {
        newScope.values[fn.params[i]] = args[i];
      }
      const oldScope = this.scope;
      this.scope = newScope;
      let result: GSValue = null;
      for (const stmt of fn.body) {
        result = this.evalStatement(stmt);
        if (stmt.type === 'ReturnStatement') break;
      }
      this.scope = oldScope;
      return result;
    }

    if (typeof fn === 'function') {
      return fn(...args);
    }

    throw new Error(`Cannot call ${typeof fn}`);
  }

  private evalMember(expr: any): GSValue {
    const obj = this.evalExpression(expr.object);
    if (typeof obj === 'object' && obj !== null) {
      if (expr.property in obj) return obj[expr.property];
      if (Array.isArray(obj) && typeof expr.property === 'number') return obj[expr.property];
    }
    return null;
  }

  private evalStatement(stmt: Statement): GSValue {
    switch (stmt.type) {
      case 'ExpressionStatement':
        return this.evalExpression(stmt.expression);
      case 'AssignmentStatement':
        this.scope.values[stmt.target] = this.evalExpression(stmt.value);
        return null;
      case 'IfStatement':
        if (isTruthy(this.evalExpression(stmt.condition))) {
          for (const s of stmt.thenBranch) {
            const r = this.evalStatement(s);
            if (r !== null && (s.type === 'ReturnStatement' || s.type === 'BreakStatement' || s.type === 'ContinueStatement')) return r;
          }
        } else if (stmt.elseIfBranches) {
          for (const eb of stmt.elseIfBranches) {
            if (isTruthy(this.evalExpression(eb.condition))) {
              for (const s of eb.body) {
                const r = this.evalStatement(s);
                if (r !== null && (s.type === 'ReturnStatement' || s.type === 'BreakStatement' || s.type === 'ContinueStatement')) return r;
              }
              break;
            }
          }
        } else if (stmt.elseBranch) {
          for (const s of stmt.elseBranch) {
            const r = this.evalStatement(s);
            if (r !== null && (s.type === 'ReturnStatement' || s.type === 'BreakStatement' || s.type === 'ContinueStatement')) return r;
          }
        }
        return null;
      case 'WhileStatement':
        while (isTruthy(this.evalExpression(stmt.condition))) {
          for (const s of stmt.body) {
            const r = this.evalStatement(s);
            if (s.type === 'BreakStatement') return null;
            if (s.type === 'ContinueStatement') break;
            if (r !== null && s.type === 'ReturnStatement') return r;
          }
        }
        return null;
      case 'ForStatement':
        const iter = this.evalExpression(stmt.iterable);
        if (Array.isArray(iter)) {
          for (const item of iter) {
            this.scope.values[stmt.variable] = item;
            for (const s of stmt.body) {
              const r = this.evalStatement(s);
              if (s.type === 'BreakStatement') return null;
              if (s.type === 'ContinueStatement') break;
              if (r !== null && s.type === 'ReturnStatement') return r;
            }
          }
        }
        return null;
      case 'ReturnStatement':
        return stmt.value ? this.evalExpression(stmt.value) : null;
      case 'BreakStatement':
        return { type: 'break' };
      case 'ContinueStatement':
        return { type: 'continue' };
      case 'EmitStatement':
        const algo = this.findCurrentAlgorithm();
        if (algo) {
          const row: Record<string, GSValue> = {};
          for (const field of stmt.fields) {
            row[field.name] = this.evalExpression(field.value);
          }
          if (algo.trace.columns.length === 0) {
            algo.trace.columns = stmt.fields.map(f => f.name);
          }
          algo.trace.rows.push(row);
        }
        return null;
      default:
        return null;
    }
  }

  private lookup(name: string): GSValue {
    let scope: RuntimeScope | undefined = this.scope;
    while (scope) {
      if (name in scope.values) return scope.values[name];
      scope = scope.parent;
    }
    return undefined;
  }

  private findCurrentAlgorithm(): GSAlgorithm | null {
    for (const algo of Object.values(this.algorithms)) {
      return algo;
    }
    return null;
  }

  getTrace(name: string): Trace | undefined {
    return this.traces[name];
  }

  runAlgorithm(name: string, args: GSValue[]): GSValue {
    const algo = this.algorithms[name];
    if (!algo) throw new Error(`Unknown algorithm: ${name}`);
    
    const newScope = this.createScope();
    for (let i = 0; i < algo.params.length; i++) {
      newScope.values[algo.params[i]] = args[i];
    }
    
    const oldScope = this.scope;
    this.scope = newScope;
    
    for (const stmt of algo.body) {
      const result = this.evalStatement(stmt);
      if (stmt.type === 'ReturnStatement') {
        this.scope = oldScope;
        return result;
      }
    }
    
    this.scope = oldScope;
    return null;
  }
}
