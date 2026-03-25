# Spec: Engine Readability Overhaul untuk Semantic Diagram dan Validator

## Prompt
User meminta perbaikan menyeluruh pada engine, bukan patch manual per gambar. Masalah utamanya:
- semantic diagram 4.16 sulit dibaca,
- ada formula shorthand yang tidak dirender benar,
- ada overlap dan awkward spacing,
- validator bisa memberi hasil yang tidak konsisten dengan visual final.

Target implementasi:
- semantic diagram harus memakai jalur ukur dan render yang sama untuk text dan math,
- layout harus lebih stabil untuk diagram akademik dua-lajur,
- connector tidak boleh menembus panel lain,
- validator harus membaca geometri hasil compile semantic, bukan asumsi mentah,
- `fig-4-16-vqe-measurement.gs` harus ditulis ulang ke syntax semantic yang lebih masuk akal.

## Tujuan
1. Membuat semantic renderer menghasilkan layout yang readable secara default.
2. Menyatukan measurement dan rendering untuk rich text dan formula.
3. Mendeteksi issue readability berdasarkan geometri final yang benar.
4. Menyediakan authoring path yang lebih bersih untuk diagram kompleks seperti 4.16.

## Mengapa Perubahan Ini Diperlukan
Masalah sebelumnya bukan satu bug tunggal. Ada beberapa akar masalah yang saling terkait:
- normalisasi math shorthand menghasilkan TeX rusak seperti `\\\psi` dan `\\\sum`,
- formula dan text di semantic layout diukur dengan asumsi yang tidak selalu sama dengan render final,
- row layout bisa memaksa child overflow atau memaksa card pendek ikut setinggi row penuh,
- connector memilih midpoint rata-rata yang bisa memotong panel lain,
- validator memperlakukan `text` dan `formula` seolah `x,y` selalu pojok kiri atas, padahal anchor/baseline-nya berbeda,
- report CLI `check` sempat memakai metrics mentah dari declaration, bukan hasil compile semantic.

## Codebase Context

### File Utama yang Terkait
- `src/renderer/diagram-semantic.ts`
  Pre-layout semantic untuk `header`, `separator`, `lane`, `card`, `connector`, `loop_label`, serta child container `group`, `divider`, `spacer`.
- `src/renderer/latex.ts`
  Measurement dan rendering rich text / formula berbasis MathJax, plus auto-normalization shorthand quantum/math.
- `src/renderer/validator.ts`
  Readability validation, overlap/overflow detection, connector-crossing check, math fallback detection, dan auto-relayout.
- `src/renderer/diagram.ts`
  Renderer diagram final yang memanggil semantic compiler async.
- `src/cli.ts`
  Command `check` dan `render` untuk validasi/report/output final.
- `temp/fig-4-16-vqe-measurement.gs`
  Source Figure 4.16 yang sekarang menjadi consumer utama semantic DSL.

### Deklarasi Semantic yang Dipakai
- `header`
- `separator labels=[...]`
- `lane section=... ratio=... columns=...`
- `card section=... row=... col=... row_span=...`
- `group layout="stack|row|columns"`
- `divider`
- `spacer`
- `connector from="card.anchor" to="card.anchor"`
- `loop_label`

## Perubahan Logic yang Diimplementasikan

### 1. Measurement/Render Parity untuk Text dan Math
`latex.ts` sekarang menyediakan satu jalur utilitas yang dipakai semantic compiler dan renderer final:
- `measureRichTextBlock`
- `renderRichTextBlock`
- `measureDisplayFormula`
- `renderDisplayFormula`
- `normalizeFormulaForLatex`
- `normalizeRichTextForLatex`

Normalisasi shorthand yang sekarang didukung:
- `<H>` -> `\langle H \rangle`
- `<P_i>` -> `\langle P_i \rangle`
- `Sum_i` -> `\sum_{i}`
- `theta_opt` -> `\theta_{opt}`
- `|psi(theta)>` -> `|\psi(\theta)\rangle`
- `S^dagger -> H` -> `S^\dagger \rightarrow H`

Aturan penting:
- jika input sudah mengandung TeX eksplisit (`\...`, `$...$`, `\(...\)`, dst), normalizer tidak mengubah lagi,
- fallback plain text tetap boleh terjadi jika MathJax gagal, dan validator bisa mendeteksinya sebagai `math_fallback`.

### 2. Semantic Container yang Lebih Tahan terhadap Overflow
`diagram-semantic.ts` sekarang:
- mengukur card berdasarkan content final, bukan wrap heuristik terpisah,
- mendukung `group`, `divider`, `spacer`,
- memakai row layout yang bisa fallback ke stack jika total lebar child melebihi container,
- mempertahankan rasio gambar saat width perlu dikecilkan,
- menghormati `w` pada `card`, sehingga author bisa membuat kartu lebih sempit dari slot lane,
- tidak lagi memaksa card `row_span = 1` ikut setinggi row penuh.

Efek praktisnya:
- ansatz/state panel tidak lagi menjadi kartu kosong tinggi hanya karena measurement card di lane yang sama lebih tinggi,
- row image+formula di measurement panel tetap muat tanpa saling dorong.

### 3. Connector Routing yang Sadar Obstacle
Connector orthogonal sekarang tidak hanya memilih midpoint rata-rata.

Logic baru:
- generate beberapa kandidat route: `auto`, `hvh`, `vhv`, `hv`, `vh`,
- hitung corridor bebas berdasarkan panel lain yang overlap terhadap span route,
- score setiap kandidat dengan:
  - jumlah crossing panel,
  - total panjang path,
  - jumlah turn,
- pilih path dengan score terbaik.

