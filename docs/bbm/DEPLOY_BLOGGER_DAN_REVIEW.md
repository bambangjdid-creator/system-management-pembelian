# Deploy Web App "BBM Logistik Pro" ke Blogger + Review Script

**Objek yang diperiksa**

| Item | Nilai |
|---|---|
| Web App URL | `https://script.google.com/macros/s/AKfycbyhfyH9MJ0LXMMVN5UrzNZoTsf54gZZ1G079nBnKjiO1QeYcGyibTRINMDUddOCvuu9/exec` |
| Judul aplikasi (dari `doGet().setTitle`) | `BBM Logistik Pro` |
| Spreadsheet backend | `BBM & ETOLL` — `19RBW5gyngf_f2VW98XL8eW97Jh60d0xTDQRLKNzf480` |
| Folder foto struk | `Foto Struk BBM` — `1BKpQvNUknF2Z_v2wvfldB7GK68Cunc9K` |
| Sumber kode tersimpan di Drive | `KODE.GS BBM APLIKASI.txt` (28 Sep 2026) + `INDEX.HTML BBM APLIKASI.txt` (19 Sep 2026) = snapshot **v7** |
| Tanggal review | 21 Nov 2026 |

---

## 0. Ringkasan untuk yang buru-buru

**Cara deploy ke Blogger** (detail di §1): Web App harus `XFrameOptionsMode.ALLOWALL`, akses `Anyone`, lalu tempel `<iframe>` lewat **HTML view** di Blogger (bukan Compose). Kode siap tempel ada di [`patch/COPY-PASTE-BLOGGER.html`](./patch/COPY-PASTE-BLOGGER.html) — **buka file itu, salin seluruh isinya**, termasuk auto-height supaya tidak ada double scrollbar.

**Hasil review**: aplikasi **berfungsi dan fiturnya kaya**, tapi ada **3 masalah yang harus dibereskan sebelum dipublikasikan di blog publik**:

1. **Tidak ada autentikasi sama sekali** + spreadsheet & folder struk di-share **"anyone with link = Writer"**. Artinya siapa pun yang menemukan URL bisa membaca seluruh data BBM, mengubah angka, bahkan menghapus isi spreadsheet lewat link Drive.
2. **PIN menu Settings (`609215`) ditulis di HTML sisi klien** — bisa dibaca siapa pun via View Source. Ini bukan proteksi.
3. **Nilai transaksi dipercaya mentah dari browser** (harga, volume, odometer, plat, supir). Tidak divalidasi terhadap `MASTER BBM` / `DATA ARMADA` di server, dan tidak ada lock/idempotensi → sudah ada **bukti baris dobel** di sheet (lihat §2.2).

Plus 2 temuan data yang perlu tindakan cepat: **127 transaksi (dari 733) belum punya "TOTAL NOMINAL PENGIRIMAN"** (KPI biaya per pengiriman tidak lengkap) dan **470 baris tanpa link foto struk** (mayoritas data migrasi).

Skor kasar: arsitektur **B−**, UI/UX mobile **B+**, integritas data **C**, keamanan **D**. Bisa dinaikkan ke **B+/A−** dengan patch di §4 (estimasi 1 hari kerja).

---

## 1. Cara deploy ke Blogger (langkah demi langkah)

### 1.1 Konsep dulu (biar tidak salah harap)

Google Apps Script **tidak bisa** "dipasang" langsung sebagai halaman Blogger. Yang dipakai adalah **embed iframe**: halaman Blogger Anda hanya menampilkan bingkai, sementara aplikasi tetap dijalankan Google di domain `script.google.com` → `*.googleusercontent.com`.

Konsekuensi yang perlu Anda tahu:

- URL di address bar tetap `namablog.blogspot.com/...`, tapi **login Google, kamera, dan proses data berjalan di dalam iframe** milik Google.
- Google menampilkan banner kecil *"This application was created by a Google Apps Script user"* di dalam iframe. **Tidak bisa dihilangkan** (bukan bug Anda, itu kebijakan Google untuk aplikasi yang diakses anonim).
- Ada header `X-Frame-Options` yang default-nya **memblokir** iframe. Ini satu-satunya hal wajib di script (`ALLOWALL`) — dan script Anda **sudah** memakainya.
- Kalau iframe hanya mengandalkan tinggi tetap, di HP akan muncul **scrollbar ganda** (scroll di dalam scroll). Solusinya auto-height (§1.5).

### 1.2 Pastikan deployment benar (sumber error #1)

Di editor Apps Script:

1. **Project Settings** → set **Time zone** = `(GMT+07:00) Jakarta`. Jangan dibiarkan default `America/Los_Angeles` — semua jam pengisian BBM akan bergeser 14 jam.
2. **Deploy** → **Manage deployments** → klik ikon pensil pada deployment yang aktif.
3. Pastikan:

   | Setelan | Nilai wajib |
   |---|---|
   | Type | **Web app** |
   | Execute as | **Me (email Anda)** |
   | Who has access | **Anyone** ← *bukan* "Anyone with Google account" |

