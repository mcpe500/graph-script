# 006 VQE Readability Checklist

Status akhir: semua item audit sudah dibenarkan dan diverifikasi melalui build, validation report, render output, dan smoke regression.

## Evidence
- [x] `bun run build`
- [x] `bun dist/cli.js check temp/fig-4-16-vqe-measurement.gs --validation-report -o output_vqe`
- [x] `bun dist/cli.js render temp/fig-4-16-vqe-measurement.gs --validation-report --output output_vqe`
- [x] `bun run smoke:semantic-readability`
- [x] Figure 4.16 final lolos dengan `readabilityScore=100`, `minFontSize=16`, `issues=[]`, ukuran `1600x1000`

## Engine Scope Mapping
- [x] Renderer and typography: `font_family`, deterministic text measurement, contiguous text runs, role-based minimums, spacing defaults
- [x] Semantic layout and connectors: `lane.column_ratios`, compact-width measurement, readable asset minima, cleaner routing, lighter arrowheads
- [x] Validator and acceptance rules: semantic role metadata, hierarchy/readability checks, decorative interference checks, connector label crowding checks
- [x] Figure 4.16 source and assets: rewritten canvas/layout/copy/assets, one canonical final figure retained

## A. Readability / Keterbacaan
- [x] A1. Kepadatan canvas diturunkan lewat kanvas tetap `1600x1000`, lane rebalance, dan pengukuran ulang konten.
- [x] A2. Semua font minimum dinaikkan ke lantai semantik yang terbaca.
- [x] A3. Figure kini scalable dan terbaca pada ukuran default tanpa zoom.
- [x] A4. Hierarki visual dipertegas lewat role-based sizing dan spacing.
- [x] A5. Elemen dekoratif tidak lagi mengalahkan elemen inti.

## B. Judul Utama dan Heading Section
- [x] B6. Spasi judul utama dibenarkan.
- [x] B7. Kerning/spasi judul utama distabilkan dengan text-run tunggal dan font sans-serif default.
- [x] B8. Judul utama tidak lagi dipaksa rapat dalam bar biru.
- [x] B9. Dominansi judul utama diperkuat dengan ukuran minimum header.
- [x] B10. Heading kiri dibenarkan menjadi `Bagian Klasik (Komputer Klasik)`.
- [x] B11. Heading kanan dibenarkan menjadi `Bagian Kuantum (Komputer Kuantum)`.
- [x] B12. Keseimbangan heading kiri-kanan dirapikan melalui lane packing dan separator layout.
- [x] B13. Jarak heading ke konten bawah dibuat lebih lega dan konsisten.

## C. Tipografi Umum
- [x] C14. Default font diagram semantik diganti ke `DejaVu Sans, Arial, sans-serif` untuk keterbacaan yang lebih baik.
- [x] C15. Ketebalan font distandardisasi per role.
- [x] C16. Kontras teks bermasalah diperkuat.
- [x] C17. Jarak antar huruf distabilkan lewat contiguous SVG text runs.
- [x] C18. Jarak antar baris teks kecil diperbaiki lewat role sizing dan block measurement.
- [x] C19. Keseimbangan simbol matematis dan teks biasa dibetulkan.
- [x] C20. Campuran bahasa distandardisasi ke Indonesian-first labels dengan istilah teknis yang tetap tepat.

## D. Penulisan Teks / Typo / Wording
- [x] D21. Semua kata yang menempel tanpa spasi dibenarkan.
- [x] D22. Judul box input dirapikan dan molekul ditulis sebagai math `$H_2$`.
- [x] D23. `Perhitungan Energi` tidak lagi salah spacing.
- [x] D24. `Pengukuran Nilai Ekspektasi` tidak lagi salah spacing.
- [x] D25. Label konvergensi dibenarkan menjadi `Konvergen`.
- [x] D26. Struktur `String Pauli` tidak lagi pecah secara kaku.
- [x] D27. Format keluaran akhir dipecah menjadi dua baris yang natural dan terbaca.

## E. Bagian Klasik
- [x] E28. Formula Hamiltonian diperbesar ke ukuran display yang terbaca.
- [x] E29. Padding internal box input dibenarkan.
- [x] E30. Jarak vertikal judul dan isi pada box input dirapikan.
- [x] E31. Judul box energi dibenarkan spacing dan bobotnya.
- [x] E32. Formula energi kini menjadi fokus utama tanpa dikalahkan typo judul.
- [x] E33. Alignment formula energi dibenarkan secara optik.
- [x] E34. Readability box optimizer diperbaiki total.
- [x] E35. Teks penjelas optimizer diperbesar dan diperkuat kontrasnya.
- [x] E36. Isi box optimizer tidak lagi tenggelam terhadap judul.
- [x] E37. Spacing kata/baris dalam optimizer dirapikan.
- [x] E38. Anotasi metode contoh kini informatif pada ukuran default.
- [x] E39. Box output tidak lagi kosong tetapi sempit; isi didistribusikan ulang.
- [x] E40. Area output dimanfaatkan lebih efisien lewat group stack.
- [x] E41. `E_opt` dan `theta_opt` diperjelas sebagai math yang layak baca.

