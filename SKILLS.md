# GraphScript Coding Agent Skills

This document provides guidance for coding agents working on the GraphScript codebase.

## Project Overview

GraphScript is a **composable visual scripting language** for creating:
- 2D charts and scientific plots
- Flowcharts and process diagrams
- Pseudocode and executable algorithms
- Infographic-style diagrams
- Tables and state snapshots
- 3D plots and scenes
- Database diagrams (ERD)
- Infrastructure diagrams

**Core Idea:** Write one script, generate many views, and reuse one view inside another.

## Quick Start for Agents

### Build & Test Commands
```bash
npm run build          # Compile TypeScript
npm test               # Run tests
npm run check          # Type check only
npm run dev            # Development mode with ts-node
```

### CLI Commands
```bash
node dist/cli.js check <file.gs>              # Parse and validate
node dist/cli.js run <file.gs>                # Run algorithms with traces
node dist/cli.js render <file.gs> [options]   # Render to SVG/PNG/JPG
```

### Render Options
```bash
--format <svg|png|jpg>      # Output format (default: svg)
--scale <number>            # Resolution scale factor for PNG/JPG (default: 1)
--quality <1-100>           # JPEG quality (default: 90)
--font-scale <number>       # Font/formula scale factor (default: 1)
--image-scale <number>      # Image scale factor in diagrams (default: 1)
--fill-images               # Auto-fill images to fill available space
--output <dir>              # Output directory (default: ./output)
--skip-validation           # Skip overlap validation
--validation-report         # Generate detailed validation JSON
```

## Architecture

### Pipeline
```
Source (.gs) → Tokenizer → Parser → AST → Evaluator → IR → Layout → Renderer → Output
```

### Key Directories
```
src/
├── cli.ts                    # CLI entry point
├── tokenizer/                # Lexical analysis
├── parser/                   # Syntax parsing → AST
├── ast/types/                # AST type definitions
├── runtime/                  # Interpreter (Evaluator, Scope, Values)
├── renderer/                 # Rendering pipeline
│   ├── index.ts              # Main renderer orchestration
│   ├── chart/                # 2D chart rendering
│   ├── diagram/              # Diagram rendering
│   ├── diagram-semantic/     # Semantic layout engine
│   ├── flow.ts               # Flow renderer barrel
│   ├── flow-layout.ts        # Flow layout orchestrator
│   ├── flow-layout-*.ts      # Flow layout modules
│   ├── table.ts              # Table rendering
│   ├── latex/                # MathJax formula rendering
│   ├── validator/            # Auto-checking & overlap detection
│   └── ...
└── ...

spec/                         # Task specifications
├── INSTRUCTIONS.MD           # Agent instructions
├── XXX-*.md                  # Feature specs
└── handoff/                  # Session handoff documents
```

## Working with Specs

### Before Starting Any Task

1. **Read `spec/INSTRUCTIONS.MD`** for workflow guidelines
2. **Read existing specs** in `spec/` folder for context
3. **Read handoff documents** in `spec/handoff/` for previous session context
4. **Research the codebase** to understand where changes should go

### After Completing a Task

1. **Write a spec document** in `spec/XXX-description.md` (XXX = 3-digit number)
2. **Write a handoff document** in `spec/handoff/XXX-description.md`
3. Include: prompt, goals, codebase analysis, implementation details, testing plan

## Key Files to Know

### Parser Layer
- `src/parser/index.ts` - Main parser entry
- `src/parser/declaration-parser.ts` - Declaration parser orchestrator
- `src/parser/declaration-parser-basic.ts` - Core declarations
- `src/parser/declaration-parser-visual.ts` - Visual declarations (chart/flow/diagram)
- `src/parser/declaration-parser-domain.ts` - Domain declarations (erd/infra/page/render)
- `src/parser/expressions.ts` - Expression parsing
- `src/parser/statement-parser.ts` - Statement parsing for algo/func suites

### Runtime Layer
- `src/runtime/index.ts` - Evaluator class
- `src/runtime/scope.ts` - Variable scoping
- `src/runtime/values.ts` - Runtime value types (GSValue, Trace)
- `src/runtime/builtins.ts` - Built-in functions (range, sin, cos, etc.)

### Renderer Layer
- `src/renderer/index.ts` - Main Renderer class, format handling
- `src/renderer/diagram-semantic/layout.ts` - **Critical layout engine for semantic diagrams**
- `src/renderer/diagram-semantic/types.ts` - Layout types and options
- `src/renderer/diagram/render.ts` - Diagram renderer orchestrator
- `src/renderer/diagram/render-tree.ts` - Element dispatch tree
- `src/renderer/diagram/render-shapes.ts` - Shape-level renderers
- `src/renderer/diagram/render-state.ts` - Element render state/context resolution
- `src/renderer/chart/render.ts` - Chart rendering
- `src/renderer/validator/index.ts` - Auto-validation orchestration
- `src/renderer/validator/issues-core.ts` - Core overlap/overflow/gap checks
- `src/renderer/validator/semantic-issues.ts` - Semantic validator orchestrator

### AST Types
- `src/ast/types/declarations.ts` - Declaration AST types
- `src/ast/types/statements.ts` - Statement AST types
- `src/ast/types/expressions.ts` - Expression AST types