4. **Version** → pilih **New version** → **Deploy**.

> **Penting:** `Who has access = Anyone with Google account` akan membuat pengunjung blog melihat halaman login Google, dan halaman login Google **menolak tampil di dalam iframe** (`X-Frame-Options: DENY`) → yang muncul di blog cuma kotak putih/"refused to connect". Untuk blog publik, **wajib `Anyone`**.

> **Setiap kali Anda mengubah kode**, deployment lama **tidak** ikut berubah. Harus **New version** lalu Deploy. Ini penyebab paling umum dari "kok di blog masih versi lama?". Kalau memilih **New deployment** (bukan edit), URL `/exec` **berubah** dan harus ditempel ulang di Blogger.

5. Buka URL `/exec` di tab baru, pastikan aplikasi tampil normal (§2.1 memastikan ini).

### 1.3 Tempel di Blogger

> ⚠️ **Jangan tempel link/teks dari dokumen ini.** Yang harus ditempel adalah **isi file** [`patch/COPY-PASTE-BLOGGER.html`](./patch/COPY-PASTE-BLOGGER.html) — dibuka dulu di tab baru, lalu **Ctrl+A → Ctrl+C** (semua, dari `<style>` sampai `</script>`), baru paste ke Blogger. Kalau yang masuk ke Blogger berupa teks seperti `` `patch/blogger-embed.html` `` atau `` `[patch/...]` ``, itu **link markdown**, bukan kode.

**Opsi A — Halaman khusus (rekomendasi untuk aplikasi)**

1. Blogger → **Pages** → **New page**.
2. Beri judul, mis. `Aplikasi BBM`.
3. Di toolbar editor, klik ikon **`< >` (HTML view)**. ⚠️ Jangan tempel di mode **Compose** — Blogger akan meng-escape tag dan iframe muncul sebagai teks.
4. Tempel **seluruh isi** `patch/COPY-PASTE-BLOGGER.html`. Ganti URL `/exec` di dalamnya hanya bila deployment Anda berubah.
5. **Publish** → **View**.
6. Jangan balik ke mode Compose setelahnya. Kalau harus mengedit, selalu lewat HTML view (Compose bisa "merapikan" dan merusak atribut iframe).

**Kalau Anda memakai tombol "Sisipkan cuplikan HTML" (dialog seperti di screenshot)**

Dialog itu mem-paste ke dalam Compose, bukan HTML view, dan biasanya **membuang `<script>`**. Untuk kasus itu pakai [`patch/COPY-PASTE-BLOGGER-tanpa-script.html`](./patch/COPY-PASTE-BLOGGER-tanpa-script.html). Konsekuensinya tinggi iframe tetap (bukan auto-height), jadi di HP ada scroll di dalam scroll — kurang nyaman, tapi aplikasi tetap jalan. Kalau bisa, tetap pakai Opsi A.

**Cara memastikan sudah benar**: di Blogger, klik **Pratinjau**. Kalau yang tampil adalah **kotak berisi kode berwarna abu-abu/teks mentah** (bukan aplikasi), berarti masih di mode Compose. Kalau yang tampil adalah **form "Input BBM" dengan navigasi bawah Dashboard/History/Settings**, berarti benar.

**Opsi B — Postingan**

Sama, hanya lewat **Posts → New post → HTML view**. Kurang ideal karena postingan punya metadata tanggal/label/komentar di sekitarnya.

**Opsi C — Gadget sidebar** (kalau hanya ingin widget kecil)

Layout → Add a Gadget → **HTML/JavaScript** → tempel iframe tinggi ±400px. Tidak cocok untuk aplikasi penuh (lebar sidebar sempit).

### 1.4 Merapikan tampilan (supaya terasa seperti aplikasi, bukan blog)

Di **Theme → Customize → Advanced → Add CSS** (atau Edit HTML), tambahkan:

```css
/* Halaman aplikasi full-width */
.post-body, .post-body.entry-content { max-width: 100% !important; padding: 0 !important; }
.post-title, .post-header, .post-footer,
.share-buttons, .post-labels, .comments, #comments { display: none !important; }
body { overflow-x: hidden; }
```

Lalu di halaman aplikasi, set *Page list* → sembunyikan judul jika perlu.

### 1.5 Auto-height (menghilangkan scrollbar ganda)

Dua bagian, keduanya perlu:

**(a) Di `Index.html` (Apps Script)** — tambahkan sebelum `</body>`, isi file ada di [`patch/index-height-bridge.html`](./patch/index-height-bridge.html):

