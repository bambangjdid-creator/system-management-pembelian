# Folder audit & patch — Aplikasi BBM (Apps Script → Blogger)

Semua isi folder ini dihasilkan dari audit pada **21 Nov 2026** terhadap:

- Web App live: `https://script.google.com/macros/s/AKfycbyhfyH9MJ0LXMMVN5UrzNZoTsf54gZZ1G079nBnKjiO1QeYcGyibTRINMDUddOCvuu9/exec` ("BBM Logistik Pro")
- Spreadsheet `BBM & ETOLL` (`19RBW5gyngf_f2VW98XL8eW97Jh60d0xTDQRLKNzf480`)
- Salinan source di Drive: `KODE.GS BBM APLIKASI.txt` + `INDEX.HTML BBM APLIKASI.txt` (snapshot v7)

> ⚠️ **Penting:** aplikasi yang **live** lebih baru daripada file source di Drive. File v7 di folder `source/` **tidak memuat** fitur KPI 1–10, `DEL_UPDATE`/`TRF_UPDATE`, dan tombol "Tanggal Tertukar / Rapikan Sheet". Patch di sini dibuat terhadap v7, jadi **verifikasi dulu** sebelum menimpa `Code.gs` yang live.

## Isi folder

| File | Keterangan |
|---|---|
| [`DEPLOY_BLOGGER_DAN_REVIEW.md`](./DEPLOY_BLOGGER_DAN_REVIEW.md) | **Mulai dari sini.** Panduan deploy ke Blogger (§1) + hasil review lengkap dengan bukti (§2–§3) + urutan penerapan patch (§4) |
| `patch/COPY-PASTE-BLOGGER.html` | **Pakai ini.** Salin seluruh isinya ke Blogger (HTML view) |
| `patch/COPY-PASTE-BLOGGER-tanpa-script.html` | Versi ringkas untuk dialog "Sisipkan cuplikan HTML" (Compose) |
| `patch/blogger-embed.html` | Versi berkomentar dari file di atas |
| `patch/index-height-bridge.html` | Snippet `postMessage` tinggi, ditempel di `Index.html` sebelum `</body>` |
| `patch/Code.gs.additions.gs` | Fungsi validasi, lock, lookup harga, `simpanData` aman, token admin |
| `patch/Index.html.additions.html` | Helper `esc()`, wrapper `run()`, kompres foto, versi aman beberapa method UI |
| `source/Code.gs.snapshot-v7.txt` | Arsip source v7 (585 baris) untuk diff |
| `source/Index.html.snapshot-v7.txt` | Arsip source v7 (1.216 baris) untuk diff |

## 3 hal yang paling mendesak

1. Cabut permission publik **`anyone / writer`** dari spreadsheet `BBM & ETOLL` dan folder `Foto Struk BBM`.
2. Hapus PIN `609215` dari HTML; validasi di server (`loginAdmin_` + `requireToken_`).
3. Ganti `simpanData()` dengan versi bervalidasi + `LockService` di `patch/Code.gs.additions.gs`.

Detail lengkap beserta alasannya ada di dokumen utama.
