# PLAN — Perbaikan Modul / Form Terima Barang (Receive)

> Status: **PLAN DISETUJUI & SUDAH DIIMPLEMENTASI** (2026-11-18).
> Bagian §6 mencatat keputusan final; §7 mencatat apa yang sudah dikerjakan + catatan template GR.
> Tanggal: 2026-11-18
> Tujuan: staf gudang klik baris PR berstatus `WAITING RECEIVE` → muncul Form Terima Barang berisi semua list barang pada PR/PO + kolom **Qty Terima**, **Keterangan**, baris **Tanggal Terima**, **Nomor DO**, **No. Polisi Kendaraan**, **Supir**, dan **Nomor GR (generated)**.

---

## 1. Kondisi Saat Ini (Hasil Analisa)

### 1.1 Alur yang sudah ada

```
PR dibuat (WAITING MANAGER APPROVAL)
  → Manager approve → Direktur approve → WAITING CREATED PO
  → Purchase buat PO (POST /api/po) → PO_Header status = WAITING RECEIVE,
    PR_Header status = WAITING RECEIVE + PO_NO terisi
  → Staf gudang klik tombol TERIMA di PR History (PrList.tsx)
  → Modal kecil (max-w-md) → POST /api/po/receive
  → PO_Header status = ALREADY RECEIVE, kolom R–V terisi,
    PR_Header status = ALREADY RECEIVE
```

### 1.2 Form terima saat ini (`src/features/pr/PrList.tsx`)

Modal inline di `PrList.tsx` (bukan komponen terpisah), isinya hanya 5 field:

| Field | State | Wajib? |
|---|---|---|
| Tanggal Terima | `receivedDate` (default hari ini) | Ya |
| No. DO / Surat Jalan | `doNo` | Ya |
| Nama Supir | `driverName` | Ya |
| Nomor Polisi | `licensePlate` | Ya |
| Checker By | `checkerBy` (default nama user login) | Ya |

**Yang belum ada:** list barang, Qty Terima per item, Keterangan per item, Nomor GR.

Tombol TERIMA muncul jika `pr.status === 'WAITING RECEIVE'` dan user adalah
`isAdmin(user) || isPurchase(user) || divisi user cocok dengan divisi PR`
(`PrList.tsx` baris ~209–228).

### 1.3 Backend saat ini (`POST /api/po/receive`, `api/server.ts` ~baris 2984)

- Menerima: `prId, poNo, doNo, driverName, licensePlate, checkerBy, receivedDate`
- Validasi: semua wajib diisi; PO harus ada; PO belum `ALREADY RECEIVE`;
  cek divisi (ADMIN/PURCHASE bebas, selain itu divisi harus cocok).
- Menulis:
  - `PO_Header!J` → `ALREADY RECEIVE`
  - `PO_Header!R:V` → DO_NO, DRIVER_NAME, LICENSE_PLATE, RECEIVED_DATE (DD/MM/YYYY), CHEKER_BY
  - `PR_Header!G` → `ALREADY RECEIVE`
- **Tidak** menulis qty per item, **tidak** membuat nomor GR, **tidak** bisa terima sebagian (sekali terima langsung selesai).

### 1.4 Struktur sheet live ("Aplikasi Pembelian") — hasil cek langsung

| Sheet | Kolom live | Keterangan |
|---|---|---|
| `PR_Header` | A–K (11) | Sesuai docs. Status: 21× `WAITING RECEIVE`, 3× `ALREADY RECEIVE`, sisanya legacy/kosong. |
| `PR_Detail` | A–J + **K = `Qty Terima`, L = `Keterangan`** | Kolom K/L sudah ada headernya tapi belum dipakai aplikasi (kode sebelumnya hanya baca `A2:J`). |
| `PO_Header` | A–Q + **R–X** | R=`DO_NO`, S=`DRIVE_NAME` *(typo, maksudnya DRIVER_NAME)*, T=`LICENSE_PLATE`, U=`RECEIVED_DATE`, V=`CHEKER_BY` *(typo)*, W=`GR_NO`, X=`RECEIVE_BY`. 5 PO sudah terisi R–V. |
| `PO_Detail` | A–G + **H = `QTY_TERIMA`, I = `KETERANGAN`** | A=`POD ID`, B=`PO No`, C=`Item Name`, D=`Unit`, E=`Qty`, F=`Price`, G=`Total Price`. Kolom H/I sudah ada headernya, belum terisi. |
| `User_Role` | A–I | Hanya ~13 dari 96 user yang punya ROLE/DIVISION/ACCESS terisi; sisanya legacy kosong. |
| `Master_Stock` | A–D | Kolom `PRICE` (E) di docs tidak ada di live. |

