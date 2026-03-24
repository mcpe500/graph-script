import { RuntimeScope, GSValue } from './values';

export class ScopeManager {
  private scope: RuntimeScope;

  constructor() {
    this.scope = this.createScope();
  }

  createScope(parent?: RuntimeScope): RuntimeScope {
    return { parent, values: {} };
  }

  pushScope(scope?: RuntimeScope): void {
    this.scope = scope || this.createScope(this.scope);
  }

  popScope(): void {
    if (this.scope.parent) this.scope = this.scope.parent;
  }

  getCurrentScope(): RuntimeScope {
    return this.scope;
  }

  set(name: string, value: GSValue): void {
    let current: RuntimeScope | undefined = this.scope;
    while (current) {
      if (name in current.values) {
        current.values[name] = value;
        return;
      }
      current = current.parent;
    }
    this.scope.values[name] = value;
  }

  define(name: string, value: GSValue): void {
    this.scope.values[name] = value;
  }

  get(name: string): GSValue | undefined {
    let current: RuntimeScope | undefined = this.scope;
    while (current) {
      if (name in current.values) return current.values[name];
      current = current.parent;
    }
    return undefined;
  }

  getAllValues(): Record<string, GSValue> {
    const result: Record<string, GSValue> = {};
    const stack: RuntimeScope[] = [];
    let current: RuntimeScope | undefined = this.scope;
    while (current) {
      stack.push(current);
      current = current.parent;
    }
    while (stack.length) {
      Object.assign(result, stack.pop()!.values);
    }
    return result;
  }
}