```html
<script>
(function () {
  var last = -1;
  function post() {
    var h = Math.ceil(document.documentElement.scrollHeight);
    if (Math.abs(h - last) < 8) return;
    last = h;
    try { parent.postMessage({ type: 'bbm:height', height: h }, '*'); } catch (e) {}
  }
  if (window.ResizeObserver) new ResizeObserver(post).observe(document.body);
  window.addEventListener('load', post);
  window.addEventListener('resize', post);
  setInterval(post, 1500);   // jaring-jaring untuk panel yang berubah tanpa resize
})();
</script>
```

**(b) Di halaman Blogger** — listener sudah termasuk di `patch/COPY-PASTE-BLOGGER.html`. Ia hanya menerima pesan dari origin Google:

```js
if (!/^https:\/\/([a-z0-9-]+\.)*googleusercontent\.com$/.test(e.origin)) return;
```

Efeknya: iframe otomatis setinggi konten, halaman Blogger yang scroll, dan tombol back/URL tetap normal — jauh lebih nyaman di HP daripada scrollbar di dalam scrollbar.

### 1.6 Checklist uji setelah publish

| # | Uji | Harapan |
|---|---|---|
| 1 | Buka halaman di **Chrome desktop** (mode incognito, tanpa login Google) | Aplikasi tampil, bukan kotak putih |
| 2 | Buka di **HP Android** (Chrome) | Layout 1 kolom, bottom-nav terlihat |
| 3 | Buka di **iPhone Safari** | idem; kamera muncul saat tombol "Ketuk untuk Kamera" disentuh |
| 4 | Isi 1 transaksi + foto → Kirim | Baris baru di sheet `BBM`, foto masuk folder `Foto Struk BBM` |
| 5 | Refresh halaman | Data baru muncul di History |
| 6 | Cek tampilan **mobile theme** Blogger (pratinjau 📱) | iframe tidak hilang. Jika hilang: Theme → Mobile settings → pilih **Custom** / desktop theme |
| 7 | Buka URL `/exec` **langsung** (bukan lewat blog) | Tetap berfungsi → berarti masalahnya di Blogger, bukan di script |

### 1.7 Kalau muncul pesan error

| Gejala | Penyebab | Solusi |
|---|---|---|
| `Refused to display ... X-Frame-Options: SAMEORIGIN` | Deployment belum versi yang ada `ALLOWALL`, atau Anda melihat deployment lama | Deploy **New version**, hard-refresh (Ctrl+Shift+R) |
| Kotak putih / `accounts.google.com refused to connect` | `Who has access` = "Anyone with Google account", atau user login multi-akun | Ubah ke `Anyone`; uji incognito |
| Halaman tampil tapi tombol tidak bereaksi | Script terpotong Blogger, atau `google.script.run` gagal | Pastikan tempel di HTML view; cek Console (F12) untuk error `google is not defined` |
| `Refused to connect` hanya di kantor/Wi-Fi tertentu | Proxy/firewall memblokir `googleusercontent.com` | Uji di jaringan lain; sediakan tautan "Buka di tab baru" (sudah ada di embed) |
| Perubahan kode tidak muncul | Belum New version | Manage deployments → pensil → New version |

### 1.8 Alternatif yang lebih "pro" (opsional)

Karena Anda punya Vercel terhubung, ada opsi jangka panjang yang lebih baik daripada iframe:

- **Frontend statis di Vercel** (domain sendiri, PWA/installable, tanpa banner Google) + **Apps Script `doPost` sebagai API JSON**. Ini menghilangkan semua masalah `X-Frame-Options` dan banner, dan memungkinkan login sungguhan.
- Syaratnya: `doPost` harus mengembalikan JSON + CORS, dan token auth harus divalidasi di server (lihat §4.1). Ini pekerjaan 2–3 hari, tapi hasilnya jauh lebih rapi.
- Untuk sekarang: **iframe Blogger cukup** — dan aplikasi Anda sudah siap untuk itu karena `ALLOWALL` sudah dipasang.

---

## 2. Bukti yang saya periksa

### 2.1 Aplikasi live

Membuka URL `/exec` menampilkan: judul **BBM Logistik Pro**, navigasi bawah **Dashboard / Input BBM / History / Update DEL TRF / Settings**, kartu KPI (Konsumsi, Biaya, Jarak Tempuh, Efisiensi KM/L, Cost/KM), panel **KPI 1–10** (Load Factor, Produktivitas Supir, Drop Size, Biaya Logistik), tombol **Tanggal Tertukar, Cek Odometer, Rapikan Sheet, Cetak, Unduh PDF/XLSX/CSV/Print**, dan panel multi-update **DEL_UPDATE / TRF_UPDATE** berbasis **NOMOR JURNAL**.