## F. Bagian Kuantum
- [x] F42. Thumbnail sirkuit ansatz diganti asset resolusi lebih tinggi dan diperbesar.
- [x] F43. Label `Persiapan keadaan U(theta)` diperbesar.
- [x] F44. Ruang kosong box ansatz dioptimalkan.
- [x] F45. Komposisi teks dan gambar pada ansatz diseimbangkan.
- [x] F46. Node state tengah diperkuat sebagai node utama.
- [x] F47. Border dashed hijau state dibuat cukup tegas tanpa menjadi noise.
- [x] F48. Label `|psi(theta)>` diperbesar.
- [x] F49. Sirkuit mini di box state diperbesar agar bukan sekadar dekorasi.
- [x] F50. Posisi state box kini nyambung dengan flow utama secara visual.
- [x] F51. Panel pengukuran dipadatkan ulang tanpa crowding.
- [x] F52. Judul panel pengukuran dibenarkan spacing dan hierarkinya.
- [x] F53. `String Pauli` ditata ulang agar tidak kaku.
- [x] F54. Tiga blok pengukuran diperbesar.
- [x] F55. Label basis/rotasi diperbesar sampai terbaca.
- [x] F56. Ekspresi operator di kanan thumbnail diperbesar dan dirapikan.
- [x] F57. Jarak antar tiga kelompok measurement dioptimalkan.
- [x] F58. Alignment thumbnail dan operator distabilkan lewat row layout baru.
- [x] F59. Distribusi visual panel kanan diseimbangkan dari atas ke bawah.

## G. Panah, Koneksi, dan Flow
- [x] G60. Flow diagram kini terbaca instan dari kiri ke kanan dan atas ke bawah.
- [x] G61. Makna warna panah dikonsolidasikan secara konsisten klasik vs kuantum.
- [x] G62. Routing panah mengurangi siku yang tidak perlu.
- [x] G63. Jalur feedback kiri-tengah diarahkan ulang ke anchor yang natural.
- [x] G64. Label connector dinaikkan ke minimum yang terbaca.
- [x] G65. Panah dari state ke measurement tidak lagi terlalu dominan.
- [x] G66. Transisi ansatz ke state ke measurement dibuat lebih halus.
- [x] G67. Loop klasik-kuantum kini terasa sebagai closed-loop yang rapi.
- [x] G68. Arrowhead diperkecil relatif terhadap stroke.
- [x] G69. Titik masuk panah ke panel measurement kini spesifik dan jelas.

## H. Layout dan Alignment
- [x] H70. Berat kiri-kanan diseimbangkan ulang melalui rasio lane dan column ratios.
- [x] H71. Area kanan bawah tidak lagi kosong secara berlebihan.
- [x] H72. Ruang tengah dimanfaatkan lebih efektif.
- [x] H73. Alignment antar box kiri dirapikan secara optik.
- [x] H74. Ukuran box kiri dibuat lebih konsisten secara modular.
- [x] H75. Box kuantum atas dan panel measurement kini duduk pada grid yang jelas.
- [x] H76. Divider vertikal kini berfungsi sebagai pemisah domain yang bersih tanpa berlebihan.
- [x] H77. Elemen yang dulu terlalu dekat divider kini diberi jarak aman.
- [x] H78. Jarak vertikal antar komponen atas ke bawah diseragamkan.

## I. Visual Artifact / Elemen Gangguan
- [x] I79. Garis diagonal samar di panel kanan tidak muncul lagi pada output final.
- [x] I80. Watermark / teks samar di background dihilangkan dari figure final.
- [x] I81. Background dibersihkan dari sisa layer kerja.
- [x] I82. Residu anotasi samar biru/hijau tidak ikut pada export final.

## J. Konsistensi Desain
- [x] J83. Gaya box, sirkuit, dan anotasi kini menyatu secara visual.
- [x] J84. Ketebalan border box distandardisasi.
- [x] J85. Rounded corner box dibuat konsisten sebagai satu sistem.
- [x] J86. Penggunaan warna biru-hijau didisiplinkan untuk domain klasik vs kuantum.
- [x] J87. Bobot visual formula dan teks penjelas diseimbangkan.

## K. Readiness untuk Presentasi / Publikasi
- [x] K88. Figure aman dipakai pada slide presentasi ukuran normal.
- [x] K89. Figure aman untuk laporan cetak satu kolom dibanding versi awal.
- [x] K90. Figure sekarang layak disebut final figure, bukan draft cleanup.
- [x] K91. Split figure tidak lagi diperlukan; satu canonical Figure 4.16 dipertahankan setelah simplifikasi, rebalance, dan peningkatan engine.
