# Handoff 007: Parser Module Refactor + Runtime Legacy Cleanup

## Prompt Ringkas
Refactor lanjutan file panjang dengan kualitas kode tinggi, update dokumentasi kode internal, dan jadikan rule max-lines sebagai guard permanen anti-regression.

## Outcome Utama
- Parser `src/parser/**` sudah direfaktor dari file monolitik ke modul terfokus.
- File parser legacy yang obsolete sudah dihapus.
- File runtime legacy `packages/runtime/src/evaluator/*` yang tidak terpakai sudah dihapus.
- Guard allowlist max-lines diperbarui agar sinkron dengan baseline terbaru.
- Dokumentasi engineering (`spec/003`, `README`, `SKILLS`) diperbarui sesuai struktur kode baru.

## Perubahan Kode

### 1) Split parser line-based (`src/parser/**`)
Ditambahkan:
- `src/parser/declaration-parser.ts` (orchestrator deklarasi)
- `src/parser/declaration-parser-basic.ts` (use/import/const/data/func/theme/style/sub/component/algo/pseudo)
- `src/parser/declaration-parser-visual.ts` (chart/flow/diagram/table/plot3d/scene3d)
- `src/parser/declaration-parser-domain.ts` (erd/infra/page/render)
- `src/parser/statement-parser.ts` (statement suite untuk `func` dan `algo`)
- `src/parser/declaration-ops.ts` (kontrak antar modul parser)
- `src/parser/line-utils.ts` (helper parsing expression/indent/string/loc)
- `src/parser/line-types.ts` (`LineInfo`)

Diubah:
- `src/parser/index.ts` menjadi entrypoint ringan yang hanya:
  - membentuk line stream,
  - menjalankan `DeclarationBlockParser`,
  - membentuk `Program` location.

Dihapus:
- `src/parser/declarations.ts`
- `src/parser/statements.ts`
- `src/parser/statement-block.ts`

### 2) Runtime cleanup (`packages/runtime`)
Dihapus (tidak dipakai oleh wiring evaluator baru):
- `packages/runtime/src/evaluator/execution.ts`
- `packages/runtime/src/evaluator/scope-builtins.ts`
- `packages/runtime/src/evaluator/types.ts`

## Perubahan Guard & Dokumentasi

### Guard script
Diubah:
- `scripts/check-max-lines.ts`
  - remove allowlist:
    - `src\parser\index.ts`
    - `src\parser\declarations.ts`
    - `src\parser\statements.ts`

### Dokumentasi internal
Diubah:
- `spec/003-refactor-file-size-max-300-lines.md`
  - baseline `packages/**` >300 diperbaiki (`none`)
  - status progress parser/runtime diperbarui
  - roadmap phase C ditandai selesai
- `README.md`
  - arsitektur parser diperbarui ke modul baru
  - langkah “adding new renderer” kini menunjuk `declaration-parser-*.ts`
- `SKILLS.md`
  - daftar file parser diperbarui
  - pola “adding new declaration type” diperbarui ke modul parser baru

## Catatan Kualitas & Risiko
- Refactor bersifat struktural (split module), bukan rewrite grammar.
- Parser behavior dipertahankan lewat pemindahan logika parsing yang setara.
- Terdapat modul parser lama yang sudah dihapus untuk mencegah drift/duplikasi.

## Validasi
- Eksekusi command lint/check/test di environment ini masih terblokir karena `pwsh.exe` tidak tersedia.
- Perlu dijalankan lokal:
  1. `npm run check:max-lines`
  2. `npm run lint`
  3. `npm run check`
  4. `npm run test`

## Next Recommended Steps
1. Lanjut Phase D refactor `src/renderer/**` (`flow.ts`, `graph.ts`, `latex/render.ts`, `diagram/render.ts`, `validator/issues.ts`, `validator/semantic-issues.ts`).
2. Setelah split tiap file renderer:
   - update allowlist `scripts/check-max-lines.ts`,
   - update `spec/003` progress baseline.
