# Spec 010: Browser / Frontend CDN Support

## Prompt

Buat library graphscript bisa dipakai di frontend/browser, seperti cara Three.js, D3.js, atau Chart.js dipakai: user cukup include script dari CDN atau download, lalu langsung bisa parse dan render diagram/chart/flow di HTML. MathJax di-load dari CDN terpisah, SVG saja untuk output (tidak perlu PNG/JPG di browser).

## Tujuan

1. Menghasilkan browser bundle (ESM + UMD) yang bisa di-include via `<script>` tag atau `import`
2. Distribusi via CDN (unpkg/jsdelivr) sehingga user cukup satu baris include
3. API yang clean dan sederhana untuk frontend usage: `parse()` → `evaluate()` → `render()` → SVG string
4. MathJax loaded via CDN secara terpisah, dengan helper dari library untuk mempermudah loading
5. Node.js CLI tetap berfungsi normal (zero breaking change)

## Kenapa Tujuan Ini Penting

1. **Adopsi lebih luas**: Library visual scripting seharusnya bisa dipakai langsung di web page, bukan hanya CLI
2. **Demo / documentation**: Lebih mudah menunjukkan kemampuan library via live demo
3. **Interaktivitas**: User bisa mengintegrasikan graphscript ke web app mereka (dashboard, editor, dll)
4. **Standard industri**: Library grafis modern (Three.js, D3, Chart.js) semua support browser first

---

## Codebase Context

### Arsitektur Pipeline

```
Source (.gs) → Tokenizer → Parser → AST → Evaluator → Values → Renderer → SVG String → File (Node) / DOM (Browser)
```

### Node.js Dependencies yang Di-abstraksi

| File | Dependency | Solution |
|---|---|---|
| `src/renderer/index.ts` | `fs`, `path`, `sharp`, `Buffer` | `getPlatform()` global + `renderToString()` |
| `src/renderer/latex/math-svg.ts` | `child_process`, `@mathjax/src` | `MathRenderer` adapter pattern |
| `src/renderer/diagram/image.ts` | `fs`, `path` | `getPlatform()` global |
| `src/renderer/validator/report.ts` | `fs`, `path` | `instanceof NodePlatform` check |
| `src/runtime/builtins.ts` | `path.extname` | Inline browser-safe `extname()` |

---

## Perubahan yang Diimplementasi

### 1. Platform Abstraction Layer

**File baru:**
- `src/platform/interface.ts` — `Platform` interface (readFile, fileExists, resolvePath, joinPath, dirname, extname, basename)
- `src/platform/node.ts` — `NodePlatform` wraps `fs` + `path`, tambah `ensureDir()`, `writeFile()`, `readFileSyncBuffer()`
- `src/platform/browser.ts` — `BrowserPlatform` virtual filesystem via `Map<string, string>` + `registerFile()`
- `src/platform/global.ts` — `getPlatform()` / `setPlatform()` singleton pattern

**Kenapa:** Mengabstraksi semua file I/O sehingga renderer tidak perlu tahu apakah ia jalan di Node atau browser.

### 2. MathJax Adapter Layer

**File baru:**
- `src/renderer/latex/math-renderer.ts` — `MathRenderer` interface
- `src/renderer/latex/math-node.ts` — `NodeMathRenderer` (child process, existing logic)
- `src/renderer/latex/math-browser.ts` — `BrowserMathRenderer` (global `MathJax.tex2svg()`)

**File diubah:**
- `src/renderer/latex/math-svg.ts` — Refactor jadi delegator ke `MathRenderer` via `getMathRenderer()` / `setMathRenderer()`

**Kenapa:** MathJax adalah library browser. Di Node, project ini memakai child process trick karena tidak ada DOM. Di browser, bisa langsung pakai `MathJax.tex2svg()` — lebih natural.

### 3. Renderer Output Abstraction

**File diubah:**
- `src/renderer/index.ts` — Tambah `renderToString()` yang return `RenderResult[]` (browser-safe). `render()` tetap write file (Node-only, throw error di browser).

**Public API baru:**
```typescript
interface RenderResult {
  svg: string;
  name: string;
  type: string;
  validation?: ValidationReport;
}
```

**Kenapa:** Browser tidak punya filesystem. Output harus string SVG yang bisa di-inject ke DOM.

### 4. Browser Entry Point

**File baru:**
- `src/browser.ts` — `GraphScript` class (main entry point untuk browser)
- `src/browser/load-mathjax.ts` — `loadMathJax(cdnUrl?)` helper