Catatan data legacy: nomor PR/PO campuran format lama (`PR00003/NGY/I/2026`, `PO/SAU/05/2026/0003`)
dan format baru (`PB-...`, `BL-...`). Generator nomor di kode hanya mengenali format baru —
tidak bentrok, tapi penomoran baru mulai dari 1 lagi. Ada juga baris legacy dengan status kosong
(942 baris di `PR_Header`, 963 di `PO_Header`) — tidak mengganggu karena aplikasi filter by status.

### 1.5 Gap: permintaan vs kondisi sekarang

| Permintaan | Status sekarang |
|---|---|
| Klik baris `WAITING RECEIVE` → form terima | ✅ Sudah ada tombol TERIMA |
| Tampilkan semua list barang PR/PO | ❌ Belum ada — form hanya 5 field header |
| Kolom Qty Terima per item | ❌ Belum ada (header K di `PR_Detail` menganggur) |
| Kolom Keterangan per item | ❌ Belum ada di sheet mana pun |
| Tanggal Terima | ✅ Sudah ada (kolom U) |
| Nomor DO | ✅ Sudah ada (kolom R) |
| No. Polisi Kendaraan | ✅ Sudah ada (kolom T) |
| Supir | ✅ Sudah ada (kolom S) |
| Nomor GR (generated) | ❌ Belum ada — tidak ada konsep GR di kode maupun sheet |

---

## 2. Usulan Kolom Baru di Sheet

Prinsip: **tambah kolom di akhir (append), jangan sisipkan di tengah** — supaya range lama
(`A2:K`, `A2:V`, `A2:G`) tidak bergeser dan data legacy aman.

### 2.1 `PO_Header` — tambah 2 kolom

| Kolom | Header | Isi | Keterangan |
|---|---|---|---|
| **W** | `GR_NO` *(sudah ada di sheet live)* | Nomor Goods Receipt, generated server | Contoh: `GR-NGY000000001-26` (lihat §3.3) |
| **X** | `RECEIVE_BY` *(sudah ada di sheet live, nama header ini yang dipakai)* | Nama user yang klik simpan (dari session) | Beda dengan `CHECKER_BY` (pemeriksa manual di lapangan) |
| **Y** | `GR_PDF_LINK` *(kolom baru)* | Link PDF Berita Acara GR (Drive `GR_PDF` atau `/api/pdf/gr/...`) | Diisi setelah PDF berhasil dibuat |

Kolom R–V yang sudah ada **dipakai ulang apa adanya** (Tanggal Terima, DO, Supir, No. Pol, Checker).

**Typo dibetulkan (keputusan user):** `S` `DRIVE_NAME` → `DRIVER_NAME`, `V` `CHEKER_BY` → `CHECKER_BY`.
Aman karena kode membaca posisi kolom (huruf), bukan nama header — jadi penggantian header
tidak merusak data yang sudah ada.

### 2.2 `PO_Detail` — tambah 2 kolom

| Kolom | Header | Isi |
|---|---|---|
| **H** | `QTY_TERIMA` | Qty yang benar-benar diterima per item |
| **I** | `KETERANGAN` | Keterangan per item (mis. "kurang 2 pcs, retur ke supplier") |

`PO_Detail` adalah sumber kebenaran "qty yang dipesan" (kolom E), jadi Qty Terima paling
tepat disimpan di sini, sejajar per baris item.

### 2.3 `PR_Detail` — pakai kolom yang sudah ada + tambah 1

| Kolom | Header | Isi |
|---|---|---|
| **K** | `Qty Terima` *(sudah ada)* | Mirror dari `PO_Detail!H` untuk kompatibilitas laporan lama |
| **L** | `KETERANGAN` *(baru)* | Mirror dari `PO_Detail!I` |

> **KEPUTUSAN USER: tulis ke keduanya.** `PO_Detail!H:I` = sumber kebenaran,
> `PR_Detail!K:L` = mirror (match per `ITEM_NAME` + `UNIT`) supaya laporan yang membaca
> `PR_Detail!K` ikut terisi. Kalau mirror gagal, penerimaan tetap sukses (hanya warning di log).

### 2.4 Yang TIDAK perlu ditambah

