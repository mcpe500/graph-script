# Spec 003: Permanent Max-Lines Rule & Refactor Roadmap (src + packages)

## Prompt
Refactor ulang file-file TypeScript yang panjang agar kualitas kode meningkat, modular, dan maintainable, sekaligus menjadikan batas ukuran file sebagai guard rule permanen supaya tidak terulang.

Scope wajib:
- `src/**`
- `packages/**`

Permintaan dokumentasi:
- update dokumentasi kode (internal engineering docs), bukan dokumentasi how-to.

---

## Tujuan
1. Menetapkan standar permanen: file `.ts` tidak boleh tumbuh tanpa kontrol.
2. Menyelesaikan refactor file-file besar yang masih >300 baris.
3. Menjaga kompatibilitas perilaku (no logic drift).
4. Menetapkan mekanisme anti-regression yang bisa dijalankan setiap saat.

---

## Rule Permanen (Wajib)

### Rule 1 — Max 300 lines per file TypeScript
- Target utama: semua `.ts` source file di `src/**` dan `packages/**` <= 300 baris.
- Pengecualian sementara harus eksplisit dan terdaftar di allowlist guard script.
- Allowlist bersifat sementara dan harus terus mengecil.

### Rule 2 — Guard wajib tersedia di repo
- Script guard line-count harus tersedia dan bisa dijalankan lokal:
  - `npm run check:max-lines`
- Script guard menyatakan fail jika:
  - ada file >300 baris yang tidak ada di allowlist,
  - ada entri allowlist yang sudah obsolete (file tidak ada).

### Rule 3 — Quality gate komposit
- Tersedia satu command quality gate:
  - `npm run guard:quality`
- Urutan minimum:
  1. max-lines guard
  2. lint
  3. type-check
  4. tests

### Rule 4 — Refactor safety
- Refactor harus:
  - mempertahankan API publik,
  - mempertahankan perilaku runtime,
  - tidak memperkenalkan dependency cycle baru,
  - menggunakan barrel export bila file dipecah ke submodule.

### Rule 5 — Code documentation mandatory
- Setiap modul hasil split harus memiliki dokumentasi kode internal yang jelas:
  - tujuan modul,
  - tanggung jawab,
  - relasi dependensi penting,
  - catatan design decision bila relevan.

---

## Baseline Aktual (Audit Terbaru)

### File >300 lines di `src/**`
| File | Lines |
|---|---:|
| _(none)_ | - |

### File >300 lines di `packages/**`
| File | Lines |
|---|---:|
| _(none)_ | - |

---

## Status Progress Refactor

### Sudah selesai (historical)
- Split AST types di `src/ast/types/*`
- Split chart renderer di `src/renderer/chart/*`
- Split diagram renderer ke barrel + module (`src/renderer/diagram/*`)
- Split validator/latex/diagram-semantic ke struktur folder awal (masih ada file besar lanjutan)
- Split `packages/runtime/src/evaluator.ts` ke modul:
  - `evaluator.ts` (orchestrator)
  - `evaluator-builtins.ts`
  - `evaluator-ops.ts`
  - `evaluator-top-level.ts`
  - `evaluator-statements.ts`
- Split `packages/parser/src/parser.ts` ke modul parser:
  - `parser.ts` (orchestrator + context bridge)
  - `parser/context.ts`
  - `parser/expressions.ts`
  - `parser/statements.ts`
  - `parser/top-level.ts`
  - `parser/top-level-core.ts`
  - `parser/top-level-flow.ts`
  - `parser/top-level-header.ts`
- Split parser `src/parser/**`:
  - `index.ts` (entrypoint ringan)
  - `declaration-parser.ts` (orchestrator deklarasi)
  - `declaration-parser-basic.ts` (deklarasi inti)
  - `declaration-parser-visual.ts` (chart/flow/diagram/table/plot3d/scene3d)
  - `declaration-parser-domain.ts` (erd/infra/page/render)
  - `statement-parser.ts` (suite statement untuk algo/func)
  - `line-utils.ts`, `line-types.ts`, `declaration-ops.ts` (shared contracts/utilities)
- Hapus file parser legacy yang sudah tergantikan:
  - `src/parser/declarations.ts`
  - `src/parser/statements.ts`
  - `src/parser/statement-block.ts`
- Hapus file runtime legacy yang tidak terpakai:
  - `packages/runtime/src/evaluator/execution.ts`
  - `packages/runtime/src/evaluator/scope-builtins.ts`
  - `packages/runtime/src/evaluator/types.ts`