**Public API:**
```typescript
class GraphScript {
  constructor(options?: { mathJaxCdn?: string; baseDir?: string; renderOptions?: RenderOptions })
  loadMathJax(cdnUrl?: string): Promise<void>
  registerFile(path: string, content: string): void
  parse(source: string): Program
  evaluate(program: Program): { values, traces }
  render(source: string, options?: RenderOptions): Promise<RenderResult[]>
}
```

**Kenapa:** User tidak perlu tahu tentang Tokenizer, Parser, Evaluator. Mereka cukup `new GraphScript().render(source)`.

### 5. Rollup Build Pipeline

**File baru:**
- `rollup.config.mjs` — Rollup bundler configuration
- `tsconfig.browser.json` — TypeScript config untuk browser (lib includes DOM)

**Output:**
```
dist/browser/
├── graphscript.js          # UMD build (~546KB)
├── graphscript.min.js      # UMD minified (~373KB)
├── graphscript.esm.js      # ESM build (~502KB)
├── graphscript.esm.min.js  # ESM minified (~372KB)
├── browser.d.ts            # TypeScript declarations
└── .../*.d.ts              # Module declarations
```

**Kenapa:** Rollup adalah standar industri untuk library bundling (Three.js, D3, Chart.js). Output paling bersih, tree-shaking terbaik.

### 6. Other Changes

- `src/runtime/builtins.ts` — Replace `path.extname` dengan inline browser-safe helper
- `src/renderer/diagram/image.ts` — Use `getPlatform()` global instead of `fs`/`path`
- `src/renderer/validator/report.ts` — Use `instanceof NodePlatform` check, no-op di browser
- `package.json` — Add `module`, `browser`, `types`, `exports`, `files`, new scripts

---

## File Summary

### File Baru (10)
| File | Lines | Purpose |
|---|---|---|
| `src/platform/interface.ts` | 12 | Platform interface |
| `src/platform/node.ts` | 52 | Node.js platform implementation |
| `src/platform/browser.ts` | 65 | Browser virtual filesystem |
| `src/platform/global.ts` | 10 | Platform singleton |
| `src/platform/index.ts` | 4 | Barrel export |
| `src/renderer/latex/math-renderer.ts` | 5 | MathRenderer interface |
| `src/renderer/latex/math-node.ts` | 43 | Node MathJax adapter |
| `src/renderer/latex/math-browser.ts` | 43 | Browser MathJax adapter |
| `src/browser.ts` | 52 | Browser entry point |
| `src/browser/load-mathjax.ts` | 30 | MathJax CDN loader |

### File Diubah (6)
| File | Change |
|---|---|
| `src/renderer/index.ts` | Add `renderToString()`, `RenderResult`, platform-aware file output |
| `src/renderer/latex/math-svg.ts` | Refactor to MathRenderer adapter |
| `src/renderer/diagram/image.ts` | Use `getPlatform()` global |
| `src/renderer/validator/report.ts` | Use `instanceof NodePlatform` check |
| `src/runtime/builtins.ts` | Browser-safe `extname()` helper |
| `package.json` | New fields + scripts + devDependencies |

### Config File Baru (2)
| File | Purpose |
|---|---|
| `rollup.config.mjs` | Rollup bundler configuration |
| `tsconfig.browser.json` | Browser TypeScript configuration |

---

## Usage Examples

### ESM Import
```html
<!DOCTYPE html>
<html>
<head><title>GraphScript Demo</title></head>
<body>
  <div id="container"></div>
  <script type="module">
    import { GraphScript, loadMathJax } from 'https://cdn.jsdelivr.net/npm/graphscript/dist/browser/graphscript.esm.js';

    await loadMathJax();

    const gs = new GraphScript();
    const result = await gs.render(`
      chart temperature
        title "Monthly Temperature"
        bar 30, 35, 28, 40, 38
    `);

    document.getElementById('container').innerHTML = result[0].svg;
  </script>
</body>
</html>
```

### UMD Script Tag
```html
<script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js"></script>
<script src="https://cdn.jsdelivr.net/npm/graphscript/dist/browser/graphscript.min.js"></script>
<script>
  const gs = new GraphScript.GraphScript();
  gs.render(source).then(results => {
    document.getElementById('container').innerHTML = results[0].svg;
  });
</script>
```