- Tidak perlu sheet baru untuk fase 1 (lihat §4.4 soal opsi sheet GR terpisah untuk fase 2).
- Tidak perlu kolom baru di `PR_Header` — status `WAITING RECEIVE` / `ALREADY RECEIVE` sudah cukup.
- Tidak perlu ubah `Master_Stock` / `User_Role` untuk modul ini.

---

## 3. Logic Baru — Form Terima Barang

### 3.1 Alur pengguna (usulan)

1. Staf gudang buka **PR History**, filter status `WAITING RECEIVE`.
2. Klik tombol **TERIMA** pada baris PR → modal besar **"Penerimaan Barang (Receive PO)"** terbuka.
3. Modal menampilkan info header: No. PR, No. PO, Supplier, Divisi/Gudang, Tanggal PO.
4. Tabel list barang (dari `PO_Detail` untuk PO tersebut):

   | Item Name | Unit | Qty PO | **Qty Terima** (input, default = Qty PO) | **Keterangan** (input teks) |
   |---|---|---|---|---|

5. Di bawah tabel, field header penerimaan:
   - **Nomor GR** — tampil read-only, generated otomatis (preview dari server, final saat simpan)
   - **Tanggal Terima** — date picker, default hari ini
   - **Nomor DO / Surat Jalan** — wajib
   - **Nama Supir** — wajib
   - **No. Polisi Kendaraan** — wajib
   - **Checker By** — wajib, default nama user login
6. Klik **Simpan Penerimaan** → validasi → simpan → status PO & PR jadi `ALREADY RECEIVE` →
   modal sukses menampilkan Nomor GR → list ter-refresh.

### 3.2 Validasi

- Qty Terima per item: angka ≥ 0 dan **≤ Qty PO** (tidak boleh melebihi yang dipesan).
  Qty 0 diizinkan (item tidak datang) — wajib isi Keterangan jika Qty Terima < Qty PO.
- Tanggal Terima, DO, Supir, No. Pol, Checker: wajib (sama seperti sekarang).
- Server tetap menolak jika PO sudah `ALREADY RECEIVE` (anti double-submit).
- Permission tidak berubah: ADMIN/PURCHASE bebas; user gudang hanya divisi yang cocok.

### 3.3 Nomor GR (generated)

Mengikuti pola penomoran yang sudah ada (`BL-000000001-26` untuk PO):

- **Format final (keputusan user):** `GR-[DIV_KODE]000000001-26`
  → contoh `GR-NGY000000001-26`, `GR-PCL000000042-26`.
- Kode divisi dari gudang tujuan PO: `GD NAGOYA`→`NGY`, `GD PONCOL`→`PCL`, `GD CIRACAS`→`CRS`
  (`resolveDivisionCode`); fallback ke `divisionCode` user login, lalu `GEN`.
- Nomor berurutan **per kode divisi + per 2 digit tahun**. Generate di server saat simpan:
  scan `PO_Header!W:W`, ambil nomor `GR-<DIV><9 digit>-<YY>` terbesar yang cocok, +1
  (`nextGrNumber` → `nextGrNumberFromExisting` di `api/gr.ts`).
- Client tidak boleh menentukan nomor GR; server selalu generate. Form hanya menampilkan preview.

### 3.4 Terima sebagian (partial) — keputusan penting

Kondisi sekarang: sekali terima = selesai total. Dua opsi:

| Opsi | Perilaku | Dampak |
|---|---|---|
| **A. Sekali terima (fase 1, rekomendasi)** | Qty Terima dicatat per item, tapi status langsung `ALREADY RECEIVE` walau ada yang kurang. Kekurangan dicatat di Keterangan. | Sederhana, sesuai alur sekarang. Tidak cocok jika barang datang bertahap. |
| **B. Terima sebagian bertahap** | Qty Terima bersifat kumulatif; status tetap `WAITING RECEIVE` sampai semua item terpenuhi; setiap simpan menambah/menimpa qty. Butuh riwayat per pengiriman. | Lebih benar untuk gudang, tapi butuh sheet riwayat GR (fase 2) agar audit per pengiriman jelas. |

**KEPUTUSAN USER: Opsi A — sekali terima (fase 1).** Satu kali simpan → PO & PR langsung
`ALREADY RECEIVE`, walau ada item yang qty terimanya kurang (kekurangan wajib dicatat di
Keterangan item). Struktur data (`PO_Detail!H`) tetap kompatibel bila nanti pindah ke Opsi B:
lanjut fase 2 dengan sheet baru `GR_Header` + `GR_Detail` untuk riwayat per pengiriman.

---

## 4. Rencana Perubahan Teknis

