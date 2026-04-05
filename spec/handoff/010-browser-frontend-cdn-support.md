# Handoff 010: Browser / Frontend CDN Support

## Session Info
- Date: 2026-04-05
- Task: Membuat graphscript bisa dipakai di frontend/browser via CDN atau npm install
- Status: Completed

## Ringkasan Hasil

GraphScript sekarang bisa dipakai di browser. User cukup include script tag atau ESM import, lalu langsung render diagram/chart/flow ke SVG string yang bisa di-inject ke DOM.

**Yang sudah jadi:**
- Browser bundle ESM + UMD (unminified + minified) di `dist/browser/`
- Platform abstraction layer untuk mengabstraksi Node.js filesystem
- MathJax adapter layer (Node child process vs Browser global MathJax)
- `renderToString()` method yang return SVG string (browser-safe)
- `GraphScript` class sebagai clean API entry point untuk browser
- `loadMathJax()` helper untuk auto-load MathJax dari CDN
- `registerFile()` untuk virtual filesystem (image loading di browser)
- Rollup build pipeline
- TypeScript declarations untuk browser API
- Node CLI tetap berfungsi normal (zero breaking change)

## Build Output

```
dist/browser/
├── graphscript.js          # UMD (~546KB)
├── graphscript.min.js      # UMD minified (~373KB)
├── graphscript.esm.js      # ESM (~502KB)
├── graphscript.esm.min.js  # ESM minified (~372KB)
├── browser.d.ts            # Entry type declarations
└── **/*.d.ts               # Module declarations
```

## File yang Dibuat

### Platform Layer
- `src/platform/interface.ts` — Platform interface
- `src/platform/node.ts` — NodePlatform (wraps fs + path)
- `src/platform/browser.ts` — BrowserPlatform (virtual filesystem Map)
- `src/platform/global.ts` — getPlatform() / setPlatform() singleton
- `src/platform/index.ts` — Barrel export

### MathJax Adapter
- `src/renderer/latex/math-renderer.ts` — MathRenderer interface
- `src/renderer/latex/math-node.ts` — NodeMathRenderer (child process)
- `src/renderer/latex/math-browser.ts` — BrowserMathRenderer (global MathJax)

### Browser Entry
- `src/browser.ts` — GraphScript class (main entry)
- `src/browser/load-mathjax.ts` — loadMathJax() CDN helper

### Build Config
- `rollup.config.mjs` — Rollup bundler config
- `tsconfig.browser.json` — Browser TypeScript config

## File yang Diubah

- `src/renderer/index.ts` — renderToString(), RenderResult, platform-aware output
- `src/renderer/latex/math-svg.ts` — MathRenderer adapter pattern
- `src/renderer/diagram/image.ts` — getPlatform() global
- `src/renderer/validator/report.ts` — instanceof NodePlatform check
- `src/runtime/builtins.ts` — Browser-safe extname()
- `package.json` — New fields (module, browser, exports, files, scripts)
- `tsconfig.json` — Exclude browser files from Node build

## Verification

```bash
npm run build              # Node CLI — OK
npm run build:browser      # Browser bundle — OK
npm run build:browser:min  # Minified bundles — OK
npm run check              # Node typecheck — OK
node dist/cli.js --help    # CLI still works — OK
```

## Known Limits

1. **MathJax harus di-load terpisah** — User perlu include MathJax CDN atau panggil `loadMathJax()` sebelum render formula
2. **PNG/JPG export tidak tersedia di browser** — Hanya SVG output. Konversi ke raster bisa dilakukan user via Canvas API atau library lain
3. **Image loading via virtual filesystem** — User harus `registerFile()` atau fetch + base64 encode untuk images
4. **`fs`, `path`, `child_process` muncul sebagai unresolved warnings di Rollup** — Expected, karena browser code path tidak pernah meng-import modul-modul tersebut
5. **Node.js CLI `render()` tetap menulis file** — `renderToString()` adalah method baru untuk browser usage

## Lanjutan yang Bisa Dilakukan

1. Tambah `examples/browser-demo.html` sebagai live demo
2. Integrasi dengan bundler framework (React/Vue/Svelte component wrapper)
3. Tambah Canvas-based PNG/JPG export untuk browser
4. Publish ke npm agar bisa di-install via `npm install graphscript`
5. Setup GitHub Pages untuk live demo
