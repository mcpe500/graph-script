import {
  Expression,
  Program,
  Statement,
  TopLevelNode,
  AlgoDeclaration,
} from '../ast/types';
import { createBuiltins, createGSFunction } from './builtins';
import { ScopeManager } from './scope';
import { compare, GSAlgorithm, GSFunction, GSValue, isEqual, isTruthy, Trace } from './values';

interface ReturnSignal {
  kind: 'return';
  value: GSValue;
}

interface LoopSignal {
  kind: 'break' | 'continue';
}

type ControlSignal = ReturnSignal | LoopSignal;

function isControlSignal(value: unknown): value is ControlSignal {
  return !!value && typeof value === 'object' && 'kind' in (value as Record<string, unknown>);
}

export class Evaluator {
  private scope = new ScopeManager();
  private algorithms = new Map<string, GSAlgorithm>();
  private traces = new Map<string, Trace>();
  private currentAlgo: GSAlgorithm | null = null;

  constructor() {
    for (const [name, value] of Object.entries(createBuiltins())) {
      this.scope.define(name, value);
    }
  }

  execute(program: Program): Record<string, GSValue> {
    for (const node of program.body) {
      this.executeTopLevel(node);
    }
    return this.scope.getAllValues();
  }

  getTraces(): Map<string, Trace> {
    return this.traces;
  }

  getTrace(name: string): Trace | undefined {
    return this.traces.get(name);
  }

  getAlgorithm(name: string): GSAlgorithm | undefined {
    return this.algorithms.get(name);
  }

  private executeTopLevel(node: TopLevelNode): void {
    switch (node.type) {
      case 'UseStatement':
      case 'ImportStatement':
      case 'RenderDeclaration':
        return;
      case 'ConstDeclaration':
        this.scope.define(node.name, this.evalExpression(node.value));
        return;
      case 'DataDeclaration':
        for (const binding of node.bindings) {
          this.scope.define(binding.name, this.evalExpression(binding.value));
        }
        return;
      case 'FuncDeclaration':
        this.scope.define(node.name, createGSFunction(node.params, node.body, this.scope.getAllValues()));
        return;
      case 'AlgoDeclaration': {
        const algo: GSAlgorithm = {
          type: 'algorithm',
          name: node.name,
          params: node.params,
          body: node.body,
          trace: { type: 'trace', columns: [], rows: [] },
        };
        this.algorithms.set(node.name, algo);
        this.traces.set(node.name, algo.trace);
        this.scope.define(node.name, algo);
        return;
      }
      case 'ThemeDeclaration':
      case 'StyleDeclaration':
      case 'PseudoDeclaration':
      case 'ChartDeclaration':
      case 'FlowDeclaration':
      case 'DiagramDeclaration':
      case 'TableDeclaration':
      case 'Plot3dDeclaration':
      case 'Scene3dDeclaration':
      case 'ErdDeclaration':
      case 'InfraDeclaration':
      case 'PageDeclaration':
        this.scope.define((node as any).name, { ...node });
        return;
      case 'SubDeclaration':
        this.scope.define(node.name, createGSFunction(node.params, [], this.scope.getAllValues()));
        return;
      case 'ComponentDeclaration': {
        const moduleValue = this.scope.get(node.module);
        if (moduleValue && typeof moduleValue === 'object' && (moduleValue as GSFunction).type === 'function') {
          const args = Object.keys(node.args).map((key) => this.evalExpression(node.args[key]));
          this.scope.define(node.name, this.runFunction(moduleValue as GSFunction, args));
        }
        return;
      }
    }
  }

  private evalExpression(expr: Expression): GSValue {
    switch (expr.type) {
      case 'Literal':
        return expr.value;
      case 'Identifier':
        return this.scope.get(expr.name) ?? null;
      case 'ArrayExpression':
        return expr.elements.map((element) => this.evalExpression(element));
      case 'ObjectExpression': {
        const result: Record<string, GSValue> = {};
        for (const prop of expr.properties) result[prop.key] = this.evalExpression(prop.value);
        return result;
      }
      case 'BinaryExpression':
        return this.evalBinary(expr.operator, expr.left, expr.right);
      case 'UnaryExpression': {
        const value = this.evalExpression(expr.operand);
        return expr.operator === '-' ? -(value as number) : !isTruthy(value);
      }
      case 'CallExpression': {
        const callee = typeof expr.callee === 'string'
          ? expr.callee
          : expr.callee.type === 'Identifier'
            ? expr.callee.name
            : null;
        if (!callee) return null;
        const fn = this.scope.get(callee);
        const args = expr.args.map((arg) => this.evalExpression(arg));
        if (typeof fn === 'function') return fn(...args);
        if (fn && typeof fn === 'object' && (fn as GSFunction).type === 'function') return this.runFunction(fn as GSFunction, args);
        if (fn && typeof fn === 'object' && (fn as GSAlgorithm).type === 'algorithm') return this.runAlgorithm(fn as GSAlgorithm, args);
        return null;
      }
      case 'MemberExpression': {
        const object = this.evalExpression(expr.object);
        if (object && typeof object === 'object') return (object as Record<string, GSValue>)[expr.property] ?? null;
        return null;
      }
      case 'IndexExpression': {
        const object = this.evalExpression(expr.object);
        const index = this.evalExpression(expr.index);
        if (Array.isArray(object)) return object[index as number] ?? null;
        if (object && typeof object === 'object') return (object as Record<string, GSValue>)[String(index)] ?? null;
        if (typeof object === 'string') return object[index as number] ?? null;
        return null;
      }
      case 'ConditionalExpression':
        return isTruthy(this.evalExpression(expr.test))
          ? this.evalExpression(expr.consequent)
          : this.evalExpression(expr.alternate);
    }
  }