### 4.1 Backend — `api/server.ts`

1. **Mapping & range:**
   - `mapPoHeader`: tambah `grNo` (kolom W), `receivedBy` (kolom X).
   - `mapPoDetail`: tambah `qtyTerima` (H), `keterangan` (I).
   - `loadPoHeaderDetail`: range `PO_Header!A2:X`, `PO_Detail!A2:I`.
   - `toPoApiRow`: sertakan field baru ke frontend.
   - `mapPrDetail` / `loadPrHeaderDetail`: baca `PR_Detail!A2:L` (K = qtyTerima, L = keterangan).
2. **Endpoint baru** `GET /api/po/receive/:poNo` (atau query `?poNo=`):
   - Return header PO + daftar item `PO_Detail` untuk form (sekaligus cek permission divisi).
   - Frontend juga bisa pakai data `poList` yang sudah ada — endpoint ini opsional tapi
     direkomendasikan agar form selalu dapat data terbaru + validasi permission di server.
3. **Perluas `POST /api/po/receive`:**
   - Terima payload baru: `{ prId, poNo, grNo?, receivedDate, doNo, driverName, licensePlate, checkerBy, items: [{ podId, qtyTerima, keterangan }] }`
   - Validasi tiap item: `0 ≤ qtyTerima ≤ qty PO`; keterangan wajib jika kurang.
   - Generate `grNo` di server (`nextGrNumber`), jangan percaya nomor dari client.
   - Tulis `PO_Detail!H:I` per baris item (pakai `rowIndex` dari `findPoHeader` + scan detail).
   - Tulis `PO_Header!R:X` (DO, Supir, No. Pol, Tanggal, Checker, GR_NO, RECEIVED_BY) dan `J` = `ALREADY RECEIVE`.
   - Mirror ke `PR_Detail!K:L` untuk PR terkait.
   - Update `PR_Header!G` → `ALREADY RECEIVE`.
   - Return `{ success, grNo }` supaya frontend bisa tampilkan nomor GR.
4. **Fungsi baru** `nextGrNumber(auth)` — scan `PO_Header!W:W` pola `^GR-(\d+)-(\d{2})$`.

### 4.2 Frontend

1. **Komponen baru** `src/features/receive/ReceiveForm.tsx`:
   - Modal besar (`max-w-4xl`, pakai `src/components/ui/Modal.tsx` yang sudah ada).
   - Tabel item + input Qty Terima/Keterangan, field header, validasi client-side.
   - Submit ke `POST /api/po/receive`, sukses → tampilkan Nomor GR (SweetAlert seperti sekarang).
2. **`src/features/pr/PrList.tsx`**: hapus modal inline lama, tombol TERIMA membuka `ReceiveForm`.
3. **Tipe** (`src/lib/types.ts`): tambah `grNo`, `receivedBy` ke `PurchaseOrder`;
   tambah `qtyTerima`, `keterangan` ke `PurchaseOrder`/`PurchaseRequest`;
   tipe baru `ReceiveItemInput`.
4. **Tampilan hasil terima**: di `src/App.tsx` (preview PO) dan `PoList.tsx`,
   tampilkan Nomor GR + Qty Terima per item di samping info DO/Supir/No. Pol yang sudah ada.
5. **Refresh data** setelah simpan: `fetchPRs()`, `fetchPOs()`, `fetchStats()` (pola yang sudah ada).

### 4.3 Dokumentasi & template

- `docs/SPREADSHEET_SCHEMA.md`: tambah kolom W–X (`PO_Header`), H–I (`PO_Detail`), K–L (`PR_Detail`).
- `templates/google-sheets/PO_Header.csv`, `PO_Detail.csv`, `PR_Detail.csv`: tambah header sesuai §2.
- Checklist migrasi sheet (langkah manual di Google Sheets, sebelum deploy):
  1. `PO_Header`: isi header W=`GR_NO`, X=`RECEIVED_BY`.
  2. `PO_Detail`: isi header H=`QTY_TERIMA`, I=`KETERANGAN`.
  3. `PR_Detail`: isi header L=`KETERANGAN` (K sudah ada).
  4. Deploy kode baru ke Vercel.

### 4.4 Fase 2 (opsional, nanti)

Sheet baru `GR_Header` (GR_NO, PO_NO, PR_ID, tanggal, DO, supir, no. pol, checker, received_by)
+ `GR_Detail` (GR_NO, POD_ID, item, qty terima, keterangan) untuk terima bertahap + audit trail
per pengiriman + cetak Berita Acara / Bukti GR (PDF).

