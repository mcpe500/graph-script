export type GSValue = number | string | boolean | null | GSValue[] | Record<string, GSValue> | GSFunction | GSAlgorithm | Trace;
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
export declare function isTruthy(value: GSValue): boolean;
export declare function equals(a: GSValue, b: GSValue): boolean;
export declare function compare(a: GSValue, b: GSValue, op: string): boolean;
//# sourceMappingURL=values.d.ts.map