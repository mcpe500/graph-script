# GraphScript Specification

**Project name:** GraphScript  
**Short name:** GScript  
**Language ID:** `graphscript`  
**File extension:** `.gs`  
**Current spec version:** `0.1-draft`

---

## 1. Vision

GraphScript is a **composable visual scripting language** for building:

- 2D charts and scientific plots
- flowcharts and process diagrams
- pseudocode and executable algorithms
- infographic-style diagrams
- tables and state snapshots
- 3D plots and 3D scenes
- database diagrams / ERD
- infrastructure diagrams, including AWS-style architectures
- reusable visual modules that can be embedded inside other visuals

GraphScript is not only a chart language. It is a **unified DSL for computation, explanation, and rendering**.

The core idea is:

> write one script, generate many views, and reuse one view inside another.

Examples:

- an `algo` block can emit trace data
- a `chart` block can render that trace
- a `flow` block can embed the chart into a process node
- a `page` block can place flowchart + pseudocode + table into one explainable artifact

---

## 2. Design goals

### 2.1 Primary goals

1. **Easy to write**
   - simple indentation-based syntax
   - readable like Python/YAML, but with strong structure
2. **Composable**
   - every renderable object can become a `sub` / component
3. **Multi-domain**
   - charts, flowcharts, ERD, infra, 3D, algorithm traces, tables
4. **Scriptable**
   - variables, functions, loops, expressions, imports, reusable components
5. **Deterministic**
   - same input script should produce the same result unless randomness is explicit
6. **Extensible**
   - domain modules can be added without breaking core syntax
7. **Explainable**
   - ideal for teaching, documentation, reports, architecture, scientific explanation

### 2.2 Non-goals

GraphScript is not intended to replace:

- a full general-purpose programming language
- a full CAD system
- a full game engine
- a pixel-perfect manual illustration tool

Instead, GraphScript should cover the sweet spot between:

- **diagram DSL**
- **scientific plotting**
- **architecture description**
- **algorithm explanation**
- **scene specification**

---

## 3. Language model

GraphScript has three layers:

### 3.1 Core language

The core language provides:

- variables
- expressions
- functions
- blocks
- imports
- namespaces
- component references
- styles and themes
- layout primitives

### 3.2 Domain modules

Domain modules provide higher-level meaning:

- `chart`
- `flow`
- `diagram`
- `table`
- `algo`
- `pseudo`
- `plot3d`
- `scene3d`
- `erd`
- `infra`
- `quantum` (optional extension)

### 3.3 Composition system

The composition system enables:

- `sub` reusable modules
- `component` instances
- `embed` child views into parent views
- `export` named outputs from a module
- `slot` placeholders for configurable composition

This is the feature that allows “chart inside flowchart”, “algorithm inside process explanation”, and “diagram inside report”.

---

## 4. File structure and top-level grammar

A GraphScript file is a sequence of top-level declarations.

### 4.1 Top-level declarations

Supported top-level blocks:

- `use`
- `import`
- `const`
- `data`
- `func`
- `theme`
- `style`
- `sub`
- `algo`
- `pseudo`
- `chart`
- `flow`
- `diagram`
- `table`
- `plot3d`
- `scene3d`
- `erd`
- `infra`
- `page`
- `render`

### 4.2 Example file

```graphscript
use chart
use flow
use infra.aws

const app_name = "Search Demo"

data:
  xs = range(-6, 6, 0.1)
  ys = 1 / (1 + exp(-xs))

chart "Sigmoid":
  type = line
  x = xs
  y = ys
  xlabel = "x"
  ylabel = "sigmoid(x)"

flow "Overview":
  start -> process "Generate"
  process "Generate" -> end
```

---

## 5. Syntax rules

### 5.1 Block syntax

GraphScript uses **significant indentation**.

- A block header ends with `:`
- Indented lines belong to that block
- Tabs are not allowed; use spaces only
- Recommended indentation: 2 spaces

Example:

```graphscript
chart "Example":
  type = line
  x = [1, 2, 3]
  y = [4, 5, 6]
```

### 5.2 Comments

Single-line comments start with `#`.

```graphscript
# this is a comment
```

### 5.3 Identifiers

Identifiers must:

- start with a letter or `_`
- contain letters, digits, `_`, and `.` for qualified names

Examples:

- `sales`
- `_private`
- `theme.dark`
- `search.trace`

### 5.4 Strings

Strings can use single or double quotes.