---

## 5. Testing

1. `npm run typecheck` dan `npm run test:run` (vitest) — pastikan tidak ada regresi.
2. Manual dengan 1 PO test berstatus `WAITING RECEIVE`:
   - Buka form → cek list item = isi `PO_Detail` PO tersebut.
   - Isi qty terima penuh → simpan → cek status jadi `ALREADY RECEIVE`, GR_NO terisi, `PO_Detail!H:I` terisi.
   - Coba qty > qty PO → harus ditolak dengan pesan jelas.
   - Coba simpan ulang PO yang sama → harus ditolak ("sudah diterima").
   - Login sebagai user divisi lain → tombol TERIMA tidak muncul / server 403.
3. Cek tampilan Nomor GR di preview PO & PO History.

---

## 6. Keputusan Final (sudah dikonfirmasi user)

| # | Pertanyaan | Keputusan |
|---|---|---|
| 1 | Format Nomor GR | `GR-[DIV_KODE]000000001-26` (contoh `GR-NGY000000001-26`), urut per divisi + tahun |
| 2 | Terima sebagian | **Opsi A — sekali terima** (fase 1); bertahap via sheet GR menyusul di fase 2 |
| 3 | Mirror Qty Terima | Tulis ke `PO_Detail!H:I` **dan** mirror ke `PR_Detail!K:L` |
| 4 | Typo header | Dibetulkan: `DRIVE_NAME`→`DRIVER_NAME`, `CHEKER_BY`→`CHECKER_BY` |
| 5 | Berita Acara GR PDF | Wajib fase 1, ikut template Google Doc `TEMPLATE_GR_ID`, simpan ke folder Drive `GR_PDF` |

---

## 7. Status Implementasi (2026-11-18)

### 7.1 Backend — `api/server.ts`, `api/gr.ts`

- Mapping baru: `PO_Header` W=`grNo`, X=`receivedBy`, Y=`grPdfLink`; `PO_Detail` H=`qtyTerima`, I=`keterangan`; `PR_Detail` K=`qtyTerima`, L=`keterangan`. Range baca: `PO_Header!A2:Y`, `PO_Detail!A2:I`, `PR_Detail!A2:L`.
- Helper GR di `api/gr.ts` (pure, unit-tested): `resolveDivisionCode`, `formatGrNumber`, `parseGrNumber`, `nextGrNumberFromExisting`.
- `GET /api/po/receive/:poNo` — header PO + list item + preview Nomor GR, dengan cek permission divisi.
- `POST /api/po/receive` — payload `items: [{ podId, qtyTerima, keterangan }]`; validasi `0 ≤ qtyTerima ≤ qty PO`; Keterangan wajib bila qty terima < qty order; generate `grNo` di server; tulis `PO_Header!J` + `R:X`; tulis `PO_Detail!H:I`; mirror `PR_Detail!K:L`; set `PR_Header` → `ALREADY RECEIVE`; return `{ success, grNo, grPdfLink }`. Payload lama tanpa `items` tetap didukung (dianggap terima penuh).
- `createGrPdf()` — salin template Google Doc `TEMPLATE_GR_ID` → ganti placeholder → export PDF → simpan `GR_PDF_DIR` → upload ke folder Drive `GR_PDF`; fallback generator PDFKit kalau template/Drive tidak dikonfigurasi.
- `GET /api/pdf/gr/:id` — serve PDF lokal, fallback ambil dari Drive.
- Env opsional baru: `TEMPLATE_GR_ID`, `GOOGLE_DRIVE_GR_FOLDER_ID` (aplikasi tetap jalan tanpa keduanya, GR PDF dilewati/fallback).

### 7.2 Frontend

- Komponen baru `src/features/receive/ReceiveForm.tsx`: modal `max-w-4xl`, tabel item (Nama Barang, Satuan, Qty Order, **Qty Terima**, **Keterangan**), field Nomor GR (read-only), Tanggal Terima, No. DO, Supir, No. Pol, Checker By; validasi client; layar sukses menampilkan Nomor GR + tombol buka Berita Acara GR.
- `src/features/pr/PrList.tsx`: modal inline lama dihapus, tombol TERIMA membuka `ReceiveForm`.
- `src/App.tsx` (preview PO): tampilkan Nomor GR, Diterima Oleh, dan link Berita Acara GR.
- Tipe baru di `src/lib/types.ts`: `ReceiveItem`, `ReceiveFormData`, plus `qtyTerima`/`keterangan`/`grNo`/`receivedBy`/`grPdfLink`.

