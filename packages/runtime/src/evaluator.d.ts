import { Program } from '@graphscript/ast';
import { GSValue, Trace } from './values';
export interface RuntimeScope {
    parent?: RuntimeScope;
    values: Record<string, GSValue>;
}
export declare class Evaluator {
    private scope;
    private modules;
    private algorithms;
    private traces;
    constructor();
    private createScope;
    private initBuiltins;
    execute(program: Program): Record<string, GSValue>;
    private executeTopLevel;
    private createFunction;
    private evalExpression;
    private evalBinary;
    private evalUnary;
    private evalCall;
    private evalMember;
    private evalStatement;
    private lookup;
    private findCurrentAlgorithm;
    getTrace(name: string): Trace | undefined;
    runAlgorithm(name: string, args: GSValue[]): GSValue;
}
//# sourceMappingURL=evaluator.d.ts.map