```graphscript
name = "GraphScript"
kind = 'flow'
```

### 5.5 Collections

- lists: `[1, 2, 3]`
- tuples: `(1, 2, 3)`
- maps: `{ key: value, other: 10 }`

### 5.6 Function call syntax

```graphscript
xs = range(0, 10, 0.5)
y = sigmoid(xs)
```

### 5.7 Operators

Arithmetic:

- `+ - * / % ^`

Comparison:

- `== != < <= > >=`

Boolean:

- `and or not`

Membership:

- `in`, `not in`

Range and indexing:

- `arr[0]`
- `table["col"]`
- `node.outputs.main`

---

## 6. Core data model

### 6.1 Primitive types

- `number`
- `string`
- `bool`
- `null`

### 6.2 Structural types

- `list<T>`
- `map<K,V>`
- `tuple`
- `record`
- `table`
- `trace`
- `point2`
- `point3`
- `color`
- `duration`

### 6.3 Visual object types

- `chart_spec`
- `flow_spec`
- `diagram_spec`
- `table_spec`
- `plot3d_spec`
- `scene3d_spec`
- `erd_spec`
- `infra_spec`
- `component_instance`
- `layout_box`

### 6.4 Special runtime values

- `this` = current block context
- `theme` = current theme values
- `env` = CLI/render environment

---

## 7. Imports and modules

### 7.1 `use`

`use` enables language modules.

```graphscript
use chart
use flow
use scene3d
use infra.aws
```

### 7.2 `import`

`import` imports symbols or files.

```graphscript
import "common/theme.gs"
import SearchModule from "modules/search.gs"
import { colors, spacing } from "tokens.gs"
```

### 7.3 Standard module namespaces

Recommended built-in modules:

- `core`
- `math`
- `chart`
- `flow`
- `diagram`
- `table`
- `layout`
- `plot3d`
- `scene3d`
- `erd`
- `infra`
- `infra.aws`
- `icons`
- `theme`

---

## 8. Constants, data, and functions

### 8.1 `const`

Use `const` for immutable bindings.

```graphscript
const title = "FFT Analysis"
const threshold = 0.9
```

### 8.2 `data`

`data` defines datasets, tables, arrays, and derived values.

```graphscript
data:
  xs = range(0, 10, 0.1)
  ys = sin(xs)
  rows = [
    { step: 1, op: "init" },
    { step: 2, op: "apply H" }
  ]
```

### 8.3 `func`

Functions are pure by default.

```graphscript
func sigmoid(x):
  return 1 / (1 + exp(-x))
```

Multi-line example:

```graphscript
func normalize(vs):
  lo = min(vs)
  hi = max(vs)
  return map(vs, (v) => (v - lo) / (hi - lo))
```

---

## 9. Themes and styles

### 9.1 `theme`

Themes define reusable design tokens.

```graphscript
theme dark:
  colors:
    bg = "#0f172a"
    panel = "#111827"
    text = "#e5e7eb"
    accent = "#60a5fa"
  spacing:
    xs = 4
    sm = 8
    md = 16
    lg = 24
  font:
    family = "Inter"
    size = 14
```

### 9.2 `style`

Styles define reusable visual rules.

```graphscript
style info_card:
  fill = theme.colors.panel
  stroke = theme.colors.accent
  radius = 12
  padding = theme.spacing.md
```

### 9.3 Style application

A block may reference styles:

```graphscript
chart "Sales":
  style = info_card
```

---

## 10. Submodules, components, and composition

This is the heart of GraphScript.

### 10.1 `sub`

A `sub` block defines a reusable module.

```graphscript
sub SearchModule(arr, target):
  algo BinarySearch(arr, target):
    # ...

  pseudo "Binary Search":
    # ...

  chart "Mid Trace":
    source = BinarySearch.trace
    type = line
    x = step
    y = mid

  export chart = "Mid Trace"
  export pseudo = "Binary Search"
  export trace = BinarySearch.trace
```

### 10.2 `component`

A `component` instantiates a submodule.

```graphscript
component search = SearchModule(arr=data.items, target=42)
```

### 10.3 `export`

Exports allow named outputs from a submodule.

Allowed exports:

- visual blocks
- trace outputs
- tables
- computed values
- render targets

### 10.4 `embed`

`embed` inserts one visual into another.

```graphscript
flow "Explain Search":
  node step1 type=process label="Binary Search"
  embed step1.right = search.chart
  embed step1.bottom = search.pseudo
```