➡️ **Kesimpulan penting:** versi yang **live** jauh lebih baru daripada file `KODE.GS BBM APLIKASI.txt` (v7, 28 Sep 2026) dan `INDEX.HTML BBM APLIKASI.txt` (19 Sep 2026) yang tersimpan di Drive — file itu **tidak memuat** fitur KPI/DEL-TRF/Ritase/Migrasi. Artinya source yang bisa saya baca = **satu generasi di belakang** yang live.

> **Rekomendasi proses:** simpan source terbaru ke repo/Drive setiap selesai edit. Sekarang satu-satunya salinan terbaru ada di editor Apps Script — risiko hilang total kalau project terhapus. Saya sediakan tempatnya: `docs/bbm/` (repo ini).

### 2.2 Kesehatan data (sheet `BBM`)

| Metrik | Nilai | Catatan |
|---|---|---|
| Baris transaksi | **733** | rentang 28 Jan 2026 – 21 Nov 2026 |
| Punya volume (F) & odometer (J) | 733 / 733 | ✅ lengkap |
| Punya pasangan odometer sebelumnya (M/N) | 723 | 10 baris pertama tiap plat → wajar |
| Punya `TANGGAL ISI SEBELUMNYA` (O) | 606 | 127 baris tanpa pasangan |
| Punya `TOTAL NOMINAL PENGIRIMAN` (Q) | **606** | **127 transaksi (17%) tidak terhubung ke sheet `DEL`** → KPI biaya per pengiriman tidak lengkap |
| Punya link foto struk (K) | **263** | **470 baris (64%) tanpa arsip struk** — kemungkinan data migrasi/import lama |
| Duplikat | **1 grup** | `B 9165 TDE / UJANG / 21-11-2026 / 24,52 L / 169.885 KM` muncul **2×** dengan URL struk berbeda → indikasi **double submit** |

Kolom A tersimpan sebagai **serial tanggal asli** (mis. `46347.3847` = 21 Nov 2026 09:14) → perhitungan `MAXIFS`/`TEXT` di kolom L–R bekerja. Ini penting: jangan sampai regresi ke string (§3.4).

### 2.3 Struktur spreadsheet

35 sheet, antara lain: `BBM`, `DEL`, `TRF REF`, `DEL_UPDATE`, `TRF_UPDATE`, `DEL TRF`, `ANALISA`, `MASTER BBM`, `DATA ARMADA`, `DATA SUPIR`, `LOKASI PENGISIAN`, `DATA OUTBOUND`, `MASTER STOCK`, `MASTER KONVERSI`, `E-TOLL`, plus banyak sheet bantu `_LOG_*` / `_SYNC_*` / `Pivot Table *`.

Kolom `BBM` A–R; **kolom L–R diisi formula array** (`=MAP(...)`, `=MAXIFS(...)`, `=TEXT(...)`, `=SUMIFS(DEL!...)`). Aplikasi menulis A–K. Ini **kebetulan aman**, tapi rapuh (lihat §3.6).

### 2.4 Hak akses (ini bagian yang serius)

| Objek | Permission publik |
|---|---|
| Spreadsheet `BBM & ETOLL` | **`anyone` / `writer`** |
| Folder `Foto Struk BBM` | **`anyone` / `writer`** |
| File struk individual | **`anyone` / `writer`** |

Artinya: siapa pun yang pernah menerima link file/folder (link struk juga tersimpan di kolom K dan bisa dibuka siapa saja yang melihat History) dapat **mengedit atau menghapus** data BBM. `setSharing` di script memang mudah, tapi efeknya orang luar bisa **menulis**.

### 2.5 Source yang saya baca

`KODE.GS BBM APLIKASI.txt` — 585 baris, 15 fungsi server: `doGet`, `getDropdownData`, `getDashboardData`, `getHistoryData`, `getDeliveryData`, `simpanData`, `addMasterData`, `editMasterData`, `deleteMasterDataAction`, `saveMasterRow`, `addMasterRow`, `getFolderStruk`, plus helper `getTz_`/`toDateStr_`/`parseDateValue_`.
`INDEX.HTML BBM APLIKASI.txt` — 1.216 baris / 63 KB, 25 method UI.

Kedua file sudah saya simpan (Line Ending dinormalkan) ke [`source/`](./source/) supaya ada arsip yang bisa di-diff.

Catatan: ada **dua** salinan `INDEX` di Drive (34 KB versi 17 Jul, 63 KB versi 19 Sep). Yang 34 KB **rusak**: tabel History punya 7 header tetapi render memakai `trx.harga` sementara `getHistoryData` versi itu **tidak mengirim** field `harga` → `TypeError: Cannot read properties of undefined` saat membuka History. Sudah diperbaiki di versi 63 KB. **Jangan pakai file 34 KB.**

---

## 3. Hasil review script