### npm install + Bundler
```typescript
import { GraphScript, loadMathJax } from 'graphscript';

await loadMathJax();
const gs = new GraphScript();
const results = await gs.render(source);
document.body.innerHTML = results[0].svg;
```

### With Image Virtual Filesystem
```html
<script type="module">
  import { GraphScript } from 'graphscript';
  const gs = new GraphScript();

  const imgResponse = await fetch('assets/circuit.png');
  const imgBase64 = await imgResponse.arrayBuffer();
  const b64 = btoa(String.fromCharCode(...new Uint8Array(imgBase64)));
  gs.registerFile('assets/circuit.png', `data:image/png;base64,${b64}`);

  const result = await gs.render(`
    diagram vqe
      image preview src=image("assets/circuit.png") x=10 y=10 w=200 h=100
  `);
  document.getElementById('container').innerHTML = result[0].svg;
</script>
```

---

## Build Commands

```bash
# Node.js build (CLI)
npm run build

# Browser build
npm run build:browser

# Both
npm run build:all

# Browser + minified
npm run build:browser:min

# Typecheck
npm run check            # Node tsconfig
npx tsc --noEmit -p tsconfig.browser.json  # Browser tsconfig
```

---

## Verification

### Build
- [x] `npm run build` — Node CLI compiles without error
- [x] `npm run build:browser` — Browser bundle generated (ESM + UMD)
- [x] `npm run build:browser:min` — Minified bundles generated
- [x] `npm run check` — Node typecheck passes
- [x] `npx tsc --noEmit -p tsconfig.browser.json` — Browser typecheck passes
- [x] `node dist/cli.js --help` — CLI still works

### Bundle Sizes
| File | Size |
|---|---|
| `graphscript.esm.js` | 502KB |
| `graphscript.esm.min.js` | 372KB |
| `graphscript.js` (UMD) | 546KB |
| `graphscript.min.js` (UMD) | 373KB |

### Node CLI Regression
- [x] `node dist/cli.js render examples/hello-chart.gs -o output --format svg` — unchanged

---

## Manual Testing Plan

### Test 1: Basic Chart di Browser
```html
<script type="module">
  import { GraphScript } from './dist/browser/graphscript.esm.js';
  const gs = new GraphScript();
  const result = await gs.render('chart test\n  bar 10, 20, 30');
  document.getElementById('app').innerHTML = result[0].svg;
</script>
```

### Test 2: Flow Chart di Browser
```html
<script type="module">
  import { GraphScript } from './dist/browser/graphscript.esm.js';
  const gs = new GraphScript();
  const result = await gs.render(`
    flow algorithm
      start "Start"
      process "Process Data"
      end "End"
      start -> process -> end
  `);
  document.getElementById('app').innerHTML = result[0].svg;
</script>
```

### Test 3: Diagram dengan MathJax CDN
```html
<script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js"></script>
<script type="module">
  import { GraphScript, loadMathJax } from './dist/browser/graphscript.esm.js';
  await loadMathJax();
  const gs = new GraphScript();
  const result = await gs.render(`
    diagram math-test
      formula h value="E = mc^2" x=10 y=10
  `);
  document.getElementById('app').innerHTML = result[0].svg;
</script>
```

### Test 4: UMD Global
```html
<script src="dist/browser/graphscript.min.js"></script>
<script>
  const gs = new GraphScript.GraphScript();
  gs.render('chart test\n  bar 10, 20, 30').then(r => {
    document.getElementById('app').innerHTML = r[0].svg;
  });
</script>
```

---

## Acceptance Criteria

- [x] `npm run build:all` berhasil tanpa error
- [x] `npm run check` (typecheck Node) lulus
- [x] `npx tsc --noEmit -p tsconfig.browser.json` (typecheck Browser) lulus
- [x] Node CLI (`node dist/cli.js render ...`) tetap berfungsi normal
- [x] UMD bundle tersedia (`dist/browser/graphscript.js`)
- [x] ESM bundle tersedia (`dist/browser/graphscript.esm.js`)
- [x] Minified bundles tersedia
- [x] `GraphScript.GraphScript` tersedia sebagai UMD global
- [x] `renderToString()` mengembalikan `RenderResult[]` dengan SVG string
- [x] `loadMathJax()` helper untuk load dari CDN
- [x] `registerFile()` untuk virtual filesystem
- [x] TypeScript declarations tersedia (`dist/browser/browser.d.ts`)
- [x] Bundle size < 400KB minified
- [x] Zero breaking change pada Node CLI