### 10.5 `slot`

A submodule can declare slots for customization.

```graphscript
sub AnalysisCard(title, body):
  slot header
  slot detail

  diagram "Card":
    panel root:
      text title at top
      embed slot.header at header_area
      embed body at main_area
      embed slot.detail at footer_area
```

### 10.6 Composition rules

1. Every visual object has a bounding box and anchor points.
2. Embedded visuals must expose intrinsic size or resizable layout constraints.
3. Parent visuals may override child theme, size, scale, and caption.
4. Child visuals keep semantic identity for interactive use.

---

## 11. Algorithms and runtime execution

### 11.1 `algo`

`algo` is an executable procedural block.

It supports:

- local variables
- `if`, `else if`, `else`
- `for`, `while`
- `break`, `continue`, `return`
- collection helpers
- explicit trace emission

### 11.2 Example

```graphscript
algo BinarySearch(arr, target):
  low = 0
  high = len(arr) - 1
  step = 0

  while low <= high:
    mid = floor((low + high) / 2)

    emit:
      step = step
      low = low
      high = high
      mid = mid
      value = arr[mid]

    if arr[mid] == target:
      return mid
    else if arr[mid] < target:
      low = mid + 1
    else:
      high = mid - 1

    step = step + 1

  return -1
```

### 11.3 `emit`

`emit` appends rows into an algorithm trace.

The runtime automatically creates `BinarySearch.trace` with rows:

- `step`
- `low`
- `high`
- `mid`
- `value`

### 11.4 Determinism

Algorithms must be deterministic by default.

If randomness is needed, it must be explicit:

```graphscript
rng = random(seed=123)
```

### 11.5 Side effects

Runtime side effects are restricted.

Safe default behavior:

- no arbitrary file writes inside language runtime
- no network calls unless enabled by host
- no shell execution in core language

---

## 12. Pseudocode blocks

### 12.1 `pseudo`

`pseudo` defines readable algorithm-like text for explanation.

```graphscript
pseudo "Binary Search":
  function binary_search(arr, target):
    low <- 0
    high <- len(arr) - 1
    while low <= high:
      mid <- floor((low + high) / 2)
      if arr[mid] == target:
        return mid
      else if arr[mid] < target:
        low <- mid + 1
      else:
        high <- mid - 1
    return -1
```

### 12.2 Pseudocode semantics

`pseudo` is presentation-first.

It is not required to be executable.

However, a `pseudo` block may optionally reference an `algo` block:

```graphscript
pseudo "Binary Search" from BinarySearch
```

This enables auto-generated pseudocode from executable logic.

---

## 13. 2D charts and scientific plots

### 13.1 `chart`

A `chart` block defines 2D plots.

Supported kinds in the base spec:

- `line`
- `scatter`
- `bar`
- `area`
- `histogram`
- `pie`
- `heatmap`
- `contour`
- `parametric`
- `spectrum`

### 13.2 Basic line chart

```graphscript
chart "Sigmoid Curve":
  type = line
  x = xs
  y = ys
  xlabel = "x"
  ylabel = "sigmoid(x)"
  grid = true
```

### 13.3 Multi-series chart

```graphscript
chart "Activations":
  type = line
  series:
    - label = "sigmoid"
      x = xs
      y = sigmoid(xs)
    - label = "tanh"
      x = xs
      y = tanh(xs)
```

### 13.4 Chart from table or trace

```graphscript
chart "Search Trace":
  source = BinarySearch.trace
  type = line
  x = step
  y = mid
```

### 13.5 Annotations

```graphscript
chart "FFT":
  type = spectrum
  x = freqs
  y = amps
  annotate peak at (50, 1.2) label="50 Hz"
  annotate peak at (120, 0.7) label="120 Hz"
```

### 13.6 Layout inside charts

Charts may expose regions:

- `plot`
- `legend`
- `title`
- `caption`
- `left`
- `right`
- `top`
- `bottom`

These regions allow embedded content when supported by the renderer.

---

## 14. Flowcharts and process diagrams

### 14.1 `flow`

A `flow` block defines semantic node-edge diagrams.

### 14.2 Built-in node types

- `start`
- `end`
- `process`
- `decision`
- `input`
- `output`
- `data`
- `subprocess`
- `note`

### 14.3 Basic example