  private evalBinary(operator: string, leftExpr: Expression, rightExpr: Expression): GSValue {
    const left = this.evalExpression(leftExpr);
    const right = this.evalExpression(rightExpr);
    switch (operator) {
      case '+':
        if (typeof left === 'string' || typeof right === 'string') return String(left ?? '') + String(right ?? '');
        return Number(left ?? 0) + Number(right ?? 0);
      case '-': return Number(left ?? 0) - Number(right ?? 0);
      case '*': return Number(left ?? 0) * Number(right ?? 0);
      case '/': return Number(left ?? 0) / Number(right ?? 0);
      case '%': return Number(left ?? 0) % Number(right ?? 0);
      case '^': return Math.pow(left as number, right as number);
      case '==': return isEqual(left, right);
      case '!=': return !isEqual(left, right);
      case '<': return compare(left, right, '<');
      case '>': return compare(left, right, '>');
      case '<=': return compare(left, right, '<=');
      case '>=': return compare(left, right, '>=');
      case '&&': return isTruthy(left) && isTruthy(right);
      case '||': return isTruthy(left) || isTruthy(right);
      default: return null;
    }
  }

  private runFunction(fn: GSFunction, args: GSValue[]): GSValue {
    const scope = this.scope.createScope(this.scope.getCurrentScope());
    fn.params.forEach((param, index) => {
      scope.values[param] = args[index];
    });
    for (const [key, value] of Object.entries(fn.closure)) {
      if (!(key in scope.values)) scope.values[key] = value;
    }
    this.scope.pushScope(scope);
    const signal = this.evalStatements(fn.body);
    this.scope.popScope();
    return signal && signal.kind === 'return' ? signal.value : null;
  }

  private runAlgorithm(algo: GSAlgorithm, args: GSValue[]): GSValue {
    algo.trace.columns = [];
    algo.trace.rows = [];

    const scope = this.scope.createScope(this.scope.getCurrentScope());
    algo.params.forEach((param, index) => {
      scope.values[param] = args[index];
    });
    this.scope.pushScope(scope);
    const previousAlgo = this.currentAlgo;
    this.currentAlgo = algo;
    const signal = this.evalStatements(algo.body);
    this.currentAlgo = previousAlgo;
    this.scope.popScope();
    return signal && signal.kind === 'return' ? signal.value : null;
  }

  private evalStatements(statements: Statement[]): ControlSignal | null {
    for (const statement of statements) {
      const result = this.evalStatement(statement);
      if (isControlSignal(result)) return result;
    }
    return null;
  }

  private evalStatement(statement: Statement): ControlSignal | null {
    switch (statement.type) {
      case 'ExpressionStatement':
        this.evalExpression(statement.expression);
        return null;
      case 'AssignmentStatement':
        this.scope.set(statement.target, this.evalExpression(statement.value));
        return null;
      case 'ReturnStatement':
        return { kind: 'return', value: statement.value ? this.evalExpression(statement.value) : null };
      case 'BreakStatement':
        return { kind: 'break' };
      case 'ContinueStatement':
        return { kind: 'continue' };
      case 'EmitStatement':
        this.emitTraceRow(statement.fields.map((field) => ({ name: field.name, value: this.evalExpression(field.value) })));
        return null;
      case 'IfStatement': {
        if (isTruthy(this.evalExpression(statement.condition))) return this.evalStatements(statement.thenBranch);
        for (const branch of statement.elseIfBranches ?? []) {
          if (isTruthy(this.evalExpression(branch.condition))) return this.evalStatements(branch.body);
        }
        if (statement.elseBranch) return this.evalStatements(statement.elseBranch);
        return null;
      }
      case 'WhileStatement': {
        while (isTruthy(this.evalExpression(statement.condition))) {
          const result = this.evalStatements(statement.body);
          if (!result) continue;
          if (result.kind === 'continue') continue;
          if (result.kind === 'break') break;
          return result;
        }
        return null;
      }
      case 'ForStatement': {
        const iterable = this.evalExpression(statement.iterable);
        if (!Array.isArray(iterable)) return null;
        for (const item of iterable) {
          this.scope.set(statement.variable, item);
          const result = this.evalStatements(statement.body);
          if (!result) continue;
          if (result.kind === 'continue') continue;
          if (result.kind === 'break') break;
          return result;
        }
        return null;
      }
    }
  }

  private emitTraceRow(fields: { name: string; value: GSValue }[]): void {
    if (!this.currentAlgo) return;
    const row: Record<string, GSValue> = {};
    for (const field of fields) row[field.name] = field.value;
    if (this.currentAlgo.trace.columns.length === 0) {
      this.currentAlgo.trace.columns = fields.map((field) => field.name);
    }
    this.currentAlgo.trace.rows.push(row);
  }
}
