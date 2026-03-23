# GraphScript Program.md

**Project:** GraphScript  
**Goal:** Build a composable visual scripting language for charts, diagrams, algorithms, ERD, infrastructure, and 3D.

---

## 1. Product statement

GraphScript is a language and tooling project that should make it easy to:

- write one script
- define data and algorithms
- generate diagrams and charts
- embed one visual into another
- export visuals and documents

The strongest differentiator is **composition**:

> a chart can come from an algorithm trace, and that chart can be embedded inside a flowchart or explanation page.

That capability should drive the implementation priorities.

---

## 2. Product identity

### Recommended product name

**GraphScript**

### Short name

**GScript**

### Tagline

**Composable Visual Scripting for Charts, Diagrams, Algorithms, and 3D**

### Why this name

- matches your repository name
- easy to remember
- broad enough for more than charts
- still clearly about scripting + visuals

---

## 3. Core product pillars

GraphScript should be built around six pillars.

### Pillar 1 — One language, many views

One language should generate:

- charts
- flowcharts
- diagrams
- tables
- ERD
- infra diagrams
- 3D plots
- 3D scenes

### Pillar 2 — First-class composition

Everything renderable should be reusable as a submodule.

### Pillar 3 — Algorithm-aware visuals

Algorithms should be executable and able to emit trace data.

### Pillar 4 — Easy to write

The syntax should feel approachable for:

- developers
- educators
- analysts
- architects
- technical writers

### Pillar 5 — Strong semantics

Do not reduce everything into raw rectangles and lines. Provide domain-aware blocks.

### Pillar 6 — Pluggable growth

Support domain packs such as AWS, quantum, signal processing, and networking.

---

## 4. Recommended stack

This is a recommendation, not a hard rule.

### 4.1 Best practical choice

Use a **TypeScript monorepo**.

Why:

- strong ecosystem for CLI + web + editor tooling
- easy browser renderer path
- easy SVG/HTML generation
- good fit for interactive diagrams and 3D through web rendering
- good packaging story

### 4.2 Suggested workspace layout

```text
graph-script/
  packages/
    core/
    parser/
    ast/
    runtime/
    ir/
    layout/
    renderer-svg/
    renderer-html/
    renderer-canvas/
    renderer-webgl/
    modules-chart/
    modules-flow/
    modules-table/
    modules-erd/
    modules-infra/
    modules-scene3d/
    cli/
    lsp/
    formatter/
  examples/
  docs/
  specs/
  tests/
```

### 4.3 Suggested package responsibilities

- `core`: common types, errors, registry, symbol tables
- `parser`: lexer/parser + AST generation
- `ast`: syntax node definitions
- `runtime`: evaluator for data/func/algo
- `ir`: intermediate representation
- `layout`: box/graph layout engine
- `renderer-*`: output engines
- `modules-*`: domain-specific block compilers
- `cli`: command-line interface
- `lsp`: language server
- `formatter`: source formatter

---

## 5. Recommended architecture

Use a staged compiler architecture.

### Stage 1 — Parse

Input `.gs` file → AST

### Stage 2 — Resolve

Resolve:

- names
- imports
- exports
- module symbols
- component references

### Stage 3 — Validate

Check:

- types
- chart data shape
- missing nodes
- missing exports
- invalid embeds
- unsupported output targets

### Stage 4 — Execute

Run:

- constants
- data expressions
- functions
- algorithm blocks
- trace emission

### Stage 5 — Lower to IR

Convert all visual blocks into a shared IR.

### Stage 6 — Layout

Calculate:

- dimensions
- routes
- anchors
- nested embedding
- page placement

### Stage 7 — Render

Render to:

- SVG
- HTML
- PNG
- JSON IR
- later: WebGL / GLB

This staged model will keep the project maintainable.

---

## 6. Language design decisions to lock early

These should be fixed early and changed rarely.

### 6.1 Indentation-based syntax

Keep the syntax indentation-based.

Reason:

- easier to read
- better for docs/examples
- natural for structured visuals

### 6.2 Domain blocks, not only primitives

Keep blocks like:

- `chart`
- `flow`
- `erd`
- `infra`
- `scene3d`

Do not force everything to be drawn manually with `box`, `line`, and `text` only.

### 6.3 Shared IR

All visuals must compile to the same semantic IR family.

### 6.4 Composition as a first-class feature

`sub`, `component`, `export`, and `embed` must be part of the original design, not bolted on later.

### 6.5 Deterministic runtime

Keep algorithm execution deterministic by default.

---

## 7. MVP scope

Build the smallest version that proves the language identity.

### MVP must include

- parser
- `data`
- `func`
- `algo`
- `pseudo`
- `chart`
- `flow`
- `table`
- `sub` / `component` / `export` / `embed`
- page layout
- SVG export
- CLI `check`, `run`, `render`, `fmt`

### MVP should prove

1. algorithm emits trace
2. chart reads trace
3. flow embeds chart
4. page combines multiple visuals

