export type GSValue = 
  | number 
  | string 
  | boolean 
  | null 
  | GSValue[] 
  | Record<string, GSValue>
  | GSFunction
  | GSAlgorithm
  | Trace;

export interface GSFunction {
  type: 'function';
  params: string[];
  body: any[];
  closure: Record<string, GSValue>;
}

export interface GSAlgorithm {
  type: 'algorithm';
  name: string;
  params: string[];
  body: any[];
  trace: Trace;
}

export interface Trace {
  type: 'trace';
  columns: string[];
  rows: Record<string, GSValue>[];
}

export function isTruthy(value: GSValue): boolean {
  if (value === null || value === false) return false;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

export function equals(a: GSValue, b: GSValue): boolean {
  if (a === null && b === null) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => equals(v, b[i]));
  }
  if (typeof a === 'object' && a !== null && b !== null) {
    const aObj = a as Record<string, GSValue>;
    const bObj = b as Record<string, GSValue>;
    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every(k => equals(aObj[k], bObj[k]));
  }
  return a === b;
}

export function compare(a: GSValue, b: GSValue, op: string): boolean {
  if (typeof a === 'number' && typeof b === 'number') {
    switch (op) {
      case '<': return a < b;
      case '>': return a > b;
      case '<=': return a <= b;
      case '>=': return a >= b;
      default: return false;
    }
  }
  if (typeof a === 'string' && typeof b === 'string') {
    switch (op) {
      case '<': return a < b;
      case '>': return a > b;
      case '<=': return a <= b;
      case '>=': return a >= b;
      default: return false;
    }
  }
  return false;
}
