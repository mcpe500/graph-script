import { Token } from '@graphscript/ast';
export declare class Tokenizer {
    private source;
    private pos;
    private line;
    private column;
    private tokens;
    private indentStack;
    private lineStart;
    tokenize(source: string): Token[];
    private reset;
    private tokenizeAll;
    private skipWhitespace;
    private skipComment;
    private newlineToken;
    private calculateIndent;
    private stringToken;
    private numberToken;
    private identifierToken;
    private operatorToken;
    private isOperator;
    private isDigit;
    private isAlpha;
    private isAlphaNumeric;
    private peek;
    private advance;
    private match;
    private isEof;
    private currentLocation;
    private addToken;
    private error;
}
//# sourceMappingURL=tokenizer.d.ts.map