Severity: **P0** = harus sebelum publikasi · **P1** = minggu ini · **P2** = perbaikan bertahap.

### 3.1 [P0] Tidak ada autentikasi & data terbuka untuk umum

`doGet()` mengembalikan aplikasi penuh untuk siapa pun. Semua fungsi (`getDashboardData`, `getHistoryData`, `editMasterData`, `deleteMasterDataAction`, `simpanData`) dapat dipanggil dari halaman mana pun yang bisa menjalankan `google.script.run` terhadap deployment itu — dan deployment-nya `Anyone`.

Kombinasi dengan §2.4 = **pintu terbuka penuh**: baca semua data, ubah master, kirim transaksi palsu.

**Perbaikan minimum (bukan keamanan penuh, tapi menaikkan ambang drastis):**

1. Di Apps Script, simpan PIN di **Script Properties**, bukan di HTML:
   `PropertiesService.getScriptProperties().setProperty('ADMIN_PIN', '609215')`
2. Fungsi login mengembalikan **token acak** yang disimpan di `CacheService` (TTL 8 jam), dan **semua fungsi tulis** mewajibkan token:
   ```js
   function requireToken_(token) {
     var ok = token && CacheService.getScriptCache().get('sess:' + token);
     if (!ok) throw new Error('Sesi tidak valid. Silakan login ulang.');
     return true;
   }
   ```
3. Pisahkan **deployment publik** (hanya form input, tanpa Settings/History) dan **deployment admin** (`Anyone with Google account` + email allow-list `Session.getActiveUser().getEmail()`), dipakai dari HP Anda saja.
4. Ubah permission spreadsheet & folder: **`anyone` → `reader`**, dan hapus akses publik dari `BBM & ETOLL`. Bila perlu berbagi struk ke pihak luar, pakai link per-file dengan masa berlaku.

> Ini **tidak** membuat aplikasi tahan serangan orang teknis (PIN masih bisa ditebak/di-brute), tapi menghentikan skenario realistis: link tersebar di grup WhatsApp → orang iseng membuka Settings → menghapus master data. Untuk keamanan sungguhan, lihat §1.8.

### 3.2 [P0] PIN admin hardcoded di sisi klien

```
INDEX.HTML:546    if (result.value === '609215') {
```

Satu `Ctrl+U` di browser → PIN terbaca. Ditambah lagi `switchView('settings')` hanya menyembunyikan tampilan; **fungsi server `editMasterData` / `deleteMasterDataAction` tetap bisa dipanggil langsung** tanpa PIN. Jadi "proteksi" ini kosmetik.

**Perbaikan:** validasi PIN di server + token (butir 3.1), dan cabut tombol Settings dari build publik.

### 3.3 [P0] Integritas nilai transaksi: semua dipercaya dari browser

```js
// Code.gs (v7)
const cleanHarga = payload.harga.toString().replace(/[^0-9.-]+/g, "");
const totalHarga = parseFloat(cleanHarga) * parseFloat(payload.volume);
sheet.appendRow([tanggalFormat, payload.plat, payload.supir, payload.spbu,
                 cleanHarga, payload.volume, totalHarga, payload.tipeBBM,
                 payload.jenisBBM, payload.odometer, fileUrl]);
```

Masalah:

- `harga` diambil dari input read-only **di browser**. Read-only bukan proteksi — payload bisa dikirim manual. Harga seharusnya **di-lookup di server** dari `MASTER BBM` berdasarkan `jenisBBM`.
- `plat`, `supir`, `spbu` tidak dicek ada di master (dropdown hanya di klien) → memungkinkan plat `"B 0000 XX"` fiktif yang merusak pivot.
- `volume` / `odometer` tanpa validasi `> 0` dan tanpa cek odometer harus **naik** dibanding transaksi terakhir plat yang sama. (Padahal aplikasi live sudah punya tombol "Cek Odometer" — pastikan validasinya **juga** ada di server.)
- `cleanHarga` regex `[^0-9.-]` meloloskan `"1.2-3"` → `parseFloat` → `1.2` (silent corruption). Begitu juga `"13.600"` gaya Indonesia → terbaca `13.6` (harga jadi Rp 13,6/liter). Ini bug nyata: sheet menyimpan `13600` sebagai **angka** tetapi ditampilkan `Rp13.600`, dan input form selalu teks.
- Tidak ada `LockService` → dua klik "Kirim" beruntun = **dua baris**. Ini kemungkinan besar penyebab duplikat di §2.2.

**Patch siap tempel:** [`patch/Code.gs.additions.gs`](./patch/Code.gs.additions.gs) — berisi `toNum_()` (parser format Indonesia, sudah diuji), `validatePayload_`, `lookupHarga_`, `withLock_`, `isDuplicate_`, dan `simpanData` versi aman.

### 3.4 [P1] Tanggal: row baru disimpan sebagai **teks**, bukan tanggal