```graphscript
flow "Oracle Classification":
  node input type=input label="Masukan x ∈ {0,1}^n"
  node oracle type=process label="Oracle (Kotak Hitam)"
  node c0 type=process label="f(x)=0 untuk semua x"
  node c1 type=process label="f(x)=1 untuk semua x"
  node bal type=process label="balanced"

  input -> oracle
  oracle -> c0 label="Kasus 1"
  oracle -> c1 label="Kasus 2"
  oracle -> bal label="Kasus 3/4"
```

### 14.4 Embedded visuals in flow nodes

```graphscript
flow "Explain Search":
  node run type=process label="Run Binary Search"
  embed run.right = search.chart
  embed run.bottom = search.pseudo
```

### 14.5 Flow layout options

- `direction = top_down | left_right | radial`
- `routing = orthogonal | straight | curved`
- `node_spacing`
- `layer_spacing`
- `pack_groups = true | false`

---

## 15. Generic diagrams and infographics

### 15.1 `diagram`

`diagram` is the free-form visual block for infographic-style layouts.

Use it when the structure is not naturally a chart, flowchart, ERD, or infra diagram.

### 15.2 Built-in primitives

- `panel`
- `group`
- `box`
- `circle`
- `ellipse`
- `line`
- `arrow`
- `path`
- `grid`
- `checker`
- `text`
- `image`
- `icon`
- `badge`
- `callout`

### 15.3 Example

```graphscript
diagram "Oracle Status":
  panel root:
    grid left_grid rows=4 cols=4 fill="blue"
    checker right_grid rows=4 cols=4 colors=["blue", "orange"]
    circle or_badge label="OR"
    text left_title value="KONDISI KONSTAN"
    text right_title value="KONDISI SEIMBANG"
```

### 15.4 Use cases

- presentations
- architecture cards
- step-by-step explanation panels
- concept diagrams
- educational visualizations

---

## 16. Tables

### 16.1 `table`

A `table` block renders tabular data.

```graphscript
table "Quantum Steps":
  columns = ["Step", "Operasi", "q0", "q1", "q2", "q3", "Keterangan"]
  rows = steps
```

### 16.2 Table sources

`rows` may come from:

- inline records
- `data` block tables
- `algo.trace`
- imported CSV/JSON sources

### 16.3 Table features

- merged cells
- row striping
- cell formatting
- math formatting
- icon-in-cell
- row highlighting

---

## 17. 3D plots

### 17.1 `plot3d`

`plot3d` renders mathematical or data-driven 3D views.

Supported kinds:

- `surface`
- `wireframe`
- `scatter3d`
- `line3d`
- `vector_field`
- `parametric_surface`

### 17.2 Example

```graphscript
plot3d "Wave Surface":
  type = surface
  x = range(-5, 5, 0.2)
  y = range(-5, 5, 0.2)
  z = sin(x) * cos(y)
  axes = true
  colormap = "viridis"
```

### 17.3 3D chart options

- `camera`
- `lights`
- `axes`
- `grid`
- `legend`
- `labels`
- `clip`

---

## 18. 3D scenes and object rendering

### 18.1 `scene3d`

`scene3d` is used for object-based rendering.

Supported primitives:

- `cube`
- `sphere`
- `cylinder`
- `cone`
- `plane`
- `line3`
- `arrow3`
- `text3`
- `mesh`
- `group`

### 18.2 Example

```graphscript
scene3d "Bloch Demo":
  camera at (4, 3, 6)
  light sun intensity=1.0 direction=(1, -1, -1)

  object sphere bloch:
    radius = 1
    wireframe = true

  object arrow3 state:
    from = (0, 0, 0)
    to = (0, -1, 0)
    color = "blue"
```

### 18.3 Transform model

Each object supports:

- `position`
- `rotation`
- `scale`
- `pivot`

### 18.4 Material model

Recommended built-in materials:

- `flat`
- `matte`
- `gloss`
- `metal`
- `glass`
- `wire`

---

## 19. Database design and ERD

### 19.1 `erd`

`erd` is a database/schema modeling block.

### 19.2 Example

```graphscript
erd "ShopDB":
  table users:
    id int pk
    email varchar unique
    created_at datetime

  table orders:
    id int pk
    user_id int fk users.id
    total decimal
    created_at datetime

  table order_items:
    id int pk
    order_id int fk orders.id
    product_id int fk products.id
    qty int

  users.id 1--* orders.user_id
  orders.id 1--* order_items.order_id
```

### 19.3 ERD semantics

Tables, fields, keys, and relationships should remain machine-readable.