If MVP can do those four things well, the project is already differentiated.

---

## 8. Delivery roadmap

### Phase 0 — Repo foundation

Deliver:

- monorepo setup
- build system
- lint/test setup
- package boundaries
- CI for test + typecheck
- docs skeleton

Exit criteria:

- repository builds cleanly
- sample CLI command works

### Phase 1 — Parser + AST

Deliver:

- tokenizer
- parser
- AST node definitions
- source spans for diagnostics
- error recovery for common syntax mistakes

Exit criteria:

- `.gs` files parse into stable AST
- parser snapshots exist for sample files

### Phase 2 — Runtime core

Deliver:

- values and environments
- expression evaluator
- function runtime
- algorithm runtime
- trace collector

Exit criteria:

- algorithm examples run and emit trace tables

### Phase 3 — IR + layout foundation

Deliver:

- IR types
- layout box model
- anchor system
- graph edge routing base
- embed placeholder behavior

Exit criteria:

- nested visuals can be laid out reliably

### Phase 4 — 2D renderer and core modules

Deliver:

- SVG renderer
- chart module
- flow module
- table module
- pseudo rendering

Exit criteria:

- export example report as SVG/PNG

### Phase 5 — Composition system

Deliver:

- `sub`
- `component`
- `export`
- `embed`
- `slot`

Exit criteria:

- chart inside flow node works
- pseudocode inside process explanation works

### Phase 6 — ERD and infrastructure

Deliver:

- `erd`
- `infra generic`
- `infra aws`
- icon registry
- group/container rendering

Exit criteria:

- one ERD example and one AWS example render correctly

### Phase 7 — 3D pipeline

Deliver:

- `plot3d`
- `scene3d`
- camera/light model
- WebGL/HTML renderer path
- optional raster output

Exit criteria:

- one 3D plot and one 3D object example render correctly

### Phase 8 — Tooling polish

Deliver:

- formatter
- LSP
- hover/completion
- error docs
- starter templates
- playground

Exit criteria:

- new users can create their first `.gs` file quickly

---

## 9. Detailed feature matrix

### 9.1 Core language

Required:

- variables and constants
- expressions
- functions
- lists/maps/records
- imports
- module resolution
- comments
- deterministic execution

### 9.2 Algorithm system

Required:

- local state
- loops
- conditions
- return values
- `emit`
- trace tables
- algorithm outputs

### 9.3 Chart system

Required:

- line
- scatter
- bar
- multi-series
- annotations
- axes and labels
- chart from trace/table

### 9.4 Flow system

Required:

- node types
- orthogonal routing
- decision edge labels
- group boxes
- embedded visuals

### 9.5 Generic diagram system

Required:

- panel
- text
- box
- arrow
- icon
- image
- grid/checker
- freeform positioning when needed

### 9.6 Table system

Required:

- columns and rows
- auto sizing
- alignment
- cell formatting
- source from data or trace

### 9.7 ERD system

Required:

- tables
- fields
- PK/FK
- relationships
- schema grouping

### 9.8 Infrastructure system

Required:

- provider-specific nodes
- containers/boundaries
- arrows
- labels
- grouped deployment zones

### 9.9 3D system

Required for later phase:

- surface plots
- 3D axes
- scene graph
- camera and light
- basic mesh primitives

### 9.10 Composition system

Required:

- submodules
- exports
- embeds
- slots
- parent-child theme control

---

## 10. Recommended repo docs

Create these docs as soon as possible:

- `README.md` — project overview
- `SPEC.md` — language specification
- `program.md` — build plan and milestones
- `docs/syntax.md` — quick syntax guide
- `docs/components.md` — sub/embed system
- `docs/charts.md`
- `docs/flow.md`
- `docs/erd.md`
- `docs/infra.md`
- `docs/scene3d.md`
- `docs/cli.md`
- `docs/errors.md`
- `examples/README.md`

---

## 11. Example repo structure for v1

```text
graph-script/
  README.md
  SPEC.md
  program.md
  package.json
  tsconfig.json
  packages/
    ast/
    parser/
    runtime/
    ir/
    layout/
    renderer-svg/
    modules-chart/
    modules-flow/
    modules-table/
    cli/
  examples/
    hello-chart.gs
    search-trace.gs
    chart-in-flow.gs
    oracle-explanation.gs
    fft-demo.gs
  tests/
    parser/
    runtime/
    render/
```

---

## 12. First five example files to ship

These matter a lot because they define how users understand the language.

### Example 1 — `hello-chart.gs`

Shows:

- `data`
- `chart`
- render to SVG

### Example 2 — `binary-search.gs`

Shows:

- `algo`
- `emit`
- trace generation
- `pseudo`

### Example 3 — `chart-in-flow.gs`

Shows:

- `sub`
- `component`
- `embed`
- page layout

### Example 4 — `oracle-explanation.gs`

Shows:

