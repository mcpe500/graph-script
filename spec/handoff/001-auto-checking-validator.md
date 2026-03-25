# Handoff: Readability Overhaul untuk Semantic Diagram 4.16

## Session Info
- Date: 2026-03-25
- Task: Implement engine-first readability overhaul untuk semantic diagram dan validator, lalu benahi Figure 4.16 sampai lolos validasi tanpa overlap.
- Status: Completed

## Ringkasan Hasil
Engine semantic diagram, pipeline LaTeX, validator, CLI report, dan source Figure 4.16 sudah diperbaiki bersama-sama. Figure 4.16 sekarang:
- memakai semantic DSL yang lebih bersih,
- formula shorthand dirender benar,
- connector tidak memotong panel lain,
- lolos `check` dengan `readabilityScore: 100`,
- menghasilkan SVG final di `output-viz/Gambar 4.16 - Pengukuran Hamiltonian VQE.svg`.

## Masalah Awal yang Ditemukan
Masalah user valid. Root cause yang benar-benar ditemukan di codebase:
- shorthand formula menghasilkan TeX rusak seperti `\\\sum`, `\\\psi`, `\c_{i}`,
- semantic row layout masih bisa overflow,
- card pendek ikut setinggi row penuh bila satu row berbagi dengan card span tinggi,
- connector orthogonal memilih midpoint rata-rata dan bisa menembus panel lain,
- validator salah membaca geometri `text` dan `formula`,
- `check --validation-report` sempat menulis metrics mentah declaration, bukan hasil compile semantic.

## File yang Diubah

### Core Engine
- `src/renderer/latex.ts`
- `src/renderer/diagram-semantic.ts`
- `src/renderer/validator.ts`
- `src/renderer/diagram.ts`
- `src/cli.ts`

### Figure Source
- `temp/fig-4-16-vqe-measurement.gs`

### Tests
- `tests/renderer/diagram-latex.test.ts`

### Docs
- `spec/001-auto-checking-validator.md`
- `spec/handoff/001-auto-checking-validator.md`

## Perubahan Penting per File

### `src/renderer/latex.ts`
- Menambah dan merapikan auto-normalization shorthand math/quantum.
- Menghindari duplikasi backslash pada command yang sudah benar.
- Menormalkan:
  - `<H>`
  - `<P_i>`
  - `Sum_i`
  - `theta_opt`
  - `|psi(theta)>`
  - `S^dagger -> H`
- Measurement dan render rich text/formula sekarang konsisten untuk semantic compiler dan renderer final.

### `src/renderer/diagram-semantic.ts`
- Semantic compile sudah async dan measurement-based.
- `group`, `divider`, `spacer` dipakai sebagai child container yang sah.
- Row layout sekarang fallback ke stack kalau kontennya terlalu lebar.
- Gambar diskalakan proporsional saat width dibatasi.
- `card.w` sekarang benar-benar dihormati.
- Card non-span tidak lagi dipaksa setinggi row penuh.
- Connector memilih route orthogonal dengan scoring terhadap obstacle panel lain.
- Label connector minimum dinaikkan ke `14px` untuk konsistensi readability.

### `src/renderer/validator.ts`
- Validator memakai semantic snapshot hasil compile.
- Bounding box untuk `text` dan `formula` kini anchor-aware dan baseline-aware.
- Toleransi kecil ditambahkan untuk menghindari warning palsu akibat floating point gap.
- `minElementSize` tidak lagi dipenalti oleh text/formula.
- Penalti/suggestion berbasis `elementCount` dilunakkan supaya diagram semantic kompleks tapi rapi tidak dihukum otomatis.

### `src/cli.ts`
- `check` sekarang memakai `validateAndAdjust(..., 0)` agar report JSON konsisten dengan semantic layout final.
- Metrics yang tampil di console dan file report sekarang sejalan.

### `temp/fig-4-16-vqe-measurement.gs`
- Ditulis ulang ke semantic DSL dua-lajur yang mengikuti referensi `output_vqe/vqe_diagram_book.pdf`.
- Struktur final:
  - header
  - separator 2-way
  - classical lane: Hamiltonian -> Energy -> Optimizer -> Output
  - quantum lane: Ansatz, State, Measurement besar
  - loop label di tengah
  - connector biru dan hijau dengan route final yang bersih

## Verifikasi yang Sudah Dilakukan

### Build / Typecheck
```bash
bun run check
bun run build
```
Status:
- Passed

### Validation / Render 4.16
```bash
bun dist/cli.js check temp/fig-4-16-vqe-measurement.gs --validation-report -o output-viz
bun dist/cli.js render temp/fig-4-16-vqe-measurement.gs --validation-report --output output-viz
```
Status:
- Passed

### Hasil Final Validasi
- Declaration: `Gambar 4.16 - Pengukuran Hamiltonian VQE`
- `success: true`
- `readabilityScore: 100`
- `issues: []`

Artefak final:
- `output-viz/Gambar 4.16 - Pengukuran Hamiltonian VQE.svg`
- `output-viz/Gambar 4.16 - Pengukuran Hamiltonian VQE-validation.json`

## Test Runner Status
Masalah runtime Jest masih ada dan belum terselesaikan di environment ini.

Command:
```bash
bun run test -- --runInBand
```

Hasil:
- gagal sebelum test suite berjalan,
- error: `TypeError: Attempted to assign to readonly property.`

Artinya:
- verifikasi unit/integration lewat Jest belum bisa dipakai sebagai sinyal regresi,
- sinyal yang dipakai pada sesi ini adalah `tsc`, CLI `check`, dan CLI `render`.

## Catatan Lanjutan
Kalau sesi berikutnya ingin melanjutkan generalisasi engine, area paling logis untuk diteruskan adalah:
1. Memecah `diagram-semantic.ts`, `validator.ts`, dan `latex.ts` ke modul lebih kecil sesuai arahan spec refactor yang sudah ada.
2. Menambah snapshot-based regression test untuk output semantic diagram jika runtime test environment sudah stabil.
3. Menambahkan visual fixture tambahan selain 4.16 agar connector routing dan row fallback tidak hanya tervalidasi pada satu diagram.