This allows future outputs such as:

- rendered ER diagram
- DDL generation
- schema documentation
- migration summary

### 19.4 Recommended ERD features

- field types
- PK / FK / unique / nullable flags
- index metadata
- enum support
- group by schema
- crow’s foot and classic relation styles

---

## 20. Infrastructure diagrams

### 20.1 `infra`

`infra` models systems and cloud architectures.

### 20.2 Providers

Base providers:

- `generic`
- `aws`
- `gcp`
- `azure`
- `k8s`

### 20.3 AWS example

```graphscript
infra aws "Web Platform":
  region "ap-southeast-1"

  vpc main:
    cidr = "10.0.0.0/16"

  subnet public_a in main:
    type = public

  subnet private_a in main:
    type = private

  alb edge in public_a
  ecs api in private_a
  rds postgres in private_a
  s3 assets

  edge -> api
  api -> postgres
  api -> assets
```

### 20.4 Infrastructure features

- containers / boundaries (VPC, subnet, cluster, namespace)
- service icons
- directional edges
- labels and protocols
- group nesting
- environment tags (`dev`, `staging`, `prod`)
- secrets/data flow overlays

---

## 21. Page layout and multi-view documents

### 21.1 `page`

`page` combines multiple visuals into one document or slide-like layout.

```graphscript
page "Binary Search Report":
  layout = grid(columns=2, rows=2, gap=16)

  place search.chart at cell(1, 1)
  place search.pseudo at cell(1, 2)
  place SearchFlow at cell(2, 1..2)
```

### 21.2 Use cases

- report page
- explanation sheet
- poster
- exportable slide page
- dashboard-style static layout

---

## 22. Render blocks and outputs

### 22.1 `render`

`render` declares output targets.

```graphscript
render:
  target chart "Sigmoid Curve" to "out/sigmoid.svg"
  target page "Binary Search Report" to "out/report.png"
  target scene3d "Bloch Demo" to "out/bloch.glb"
```

### 22.2 Supported output formats

Recommended outputs for v1:

- `svg`
- `png`
- `pdf`
- `html`
- `json` (IR export)

Recommended outputs for later versions:

- `glb`
- `obj`
- `mp4`
- `gif`

---

## 23. Layout system

### 23.1 Layout primitives

Recommended layout primitives:

- `stack`
- `row`
- `column`
- `grid`
- `absolute`
- `anchor`
- `fit`

### 23.2 Constraints

Each visual object may expose:

- intrinsic width / height
- minimum size
- preferred size
- grow / shrink weight
- anchor points
- padding / margin

### 23.3 Embedding policy

When a child view is embedded inside another view:

- scale may be `fit`, `fill`, or `native`
- caption may be hidden or inherited
- theme may be inherited or isolated

---

## 24. Semantic intermediate representation (IR)

GraphScript should compile into a shared IR before rendering.

### 24.1 Why IR matters

IR is what makes cross-domain composition possible.

### 24.2 IR object families

Recommended IR families:

- `ValueNode`
- `TableNode`
- `TraceNode`
- `VisualNode`
- `LayoutNode`
- `TextNode`
- `ShapeNode`
- `ChartNode`
- `FlowNode`
- `SceneNode`
- `EntityNode`
- `InfraNode`
- `EmbedNode`

### 24.3 Render pipeline

1. parse source
2. build AST
3. name resolution
4. type/shape validation
5. execute data/functions/algorithms
6. produce IR
7. layout pass
8. render pass
9. export

---

## 25. Type checking and validation

### 25.1 Validation categories

- syntax errors
- unknown symbol errors
- type mismatch errors
- invalid shape/layout errors
- cyclic composition errors
- missing export/slot errors
- invalid renderer capability errors

### 25.2 Example diagnostics

- `chart "A": x and y have different lengths`
- `embed step1.right = search.chart failed: export 'chart' not found`
- `scene3d output to SVG is unsupported unless rasterize=true`

---

## 26. Standard library recommendations

### 26.1 Math

- `sin`, `cos`, `tan`
- `exp`, `log`, `sqrt`
- `sigmoid`
- `floor`, `ceil`, `round`
- `abs`, `min`, `max`, `clamp`

### 26.2 Data helpers

- `range`
- `linspace`
- `map`
- `filter`
- `reduce`
- `zip`
- `group_by`
- `sort_by`
- `unique`

### 26.3 Table helpers