## Common Patterns

### Adding a New Declaration Type

1. Add type definition in `src/ast/types/declarations.ts`
2. Add parser branch in `src/parser/declaration-parser-basic.ts` or `src/parser/declaration-parser-visual.ts` / `src/parser/declaration-parser-domain.ts`
3. Add renderer case in `src/renderer/index.ts`
4. Create renderer file in `src/renderer/newtype.ts`

### Adding a New CLI Option

1. Add to `CliOptions` interface in `src/cli.ts`
2. Parse in `parseArgs()` function
3. Pass to `Renderer` constructor
4. Handle in appropriate renderer file

### Working with Scale Options

The project has multiple scale-related options:

| Option | Purpose | Applied Where |
|--------|---------|---------------|
| `--scale` | Resolution scale for PNG/JPG | `renderer/index.ts:writeOutput()` |
| `--font-scale` | Font/formula size multiplier | `diagram-semantic/layout-child-measure.ts:measureChild()` |
| `--image-scale` | Image size multiplier | `diagram-semantic/layout-child-measure.ts:measureChild()` |

**Important:** When modifying `imageScale` or `fontScale`, the changes affect the layout phase (before SVG generation), while `scale` affects the output phase (during PNG/JPG conversion).

### Layout Engine (diagram-semantic/layout.ts)

The `measureChild()` function now lives in `diagram-semantic/layout-child-measure.ts` and handles element sizing:

```typescript
// For images (line ~735-771):
// - naturalWidth/naturalHeight: original dimensions
// - imageScale: multiplier applied to natural dimensions
// - maxWidth: container constraint (prevents overflow)
// - clamp() ensures width stays within bounds

// Pattern for scale application:
const desiredWidth = naturalWidth * imageScale;
const desiredHeight = naturalHeight * imageScale;
let width = clamp(desiredWidth, scaledMinWidth, maxWidth);
```

## Validation System

The auto-checking validator (`src/renderer/validator/`) detects:
- Element overlaps
- Font size issues
- Readability problems

### Validation Flow
```
validateAndAdjust() → detectOverlaps() → calculateReadability() → relayout() (if needed)
```

### Validation Report Structure
```json
{
  "timestamp": "ISO date",
  "declaration": "name",
  "attempts": 3,
  "success": true,
  "readabilityScore": 92,
  "issues": [...],
  "metrics": {
    "minFontSize": 14,
    "avgFontSize": 16.5,
    "minElementSize": 80
  }
}
```

## Common Gotchas

### 1. Scale Direction Confusion
- `imageScale > 1` should make images **larger**, not smaller
- Check `clamp()` bounds carefully - if min > max, clamp returns max
- Always test with both scale < 1 and scale > 1

### 2. SVG Dimension Extraction
- SVG must have `width` and `height` attributes for PNG/JPG conversion
- Extract with regex: `width="(\d+)"` in `extractSvgWidth()`

### 3. Sharp Library
- Used for SVG → PNG/JPG conversion
- `sharp(Buffer.from(svg)).resize(width, height).png().toFile(path)`
- Handles the actual rasterization

### 4. Layout Constraints
- `maxWidth` is a hard constraint from container
- Elements must not exceed container width
- Use `clamp(value, min, max)` for safe bounds

## Testing Guidelines

### Manual Testing
```bash
# Test PNG/JPG rendering
node dist/cli.js render examples/hello-chart.gs --format png --scale 2
node dist/cli.js render examples/hello-chart.gs --format jpg --quality 80

# Test scale options
node dist/cli.js render temp/diagram.gs --format png --image-scale 1 -o test1
node dist/cli.js render temp/diagram.gs --format png --image-scale 5 -o test5

# Compare file sizes
ls -la test1/*.png test5/*.png
```

### Test File Comparison
```bash
# PowerShell
Get-Item test1\output.png | Select-Object Name, Length
Get-Item test5\output.png | Select-Object Name, Length
```

## Code Style

- 2-space indentation
- TypeScript strict mode
- No comments unless requested
- Follow existing patterns in the file

## Debugging Tips

### Enable Debug Output
```bash
DEBUG=1 node dist/cli.js render file.gs
```

### Check AST Output
Add temporary logging in parser:
```typescript
console.log(JSON.stringify(ast, null, 2));
```

### Check Layout Values
Add logging in `measureChild()`:
```typescript
console.log({ naturalWidth, imageScale, maxWidth, width, height });
```

## File Naming Conventions

- Spec files: `spec/XXX-short-description.md` (XXX = 000-999)
- Handoff files: `spec/handoff/XXX-short-description.md`
- Source files: `kebab-case.ts`
- Test files: `tests/category/file.test.ts`
- Example files: `examples/kebab-case.gs`

## Dependencies

| Package | Purpose |
|---------|---------|
| `typescript` | Compilation |
| `sharp` | Image processing (SVG → PNG/JPG) |
| `mathjax` | LaTeX formula rendering |
| `jest` | Testing |
| `ts-node` | Development execution |

## When in Doubt

1. **Read existing specs** in `spec/` folder
2. **Read existing code** for similar features
3. **Ask for clarification** rather than assuming
4. **Test changes** with multiple scale values
5. **Write handoff documents** for future sessions