- infographic / flow hybrid
- educational layout
- boxes, labels, arrows

### Example 5 — `infra-aws.gs`

Shows:

- AWS provider
- grouped infrastructure visualization

These examples should be treated as product assets, not throwaway test files.

---

## 13. CLI plan

Recommended CLI commands:

```bash
graphscript new project-name
graphscript check file.gs
graphscript run file.gs
graphscript render file.gs -o out/
graphscript fmt file.gs
graphscript doctor
graphscript lsp
```

### Behavior notes

- `check`: parse + validate, no render
- `run`: execute algorithms and show trace/diagnostics
- `render`: render declared targets
- `fmt`: canonical formatting
- `doctor`: environment/debug info
- `new`: starter templates

---

## 14. Editor experience plan

The language will feel much better if editor support comes early.

### LSP features for early delivery

- syntax highlight
- parse diagnostics
- go-to definition
- hover docs for built-ins
- completion for block types and common fields
- formatter integration

### Later LSP features

- preview link to rendered outputs
- inline warnings for data shape mismatch
- provider-specific completion for infra nodes

---

## 15. Testing strategy

### 15.1 Parser tests

Use snapshot tests for AST.

### 15.2 Runtime tests

Test:

- expression evaluation
- deterministic algorithm results
- trace contents

### 15.3 Rendering tests

Test:

- IR snapshots
- SVG snapshots
- layout sanity assertions

### 15.4 Golden examples

Maintain canonical golden files for example outputs.

This is important for a visual language.

---

## 16. Performance plan

Performance matters later, but architecture should not block it.

### Early priorities

- fast parse
- incremental validation later
- avoid repeated recomputation during render

### Heavy cases to plan for

- large tables
- many-node flowcharts
- large infrastructure diagrams
- dense scatter plots
- nested embeds

---

## 17. UX rules for language ergonomics

To make GraphScript easy and pleasant to use:

### Rule 1

Prefer semantic blocks over low-level drawing.

### Rule 2

Allow quick defaults.

Example:

```graphscript
chart "Sales":
  type = line
  x = months
  y = revenue
```

That should already render nicely without too much styling.

### Rule 3

Keep naming predictable.

### Rule 4

Every important feature needs one minimal example.

### Rule 5

Composition should feel natural, not magical.

---

## 18. Hard problems to solve carefully

These are the real design traps.

### 18.1 Layout of embedded visuals

This is the most important hard problem.

Need rules for:

- intrinsic size
- scaling
- caption inheritance
- alignment
- padding and clipping

### 18.2 Shared style model

Need a clear theme/style cascade that works across chart, flow, ERD, infra, and 3D.

### 18.3 Data shape validation

Charts and tables must validate data early and clearly.

### 18.4 Cross-module references

Need clean symbol resolution for:

- `search.chart`
- `BinarySearch.trace`
- imported components

### 18.5 Provider-specific infra modeling

Need a good split between:

- generic infra semantics
- provider icon packs and shortcuts

---

## 19. Suggested initial milestones

### Milestone A — “Hello World Visual”

Success criteria:

- render a simple line chart from a `.gs` file

### Milestone B — “Algorithm to Chart”

Success criteria:

- run an algorithm
- emit trace
- render trace as chart

### Milestone C — “Chart inside Flow”

Success criteria:

- embed chart and pseudocode inside flow nodes

### Milestone D — “Report Page”

Success criteria:

- compose flow + chart + table on one page

### Milestone E — “Architecture and Schema”

Success criteria:

- ERD and AWS examples available

### Milestone F — “3D Demo”

Success criteria:

- one 3D plot and one 3D scene working

---

## 20. Recommended public positioning

Describe GraphScript like this:

> GraphScript is a composable visual scripting language for charts, diagrams, algorithms, infrastructure, database design, and 3D scenes.

Shorter version:

> One script. Many visuals. Reusable everywhere.

---

## 21. How to keep scope under control

This project can grow too wide very quickly.

Use this priority order:

1. composition model
2. parser/runtime
3. chart + flow + page
4. ERD + infra
5. 3D
6. plugin ecosystem

If composition is weak, the language becomes just another diagram DSL.

If composition is strong, the project becomes unique.

---

## 22. Immediate next actions

### Action 1

Commit the spec and program docs.

### Action 2

Settle core syntax and file extension.

### Action 3

Implement parser for:

- `use`
- `data`
- `func`
- `algo`
- `pseudo`
- `chart`
- `flow`
- `sub`
- `component`
- `page`

### Action 4

Build one end-to-end example:

- algorithm
- trace
- chart
- flow embed
- SVG export

### Action 5

Only after that, add ERD and infra.

---

## 23. Final program principle

Do not try to win by supporting every feature immediately.

Win by making this workflow feel amazing:

1. write data and algorithm
2. visualize result as chart
3. explain it with flowchart and pseudocode
4. reuse the result inside bigger pages and diagrams

That workflow is the real identity of GraphScript.
