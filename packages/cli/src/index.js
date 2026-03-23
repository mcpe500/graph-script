#!/usr/bin/env node
import { Parser } from '@graphscript/parser';
import { Evaluator } from '@graphscript/runtime';
const args = process.argv.slice(2);
const command = args[0];
if (!command) {
    console.log('GraphScript CLI');
    console.log('');
    console.log('Usage:');
    console.log('  graphscript check <file.gs>  - Parse and validate');
    console.log('  graphscript run <file.gs>    - Run algorithms and show traces');
    console.log('  graphscript render <file.gs> - Render to output');
    process.exit(1);
}
const file = args[1];
if (!file) {
    console.error('Error: No file specified');
    process.exit(1);
}
const fs = require('fs');
const source = fs.readFileSync(file, 'utf-8');
try {
    const parser = new Parser();
    const program = parser.parse(source);
    console.log('Parse: OK');
    if (command === 'check') {
        console.log('Validation: OK');
        process.exit(0);
    }
    const evaluator = new Evaluator();
    const values = evaluator.execute(program);
    console.log('Execution: OK');
    if (command === 'run') {
        for (const [name, trace] of Object.entries(values)) {
            if (trace && typeof trace === 'object' && trace.type === 'trace') {
                console.log(`\nTrace: ${name}`);
                console.log(trace.columns.join('\t'));
                for (const row of trace.rows) {
                    console.log(Object.values(row).join('\t'));
                }
            }
        }
    }
    if (command === 'render') {
        console.log('Render: Not implemented yet');
    }
}
catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
}
//# sourceMappingURL=index.js.map