- `select`
- `join`
- `pivot`
- `summarize`

### 26.4 Layout helpers

- `grid`
- `stack`
- `fit`
- `anchor`

---

## 27. Example: full composition

```graphscript
use chart
use flow
use table

sub SearchModule(arr, target):
  algo BinarySearch(arr, target):
    low = 0
    high = len(arr) - 1
    step = 0

    while low <= high:
      mid = floor((low + high) / 2)

      emit:
        step = step
        low = low
        high = high
        mid = mid
        value = arr[mid]

      if arr[mid] == target:
        return mid
      else if arr[mid] < target:
        low = mid + 1
      else:
        high = mid - 1

      step = step + 1

    return -1

  pseudo "Binary Search":
    function binary_search(arr, target):
      low <- 0
      high <- len(arr) - 1
      while low <= high:
        mid <- floor((low + high) / 2)
        if arr[mid] == target:
          return mid
        else if arr[mid] < target:
          low <- mid + 1
        else:
          high <- mid - 1
      return -1

  chart "Mid Trace":
    source = BinarySearch.trace
    type = line
    x = step
    y = mid
    xlabel = "step"
    ylabel = "mid"

  table "Trace Table":
    rows = BinarySearch.trace

  export chart = "Mid Trace"
  export pseudo = "Binary Search"
  export table = "Trace Table"
  export trace = BinarySearch.trace

component search = SearchModule(arr=[1, 3, 5, 7, 9, 11, 13], target=9)

flow "Binary Search Explanation":
  node a type=start label="Input array + target"
  node b type=process label="Run algorithm"
  node c type=decision label="Target found?"
  node d type=end label="Return index"
  node e type=end label="Return -1"

  a -> b
  b -> c
  c -> d label="yes"
  c -> e label="no"

  embed b.right = search.chart
  embed b.bottom = search.pseudo

page "Search Report":
  layout = grid(columns=2, rows=2, gap=16)
  place search.chart at cell(1, 1)
  place search.table at cell(1, 2)
  place "Binary Search Explanation" at cell(2, 1..2)
```

---

## 28. CLI behavior

Recommended CLI:

```bash
graphscript check demo.gs
graphscript run demo.gs
graphscript render demo.gs -o out/
graphscript export-ir demo.gs -o out/ir.json
graphscript fmt demo.gs
```

Recommended subcommands:

- `check`
- `run`
- `render`
- `fmt`
- `lsp`
- `new`
- `export-ir`

---

## 29. File conventions

Recommended file conventions:

- one main module per file
- reuse shared themes/components through imports
- examples under `examples/`
- plugin/provider modules under `modules/`

Recommended naming:

- file names: `kebab-case.gs`
- component names: `PascalCase`
- variables: `snake_case`
- chart/page titles: human-readable strings

---

## 30. Formatting rules

To keep the language easy to use, the formatter should enforce:

- 2-space indentation
- one blank line between top-level blocks
- aligned map values when practical
- consistent quote style per file
- stable ordering of imports and `use`

---

## 31. Extension system

### 31.1 Plugin model

A plugin may provide:

- new block types
- new functions
- new renderers
- new icon packs
- new validators
- new provider domains

### 31.2 Candidate official plugins

- `infra.aws`
- `infra.k8s`
- `quantum`
- `signal`
- `ml`
- `network`
- `timeline`

---

## 32. Future versions

### v0.1

- core syntax
- data/functions
- chart
- flow
- pseudo
- algo + trace
- table
- page
- sub/embed
- svg/png/html export

### v0.2

- ERD
- infra generic + AWS
- improved layout engine
- formatter + LSP

### v0.3

- plot3d
- scene3d
- glb/json export
- animation primitives

### v0.4

- plugin SDK
- interactive HTML renderer
- richer domain packs

---

## 33. Project naming recommendation

Use this identity:

### Product name
**GraphScript**

### Tagline
**Composable Visual Scripting for Charts, Diagrams, Algorithms, and 3D**

### Internal technical name
**GScript**

### CLI name
**graphscript**

### File extension
**.gs**

This naming fits your existing repository name and keeps the project easy to discover and remember.

---

## 34. Final language promise

GraphScript should let users do this in one ecosystem:

- describe data
- run algorithms
- capture traces
- draw charts
- explain with flowcharts
- build tables and infographics
- model databases
- draw infrastructure
- render 3D plots and 3D scenes
- compose everything as reusable `sub` modules

That is the defining promise of the language.