```js
const tanggalFormat = Utilities.formatDate(waktu, "GMT+7", "dd/MMM/yyyy"); // STRING
sheet.appendRow([tanggalFormat, ...]);
```

Di source v7 yang tersimpan di Drive, kolom A jadi **teks**. Efek domino di sheet:

| Kolom | Formula | Rusak karena |
|---|---|---|
| O `TANGGAL ISI SEBELUMNYA` | `=MAXIFS($A$2:$A; ...)` | membandingkan teks vs serial tanggal |
| N `JARAK TEMPUH` | `=MAP(L;M; ...)` | hasilnya salah/kosong |
| P `BULAN` | `=TEXT(BBM!A726;"MMMM")` | `TEXT()` atas teks mengembalikan teks apa adanya → "21/Nov/2026" bukan "November" |
| Q `TOTAL NOMINAL PENGIRIMAN` | `=SUMIFS(...">"&O2..."<"&A2)` | rentang tanggal kacau |

**Kabar baik:** data live **sudah benar** — saya cek nilai mentah `BBM!A727` = `46347.3847` (serial tanggal + jam), artinya versi live **sudah** menulis `new Date()`. Jadi ini **regresi yang akan muncul kembali** kalau Anda mengembalikan/menyalin ulang v7 dari Drive.

**Perbaikan:** selalu tulis objek `Date` + set number format kolom A:
```js
sheet.getRange(row, 1).setNumberFormat('dd/MM/yyyy HH:mm');
```

### 3.5 [P1] Analisa efisiensi KM/L bias sistematis

```js
stats.globalVol += row.vol;                       // SEMUA baris
...
if (row.odo > 0) { carsOdoData[plat].push(...) }  // hanya baris ber-odo
...
totalJarak = kmAkhir - kmAwal;                    // hanya dari baris ber-odo
const aktualGlobalKML = calcKML(totalJarakGlobal, stats.globalVol);
```

Pembilang (jarak) hanya dari baris yang punya odometer, penyebut (volume) dari **semua** baris. Di data Anda 10 baris tanpa odo → **KM/L tampil lebih rendah dari kenyataan**, dan status "BOROS/EFISIEN" bisa salah menuduh kendaraan/supir.

Cara benar: hitung per pasangan (`jarak_segmen ÷ volume_segmen`) atau batasi volume ke baris yang punya odo:

```js
// jumlahkan volume hanya untuk record yang punya odo
let volBerOdo = 0;
Object.keys(carsOdoData).forEach(p => carsOdoData[p].forEach(r => volBerOdo += r.vol));
const aktualGlobalKML = calcKML(totalJarakGlobal, volBerOdo);
```

Sekalian: `standarCostKM = stats.globalBiaya / globalStandarJarak` mencampur biaya **seluruh** BBM dengan jarak **standar** sebagian armada — angka ini tidak punya arti fisik. Ganti dengan `globalBiaya / totalJarakGlobal` (Rp/km aktual) dibandingkan `hargaRata2 / standarKML` (Rp/km target).

### 3.6 [P1] Menulis ke kolom formula array (risiko diam-diam)

Kolom L–R sheet `BBM` berisi `=MAP(...)` / `=SUMIFS(...)` (spilled array). Selama aplikasi hanya menulis A–K aman; tapi:

- `appendRow` dengan **lebih dari 11 nilai** akan menabrak kolom L dan memicu `#REF!` (array tidak bisa menimpa).
- Menambah kolom baru di tengah (mis. "Nama Customer") akan menggeser semua formula.

**Perbaikan:** tulis eksplisit per kolom (`getRange(r,1,1,11).setValues([...])`), dan beri komentar header "A–K = input aplikasi, L–R = formula (jangan ditulis)". Idealnya formula dipindah ke sheet `ANALISA`.

### 3.7 [P1] "Soft delete" mencampur flag hapus dengan kolom foto

```js
let isDeleted = maxCol >= 11 ? row[10] : "";   // kolom K = "LINK FOLDER STRUK BBM"
if (... && isDeleted !== "DELETED") { ... }
```

Kolom K adalah **link foto**. Menjadikannya penanda hapus = rawan salah tafsir (dan tidak ada UI untuk menghapus transaksi, jadi flag ini praktis tidak terpakai). `deleteMasterDataAction` juga menghapus seluruh baris termasuk formula kolom F di `DATA ARMADA`.

**Perbaikan:** tambah kolom **S `STATUS_DATA`** (`AKTIF` / `DELETED`) + **T `CREATED_AT`** (timestamp server) + **U `SUMBER`** (`WEB`/`MIGRASI`), lalu filter berdasarkan S. Jangan pakai `clearContent` untuk baris master yang punya formula — set S saja.