### 7.3 Docs, template, test

- `docs/SPREADSHEET_SCHEMA.md`: `PO_Header` A–Y, `PO_Detail` A–I, `PR_Detail` A–L.
- `templates/google-sheets/PO_Header.csv`, `PO_Detail.csv`, `PR_Detail.csv`: header lengkap termasuk kolom baru.
- `.env.example`: tambah `TEMPLATE_GR_ID`, `GOOGLE_DRIVE_GR_FOLDER_ID`.
- Test baru `api/__tests__/gr.test.ts` (format, parse, resolve divisi, next number). `npm run typecheck`, `npm run test:run` (15 test), `npm run build` semuanya lolos.

### 7.4 Langkah manual yang masih perlu dilakukan user (di Google Sheets & Drive)

1. `PO_Header`: betulkan header S → `DRIVER_NAME`, V → `CHECKER_BY`; tambah Y=`GR_PDF_LINK`
   (W=`GR_NO` dan X=`RECEIVE_BY` **sudah ada** di sheet live; `PO_Detail!H:I` juga sudah ada).
2. `PO_Detail`: H=`QTY_TERIMA`, I=`KETERANGAN` → sudah ada, tidak perlu diubah.
3. `PR_Detail`: K=`Qty Terima` sudah ada; tambah L=`Keterangan`.
4. Isi `.env` produksi: `TEMPLATE_GR_ID=1G5KmBtleSzv1m7UmtfNrD8H7Fl_1Wc3euiZ-eO1gShM`, `GOOGLE_DRIVE_GR_FOLDER_ID=1HnXsXzcDH1YSwKEArPpx6YZq2kiMVneE`.
5. Share folder `GR_PDF` ke service account (Editor) supaya upload PDF jalan.

---

## 8. Catatan Template GR — mohon diperbaiki di Google Doc

Template `1G5KmBtleSzv1m7UmtfNrD8H7Fl_1Wc3euiZ-eO1gShM` sudah dipakai, tapi ada beberapa hal
yang **sebaiknya diperbaiki di dokumennya**:

| # | Temuan | Dampak | Saran perbaikan |
|---|---|---|---|
| 1 | **Tidak ada placeholder `GR_NO`** | Nomor GR tidak muncul di dokumen | Tambahkan `GR_NO` di header dokumen (mis. "No. GR: GR_NO") |
| 2 | Hanya **10 baris item** (`NO_1`..`NO_10`) | PO dengan >10 item: item ke-11 dst tidak tercetak | Tambah sampai minimal 20 baris, atau beri tahu kalau ingin dipotong + baris "dst." |
| 3 | `DRIVE_NAME` | Typo (maksudnya nama supir) | Ganti jadi `DRIVER_NAME` (kode mendukung keduanya) |
| 4 | `RECEIVE_BY` dipakai 2× (header + tanda tangan) | Kode mengisi dengan user login; kalau maksudnya pemeriksa lapangan beda | Pisahkan: `RECEIVED_BY` (user login) dan `CHECKER_BY` (pemeriksa) |
| 5 | `TANGGAL` ambigu | Bisa berarti tanggal PO atau tanggal terima | Perjelas jadi `TANGGAL_PO` dan `RECEIVED_DATE` (kode mengisi keduanya) |
| 6 | Nama `Bambang Irawan` dan `Purchase Name` hardcoded | Tidak ikut berubah per PO | Ganti dengan placeholder `CHECKER_BY` / `PURCHASE_NAME` |
| 7 | Belum ada placeholder `NO_PR` | Nomor PR tidak tercetak | Tambahkan `NO_PR` bila perlu jejak PR |

Kode sudah mengisi placeholder berikut: `GR_NO`/`NO_GR`, `NO_PO`, `NO_PR`, `TANGGAL`/`TANGGAL_PO`,
`RECEIVED_DATE`, `SUPPLIER`, `DIVISI`, `DO_NO`, `DRIVE_NAME`/`DRIVER_NAME`, `LICENSE_PLATE`,
`RECEIVE_BY`/`RECEIVED_BY`/`CHECKER_BY`, `Purchase Name`, dan baris 1–10 `NO_n`, `NAMA_BARANG_n`,
`SATUAN_n`, `QTY_n`, `GR_n` (qty terima), `KET_n`. Placeholder yang tidak ada di template
otomatis diabaikan, jadi template boleh diperbaiki kapan saja tanpa mengubah kode.