### Belum selesai (aktif)
- Tidak ada file `.ts` >300 lines tersisa di `src/**` dan `packages/**`.
- Fokus lanjutan: jaga guard permanen, cegah regresi ukuran file.

---

## Roadmap Implementasi (Low Risk → High Risk)

### Phase A — Permanent guard enforcement
1. Tambah `scripts/check-max-lines.ts`
2. Tambah script:
   - `check:max-lines`
   - `guard:quality`
3. Pastikan allowlist awal sesuai baseline aktual.

### Phase B — `packages/**` refactor
1. `packages/ast/src/nodes.ts`
2. `packages/runtime/src/evaluator.ts`
3. `packages/parser/src/parser.ts`

### Phase C — `src/parser/**` refactor
1. ✅ `src/parser/index.ts` (sudah jadi orchestrator ringan)
2. ✅ split parser deklarasi + statement ke modul terfokus
3. ✅ hapus modul parser legacy yang obsolete

### Phase D — `src/renderer/**` medium complexity
1. ✅ `src/renderer/flow.ts` (dipisah ke `flow-layout-*`, `flow-render.ts`, `flow-types.ts`)
2. ✅ `src/renderer/graph.ts` (dipisah ke `graph-layout.ts`, `graph-utils.ts`, `graph-types.ts`)
3. ✅ `src/renderer/latex/render.ts` (dipisah ke `latex/measure.ts`, `latex/math-svg.ts`)
4. ✅ `src/renderer/diagram/render.ts` (dipisah ke `diagram/render-state.ts`, `diagram/render-tree.ts`, `diagram/render-shapes.ts`, `diagram/render-embedded.ts`, `diagram/render-utils.ts`)
5. ✅ `src/renderer/validator/issues.ts` (dipisah ke `validator/issues-core.ts`, `validator/issues-connectors.ts`, `validator/issues-math-fallback.ts`)
6. ✅ `src/renderer/validator/semantic-issues.ts` (dipisah ke `validator/semantic-entries.ts`, `validator/semantic-text.ts`, `validator/semantic-layout.ts`, `validator/semantic-assets.ts`, `validator/semantic-decorative.ts`, `validator/semantic-connectors.ts`)

### Phase E — `diagram-semantic` heavy split
1. ✅ `src/renderer/diagram-semantic/layout.ts` diperkecil menjadi orchestrator.
2. ✅ `src/renderer/diagram-semantic/connectors.ts` diperkecil menjadi orchestrator.
3. ✅ Modularisasi detail `diagram-semantic`:
   - layout split:
     - `layout-cards.ts`
     - `layout-container.ts`
     - `layout-child-measure.ts`
     - `layout-decorators.ts`
   - connectors split:
     - `connectors-priority.ts`
     - `connectors-routing.ts`
     - `connectors-corridors.ts`
     - `connectors-scoring.ts`
     - `connectors-geometry.ts`
     - `connectors-label-placement.ts`
     - `connectors-label-candidates.ts`
     - `connectors-label-geometry.ts`
     - `connectors-route-types.ts`
     - `connectors-constants.ts`

---

## Verification & Acceptance Criteria

### Per phase (wajib)
- [ ] `npm run check:max-lines`
- [ ] `npm run lint`
- [ ] `npm run check`
- [ ] `npm run test`
- [ ] API publik tidak berubah (import path existing tetap valid)
- [ ] Tidak ada perubahan perilaku terdeteksi

### Final acceptance
- [x] Tidak ada file `.ts` >300 lines di `src/**` + `packages/**` (atau semua remaining exception terjustifikasi)
- [x] Allowlist menyusut signifikan dari baseline
- [ ] `guard:quality` lulus
- [ ] Handoff dokumen sesi terbaru ditambahkan di `spec/handoff/`

---

## Anti-Regression Checklist (Harus Dipakai di PR)
- [ ] Menjalankan `npm run check:max-lines`
- [ ] Menjalankan `npm run guard:quality`
- [ ] Tidak menambah exception allowlist tanpa alasan teknis kuat
- [ ] Menambah dokumentasi kode internal untuk modul baru/hasil split
- [ ] Memperbarui status di spec/handoff setelah sesi implementasi selesai

---

## Catatan Implementasi
- Fokus perubahan adalah refactor struktural (ekstraksi modul), bukan rewrite logic.
- Gunakan barrel exports untuk menjaga compatibility import.
- Jika ada bagian kompleks (routing/layout/geometry), split bertahap dengan helper extraction dulu untuk mengurangi risiko.