### 3.8 [P1] Dashboard mengabaikan baris yang di-"hapus"

`getHistoryData` memfilter `DELETED`, sedangkan `getDashboardData` **tidak**. → dua angka berbeda untuk dataset yang sama. Satukan filter di satu helper.

### 3.9 [P2] Performa

- `getDashboardData` membaca hingga 1000 baris × 10 kolom lalu menghitung ±470 baris logika **setiap kali** dibuka. Di HP dengan data 733 baris ini ~1–3 detik, dan akan makin lambat.
- `getHistoryData`: `getRange(startRow, 1, n, maxCol)` dengan `maxCol = 18` padahal hanya butuh A–K.
- `populate()` melakukan `el.innerHTML +=` di dalam loop (re-parse DOM per item) → gunakan satu string lalu set sekali.

**Perbaikan cepat:** `CacheService.getScriptCache().put('dash', JSON.stringify(res), 300)` dengan invalidasi saat `simpanData`, dan batasi kolom yang dibaca (`Math.min(lastCol, 11)`).

### 3.10 [P2] XSS / HTML injection di sisi klien

```js
html += `<td>${item.data[i] || '-'}</td>`;
htmlForm = `... value="${item[0] || ''}">`;       // tanda kutip memutus atribut
```
Nama supir/plat berasal dari input pengguna dan **tidak di-escape**. Di dalam iframe Apps Script dampaknya terbatas, tapi tetap: nama berisi `"` merusak form edit, dan nama berisi `<img onerror=...>` tereksekusi. Tambahkan satu helper:

```js
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
```
(lengkap di [`patch/Index.html.additions.html`](./patch/Index.html.additions.html))

### 3.11 [P2] Error handling tidak konsisten

7 pemanggilan `google.script.run`, hanya **3** yang punya `withFailureHandler`. Akibatnya kalau server melempar exception, **spinner Swal "Menyimpan…" / "Mensinkronisasi Data…" menggantung selamanya** dan tombol submit tetap `disabled`. Ini yang bikin user menekan tombol lagi → duplikat.

**Perbaikan:** wrapper `run(fn, args)` yang selalu memasang success + failure + `Swal.close()`.

### 3.12 [P2] Upload foto: tidak dikompresi

`reader.readAsDataURL(file)` mengirim foto kamera apa adanya (3–8 MB → base64 +33%). `google.script.run` punya batas ukuran payload; di jaringan operator lambat ini sering timeout, dan Anda menyimpan file besar ke Drive (kuota 15 GB cepat penuh). Kompres di canvas ke sisi terpanjang 1280 px, `quality 0.72` → ±180–350 KB. Snippet ada di patch.

### 3.13 [P2] Lain-lain (cepat)

| Temuan | Perbaikan |
|---|---|
| `SpreadsheetApp.getActiveSpreadsheet()` di **10 tempat** | Ganti `openById(SPREADSHEET_ID)`. `getActiveSpreadsheet()` hanya hidup untuk script **container-bound**; pindah/clone project = semua fungsi gagal |
| `saveMasterRow` / `addMasterRow` (v7) tidak pernah dipanggil UI — UI masih pakai `editMasterData` yang menulis nilai mentah | Wiring UI ke `saveMasterRow`, kalau tidak tanggal SIM/STNK/KIR tersimpan sebagai teks |
| `addMasterData('armada', …)` menulis `[plat,"-","0","0"]` → Standar Min/Max = 0 | Dashboard menandai "NO DATA". Isi default realistis atau wajibkan lewat form |
| `addMasterData` tanpa cek duplikat | Tolak plat/supir yang sudah ada |
| Header `Selisih\n` nyasar di kolom R | Bersihkan; nilainya `#DIV/0!` di banyak baris |
| File `INDEX` 34 KB di Drive (versi lama, rusak) | Hapus / pindahkan ke folder `_arsip` agar tidak terpakai |
| 127 baris tanpa `TOTAL NOMINAL PENGIRIMAN` | Lengkapi relasi ke `DEL` (join by plat + tanggal), atau tandai "BELUM ADA DO" supaya KPI tidak menyesatkan |
| 470 baris (64%) tanpa link foto struk | Data migrasi lama. Jangan tampilkan ikon "bukti" untuk baris tanpa link (hindari tombol rusak) |
| `HARGA PER LITER` di sheet = angka tapi tampil `Rp13.600`; `DATA ARMADA` C/D tersimpan sebagai teks `"7"`, `"10"` | Paksa tipe numerik (`parseFloat`) saat tulis; set format kolom |
| Sheet bantu `_LOG_*`, `_SYNC_*`, `Pivot Table 6/7` bercampur dengan sheet produksi | Sembunyikan/kelompokkan; turunkan risiko salah edit manual |

### 3.14 Catatan lintas-repo

