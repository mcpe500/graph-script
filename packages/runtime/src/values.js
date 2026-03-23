export function isTruthy(value) {
    if (value === null || value === false)
        return false;
    if (typeof value === 'number')
        return value !== 0;
    if (typeof value === 'string')
        return value.length > 0;
    if (Array.isArray(value))
        return value.length > 0;
    if (typeof value === 'object')
        return Object.keys(value).length > 0;
    return true;
}
export function equals(a, b) {
    if (a === null && b === null)
        return true;
    if (typeof a !== typeof b)
        return false;
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length)
            return false;
        return a.every((v, i) => equals(v, b[i]));
    }
    if (typeof a === 'object' && a !== null && b !== null) {
        const aObj = a;
        const bObj = b;
        const aKeys = Object.keys(aObj);
        const bKeys = Object.keys(bObj);
        if (aKeys.length !== bKeys.length)
            return false;
        return aKeys.every(k => equals(aObj[k], bObj[k]));
    }
    return a === b;
}
export function compare(a, b, op) {
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
//# sourceMappingURL=values.js.map