Hasil yang diharapkan:
- connector `measurement -> energy` memilih corridor tengah yang tidak memotong `ansatzCard` atau `stateBox`,
- route tetap orthogonal dan konsisten secara visual.

### 4. Validator Sekarang Bekerja pada Geometri Semantic Final
`validator.ts` di-upgrade untuk memvalidasi hasil compile semantic, bukan elemen authored mentah.

Issue kind yang didukung:
- `overlap`
- `overflow`
- `tight_gap`
- `awkward_spacing`
- `connector_cross_panel`
- `math_fallback`

Perbaikan penting:
- `text` dengan `anchor=middle|end` dihitung dengan left edge yang benar,
- `formula` memakai `x = center` dan `y = baseline`, sehingga validator sekarang mengonversi ke bounding box top-left yang benar,
- toleransi kecil ditambahkan untuk menghindari warning palsu karena floating point gap `21.999999` vs `22`,
- `minElementSize` tidak lagi dipenalti oleh `text` dan `formula`, hanya elemen visual aktual seperti panel/box/image,
- penalti dan suggestion berbasis element count tidak lagi terlalu agresif untuk semantic diagram besar tapi tetap rapi.

### 5. CLI `check` Sekarang Konsisten dengan Validator Semantic
Sebelumnya `check --validation-report` masih bisa menulis metrics dari declaration mentah. Sekarang:
- `check` memakai `validateAndAdjust(..., maxRetries = 0)` untuk report,
- angka yang tampil di console dan file JSON berasal dari semantic snapshot final yang sama,
- report JSON dan output console tidak lagi saling bertentangan.

## Implementasi Figure 4.16

### Struktur Authoring Final
Figure 4.16 ditulis ulang ke semantic DSL dengan struktur:
- `header` full-width
- `separator` 2-way: klasik vs kuantum
- lane kiri:
  - `hamiltonian`
  - `energy`
  - `optimizer`
  - `output`
- lane kanan:
  - `ansatzCard`
  - `stateBox`
  - `measurement` besar di kanan
- `loop_label` di corridor tengah
- connector biru untuk alur utama
- connector hijau untuk variational loop

### Karakteristik Visual Final
- proporsi kanvas mengikuti referensi PDF secara horizontal (`1600 x 920` base, final render tetap dekat proporsi referensi),
- measurement panel dominan di sisi kanan,
- formula `|psi(theta)>`, `<H> = Sum_i c_i <P_i>`, `<ZI>, <IZ>, <ZZ>` dirender sebagai MathJax SVG, bukan italic raw text,
- tidak ada issue overlap/overflow/gap/cross-panel pada hasil validasi final.

## Pseudocode Ringkas

### Semantic Compile
```ts
async function compileSemanticDiagram(elements, width, height):
  if no semantic elements:
    return raw elements

  parse header / separator / lanes / cards / connectors
  measure title + subtitle + formula + image using latex.ts helpers
  resolve lane frames using ratio + padding + gap
  measure cards within lane slots
  if row child width exceeds budget:
    fallback row group -> stack group
  place cards row by row
  route connectors using obstacle-aware orthogonal search
  return compiled low-level elements + min canvas height
```

### Formula Normalization
```ts
function normalizeFormulaForLatex(value):
  if explicit TeX already exists:
    return value
  convert Sum_i -> \sum_{i}
  convert theta_opt -> \theta_{opt}
  convert |psi(theta)> -> |\psi(\theta)\rangle
  convert <...> -> \langle ... \rangle
  convert S^dagger -> S^\dagger
  normalize greek identifiers only when they are actual greek tokens
  return normalized TeX
```

### Validator
```ts
async function validateDiagram(decl):
  compiled = compileSemanticDiagram(decl)
  boxes = extractBoundingBoxes(compiled)
  issues = [
    detectOverlaps(boxes),
    detectOverflow(compiled),
    detectGapIssues(compiled),
    detectConnectorCrossPanel(compiled),
    detectMathFallback(compiled)
  ]
  return score + report
```

## Verification Trace

### Command yang Dipakai
```bash
bun run check
bun run build
bun dist/cli.js check temp/fig-4-16-vqe-measurement.gs --validation-report -o output-viz
bun dist/cli.js render temp/fig-4-16-vqe-measurement.gs --validation-report --output output-viz
```

### Hasil Validasi Final
- Declaration: `Gambar 4.16 - Pengukuran Hamiltonian VQE`
- `success: true`
- `readabilityScore: 100`
- `issues: []`
- Output SVG: `output-viz/Gambar 4.16 - Pengukuran Hamiltonian VQE.svg`
- Validation JSON: `output-viz/Gambar 4.16 - Pengukuran Hamiltonian VQE-validation.json`

## Manual Testing Plan
1. Render Figure 4.16 dan bandingkan visualnya dengan `output_vqe/vqe_diagram_book.pdf`.
2. Jalankan `check --validation-report` dan pastikan JSON tidak memiliki `issues`.
3. Ubah satu formula shorthand, misalnya `theta_opt` atau `<ZI>`, lalu render ulang untuk memastikan MathJax tetap terbentuk.
4. Paksa lane kanan jadi sempit atau ganti `group layout="row"` dengan konten lebih lebar untuk memastikan fallback ke `stack` tetap aman.
5. Ubah connector `measurement -> energy` dan pastikan route tidak menembus panel lain.

## Known Limits
1. Jest di environment ini masih gagal sebelum test suite berjalan (`TypeError: Attempted to assign to readonly property`), jadi verifikasi otomatis penuh masih dibatasi ke `tsc`, `check`, dan `render`.
2. Semantic renderer belum menjadi general-purpose layout engine untuk semua pola diagram; v1 ini masih dioptimalkan untuk diagram akademik dua-lajur dan kasus serupa 4.16.
