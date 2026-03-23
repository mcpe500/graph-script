export class Tokenizer {
    source = '';
    pos = 0;
    line = 1;
    column = 1;
    tokens = [];
    indentStack = [0];
    lineStart = 0;
    tokenize(source) {
        this.source = source;
        this.reset();
        this.tokenizeAll();
        return this.tokens;
    }
    reset() {
        this.pos = 0;
        this.line = 1;
        this.column = 1;
        this.tokens = [];
        this.indentStack = [0];
        this.lineStart = 0;
    }
    tokenizeAll() {
        while (!this.isEof()) {
            this.skipWhitespace();
            if (this.isEof())
                break;
            const start = this.currentLocation();
            if (this.match('#')) {
                this.skipComment();
                continue;
            }
            if (this.match('\n')) {
                this.newlineToken();
                continue;
            }
            if (this.match('"') || this.match("'")) {
                this.stringToken(start);
                continue;
            }
            if (this.isDigit(this.peek())) {
                this.numberToken(start);
                continue;
            }
            if (this.isAlpha(this.peek()) || this.peek() === '_') {
                this.identifierToken(start);
                continue;
            }
            if (this.match('[')) {
                this.addToken('LBRACKET', '[', start);
                continue;
            }
            if (this.match(']')) {
                this.addToken('RBRACKET', ']', start);
                continue;
            }
            if (this.match('(')) {
                this.addToken('LPAREN', '(', start);
                continue;
            }
            if (this.match(')')) {
                this.addToken('RPAREN', ')', start);
                continue;
            }
            if (this.match('{')) {
                this.addToken('LBRACE', '{', start);
                continue;
            }
            if (this.match('}')) {
                this.addToken('RBRACE', '}', start);
                continue;
            }
            if (this.match(':')) {
                this.addToken('COLON', ':', start);
                continue;
            }
            if (this.match(',')) {
                this.addToken('COMMA', ',', start);
                continue;
            }
            if (this.match('|')) {
                this.addToken('PIPE', '|', start);
                continue;
            }
            if (this.match('=')) {
                this.addToken('EQUALS', '=', start);
                continue;
            }
            if (this.match('-') && this.peek() === '>') {
                this.advance();
                this.addToken('ARROW', '->', start);
                continue;
            }
            if (this.isOperator(this.peek())) {
                this.operatorToken(start);
                continue;
            }
            this.error(`Unexpected character: ${this.peek()}`);
            this.advance();
        }
        this.addToken('EOF', '', this.currentLocation());
        while (this.indentStack.length > 1) {
            this.indentStack.pop();
            const loc = this.currentLocation();
            this.addToken('DEDENT', '', loc);
        }
    }
    skipWhitespace() {
        while (!this.isEof() && ' \t'.includes(this.peek())) {
            this.advance();
        }
    }
    skipComment() {
        while (!this.isEof() && this.peek() !== '\n') {
            this.advance();
        }
    }
    newlineToken() {
        const indent = this.calculateIndent();
        const start = this.currentLocation();
        this.addToken('NEWLINE', '\n', start);
        if (indent > this.indentStack[this.indentStack.length - 1]) {
            this.indentStack.push(indent);
            this.addToken('INDENT', '', start);
        }
        else if (indent < this.indentStack[this.indentStack.length - 1]) {
            while (indent < this.indentStack[this.indentStack.length - 1]) {
                this.indentStack.pop();
                this.addToken('DEDENT', '', start);
            }
        }
    }
    calculateIndent() {
        const start = this.pos;
        while (' \t'.includes(this.peek())) {
            this.advance();
        }
        const indent = this.pos - start;
        this.pos = start;
        return indent;
    }
    stringToken(start) {
        const quote = this.peek();
        this.advance();
        let value = '';
        while (!this.isEof() && this.peek() !== quote) {
            if (this.peek() === '\\') {
                this.advance();
                const ch = this.peek();
                if (ch === 'n')
                    value += '\n';
                else if (ch === 't')
                    value += '\t';
                else
                    value += ch;
            }
            else {
                value += this.peek();
            }
            this.advance();
        }
        this.advance();
        this.addToken('STRING', value, start);
    }
    numberToken(start) {
        let value = '';
        while (!this.isEof() && (this.isDigit(this.peek()) || this.peek() === '.')) {
            value += this.peek();
            this.advance();
        }
        this.addToken('NUMBER', value, start);
    }
    identifierToken(start) {
        let value = '';
        while (!this.isEof() && (this.isAlphaNumeric(this.peek()) || this.peek() === '_' || this.peek() === '.')) {
            value += this.peek();
            this.advance();
        }
        if (value === 'true' || value === 'false') {
            this.addToken('BOOLEAN', value, start);
        }
        else if (value === 'null') {
            this.addToken('NULL', value, start);
        }
        else {
            this.addToken('IDENTIFIER', value, start);
        }
    }
    operatorToken(start) {
        let value = '';
        while (!this.isEof() && this.isOperator(this.peek())) {
            value += this.peek();
            this.advance();
        }
        this.addToken('OPERATOR', value, start);
    }
    isOperator(ch) {
        return '+-*/%^=<>!&|'.includes(ch);
    }
    isDigit(ch) {
        return /[0-9]/.test(ch);
    }
    isAlpha(ch) {
        return /[a-zA-Z_]/.test(ch);
    }
    isAlphaNumeric(ch) {
        return /[a-zA-Z0-9_]/.test(ch);
    }
    peek() {
        return this.source[this.pos];
    }
    advance() {
        const ch = this.source[this.pos];
        this.pos++;
        if (ch === '\n') {
            this.line++;
            this.column = 1;
            this.lineStart = this.pos;
        }
        else {
            this.column++;
        }
        return ch;
    }
    match(expected) {
        return this.peek() === expected;
    }
    isEof() {
        return this.pos >= this.source.length;
    }
    currentLocation() {
        return {
            line: this.line,
            column: this.column,
            offset: this.pos
        };
    }
    addToken(type, value, start) {
        this.tokens.push({
            type,
            value,
            location: {
                start,
                end: this.currentLocation()
            }
        });
    }
    error(message) {
        console.error(`Tokenizer error at ${this.line}:${this.column}: ${message}`);
    }
}
//# sourceMappingURL=tokenizer.js.map