Repo ini (`system-management-pembelian`) **juga** menyimpan Apps Script backend PR/PO di `code.gs` + `GAS_Code.gs.txt` dengan pola keamanan yang sama bermasalahnya:

- `code.gs:93` membandingkan password **plaintext** dari sheet `User_Role`;
- `code.gs:122` endpoint `getUsers` **mengembalikan password** seluruh user ke klien;
- `doGet`/`doPost` tanpa token.

Jadi jangan jadikan `code.gs` sebagai template untuk aplikasi BBM. `SECURITY.md` dan `DEPLOYMENT_CHECKLIST.md` di repo ini sudah menyebut rotasi secret — tambahkan butir "hapus endpoint getUsers / jangan pernah kirim password ke klien" bila Anda menyentuh backend PR/PO lagi.

---

## 4. Patch siap tempel

Semua ada di folder [`docs/bbm/patch/`](./patch/):

| File | Isi | Dipakai di |
|---|---|---|
| `patch/COPY-PASTE-BLOGGER.html` | **Pakai ini.** Markup iframe + auto-height + fallback link, siap disalin seluruhnya | Halaman Blogger (HTML view) |
| `patch/COPY-PASTE-BLOGGER-tanpa-script.html` | Versi tanpa `<script>` untuk dialog "Sisipkan cuplikan HTML" di Compose | Blogger (fallback) |
| `patch/blogger-embed.html` | Sama seperti COPY-PASTE-BLOGGER.html, hanya diberi komentar instruksi di kepala file | referensi |
| `patch/index-height-bridge.html` | Snippet `postMessage` tinggi — siap tempel | `Index.html`, sebelum `</body>` |
| `patch/Code.gs.additions.gs` | `toNum_`, `withLock_`, `validatePayload_`, `lookupHarga_`, `isDuplicate_`, `simpanData` aman, `loginAdmin_`, `requireToken_`, `hitungKMLGlobal_` | Code.gs |
| `patch/Index.html.additions.html` | `esc()`, `BBM.run()` wrapper, kompres foto, versi aman `populate()` / `applyHistoryFilter()` / `submitData()` / `switchView()` | Index.html |
| `source/Code.gs.snapshot-v7.txt` | Arsip source v7 apa adanya (585 baris) | referensi / diff |
| `source/Index.html.snapshot-v7.txt` | Arsip source v7 apa adanya (1.216 baris) | referensi / diff |

Kedua file patch JS sudah lolos `node --check`; `toNum_()` diuji dengan `Rp13.600`, `51,87`, `1.234,56`, `Rp 705.432`.

### Urutan penerapan yang saya sarankan

**Hari 1 (sebelum publikasi ke blog):**
1. Ubah permission spreadsheet + folder struk: `anyone/writer` → **private** (atau `reader` bila perlu).
2. Tempel `Code.gs.additions.gs` → ganti `simpanData` lama.
3. Tambah kolom `S STATUS_DATA`, `T CREATED_AT`; filter dashboard & history pakai S.
4. Deploy **New version**, isi 1 transaksi uji, cek baris baru di sheet.

**Hari 2:**
5. Terapkan token admin (§3.1) + hapus PIN dari HTML.
6. Tempel `index-height-bridge.html` + `blogger-embed.html` → publish halaman Blogger → jalankan checklist §1.6.
7. Perbaiki rumus KM/L (§3.5) dan konfirmasi angka dashboard "sebelum vs sesudah" (selisih wajar muncul — itu koreksi bias, bukan kerusakan).

**Minggu 1:**
8. Kompres foto, wrapper `run()`, `esc()`, `openById`, wiring `saveMasterRow`.
9. Lengkapi 127 transaksi tanpa `TOTAL NOMINAL PENGIRIMAN`.
10. Arsipkan `INDEX` 34 KB + simpan source terbaru ke `docs/bbm/source/`.

---

## 5. Yang perlu Anda putuskan

1. **Akses publik:** boleh siapa pun mengisi BBM (supir di lapangan)? Kalau ya → form publik, tapi dashboard/settings wajib di belakang token. Kalau tidak → semua di belakang login.
2. **Struk publik?** Folder struk sebaiknya **tidak** bisa diakses publik (§2.4). Kalau perlu dibagikan, pakai link per-file.
3. **Blogger vs Vercel:** tetap iframe (cepat, hari ini) atau migrasi frontend ke Vercel (lebih profesional, 2–3 hari)?
4. **Source of truth:** mau saya rekonstruksi `docs/bbm/source/Code.gs` + `Index.html` dari versi live (butuh Anda ekspor dari editor Apps Script, karena yang live lebih baru dari file di Drive)?

Kirim saja file terbaru dari Apps Script (Code.gs + Index.html) — saya bisa lanjut memberi patch baris-per-baris yang persis, bukan berdasarkan snapshot v7.
