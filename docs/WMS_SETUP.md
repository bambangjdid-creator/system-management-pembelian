# WMS — Setup & Endpoint (Fase 1)

Dokumen ini menjelaskan apa yang sudah jadi, cara mengaktifkannya, dan apa yang belum.

## 1. Spreadsheet WMS

Sudah dibuat otomatis (18 Nov 2026):

**`WMS Database`** — https://docs.google.com/spreadsheets/d/1DdEeVwZRrPjbxkiWB_UG1O3CdWpw1W8FkkULzMWL_m4/edit

Lokasi folder Drive: `KPI WH Dashboard` → `WMS APLIKASI`

Tab yang ada:

| Tab | Baris | Isi | Diisi oleh |
|---|---|---|---|
| `0_INFO` | 32 | Ringkasan migrasi + daftar keputusan yang menunggu | manual (dibuat sekali) |
| `ITEM_MASTER` | 8.789 | Daftar barang, satuan dasar, harga acuan, saldo awal | migrasi |
| `CATEGORY_MASTER` | 93 | Kategori + default lacak expired | migrasi |
| `UNIT_CONVERSION` | 2.800 | Rantai konversi ke satuan terkecil | migrasi |
| `WAREHOUSE` | 3 | Nagoya, Poncol, Ciracas | migrasi |
| `STOCK_LEDGER` | header | Mutasi stok, append-only | aplikasi |
| `STOCK_BATCH` | header | Batch + tanggal expired | aplikasi |
| `PRICE_HISTORY` | header | Riwayat harga beli/jual | aplikasi |

> Tab `STOCK_LEDGER`, `STOCK_BATCH`, `PRICE_HISTORY` **jangan diisi manual**.
> Stok dihitung sebagai jumlah `QTY_BASE` di ledger, bukan angka yang ditulis langsung.

## 2. Cara mengaktifkan

Tambahkan satu environment variable di Vercel (Project → Settings → Environment Variables):

```
WMS_SPREADSHEET_ID=1DdEeVwZRrPjbxkiWB_UG1O3CdWpw1W8FkkULzMWL_m4
```

Lalu **bagikan spreadsheet WMS ke service account** yang sama dengan spreadsheet PR/PO
(alamatnya ada di env `GOOGLE_SERVICE_ACCOUNT_EMAIL`, hak akses **Editor**).
Tanpa langkah ini endpoint akan balas error 403 dari Google.

Bila variabel dibiarkan kosong, aplikasi tetap jalan seperti biasa dan seluruh
endpoint `/api/wms/*` menjawab **503** dengan pesan yang jelas — tidak ada crash.

## 3. Endpoint yang sudah aktif

Semua memerlukan login (Bearer token), sama seperti endpoint lain.

| Method | Path | Keterangan |
|---|---|---|
| GET | `/api/wms/health` | Cek konfigurasi + tab yang hilang |
| GET | `/api/wms/items` | Cari/list item. Query: `q`, `category`, `limit`, `offset`, `active=0`, `refresh=1` |
| GET | `/api/wms/items/:itemId` | Detail item + rantai konversi + saldo per gudang |
| GET | `/api/wms/conversions` | Master konversi. Query: `q`, `limit`, `offset` |
| GET | `/api/wms/warehouses` | Daftar gudang aktif |
| GET | `/api/wms/categories` | Daftar kategori aktif |

Contoh respons `/api/wms/items/:itemId` untuk `ITM-004945` (A591-K):

```json
{
  "item": {
    "itemId": "ITM-004945",
    "itemName": "A591-K",
    "unitBase": "PCS",
    "buyUnitDefault": "DUS",
    "trackExpiry": true,
    "shelfLifeDays": 365
  },
  "conversions": [
    { "fromUnit": "DUS", "toUnit": "PCS", "toUnitQty": 20, "level": 2 }
  ],
  "stock": { "byWarehouse": {}, "totalBase": 0, "unitBase": "PCS" }
}
```

`stock.byWarehouse` masih kosong karena `STOCK_LEDGER` belum diisi — saldo awal
belum dimasukkan (menunggu file stok per gudang).

## 4. Cache

`ITEM_MASTER` punya 8.789 baris. Membacanya setiap request akan lambat dan memakan kuota
Google Sheets (batas ± 60 request/menit per project). Karena itu:

- Item di-cache **5 menit** di memori proses.
- Paksa baca ulang: tambahkan `?refresh=1` pada `/api/wms/items`.
- Konversi, gudang, dan kategori dibaca langsung (jumlah baris kecil).

## 5. Status Fase 1

| # | Pekerjaan | Status |
|---|---|---|
| 1.1 | Database WMS (`WMS_Database.xlsx`) + migrasi master | Selesai |
| 1.2 | Aturan konversi satuan bertingkat | Selesai |
| 1.3 | Tulis ke `STOCK_LEDGER` + `STOCK_BATCH` saat terima barang | Selesai |
| 1.4 | Form Terima Barang: pilih satuan + batch + expired | Selesai |
| 1.5 | Halaman Stok Gudang + Kartu Stok | Selesai |
| 1.6 | Expiry Monitor (merah/kuning/hijau) | Selesai |
| 1.7 | Master Konversi (layar admin untuk sunting konversi) | Selesai |

### 1.6 Expiry Monitor — `GET /api/wms/expiry`

Membaca `STOCK_BATCH`. Hanya item `TRACK_EXPIRY=Y` yang dipantau; batch milik
item `TRACK_EXPIRY=N` dibuang seluruhnya walau tanggalnya kebetulan terisi.
Ini yang membuat barang tanpa expired tidak pernah muncul sebagai "bermasalah".

| Sisa hari | Status | Warna |
|---|---|---|
| tanggal kosong | `NO_DATE` | merah |
| ≤ 0 | `EXPIRED` | merah |
| 1 – 30 | `CRITICAL` | oranye |
| 31 – 90 | `WARNING` | kuning |
| > 90 | `SAFE` | hijau |

Batch dengan `QTY_REMAIN_BASE` 0 atau `STATUS` bukan `ACTIVE` tidak ditampilkan.
Urutan tabel: `NO_DATE` → `EXPIRED` → `CRITICAL` → `WARNING` → `SAFE`, jadi yang
paling tidak bisa dijadwalkan selalu di atas.

### 1.7 Master Konversi — `GET /api/wms/conversions`, `PUT /api/wms/conversions/:convId`

Layar admin untuk memeriksa `UNIT_CONVERSION`. Setiap baris ditampilkan bersama
**satuan efektif** dan **faktor ke satuan dasar**, sehingga salah tafsir
multipak langsung kelihatan: `@5 SAK` dengan `Qty/ = 5` tampil sebagai
`@5 SAK → 5 SAK` (faktor = `Qty/`, bukan `Qty/ × 5` — lihat §13).

Kolom yang bisa disunting: `FROM_UNIT`, `TO_UNIT`, `TO_UNIT_QTY`, `IS_ACTIVE`,
`NOTES`. Penulisan dilakukan per-baris memakai `CONV_ID` (bukan tulis ulang
seluruh tab) supaya aman bila ada pengguna lain di sheet.

Ditolak sebelum menyimpan: satuan kosong, `TO_UNIT_QTY` ≤ 0, dan relasi 1:1
(`SAK -> SAK` dengan qty 1, yang tidak mengubah apa pun).

Setelah menyimpan, cache saldo dan cache batch dibatalkan paksa. Cache itu
berkunci **jumlah baris**, sehingga perubahan isi tidak otomatis
membatalkannya.

## 6. Hal yang menunggu keputusan pemilik sistem

Tercatat juga di tab `0_INFO`:

1. **44 item berlabel `@25 Kg`** — dihitung per karung atau per KG?
   Sementara `UNIT_BASE = KG`. Contoh: `105 M (25 KG)`, `511 BRAVO (25 KG)`.
2. **Saldo awal per gudang** — kolom `OPENING_QTY_BASE` masih total semua gudang.
   Perlu file Excel stok per gudang (bukan screenshot), format:

   ```csv
   WAREHOUSE_ID,ITEM_ID,QTY,UNIT
   WH-NAG,ITM-004916,29,@25 Kg
   WH-CIR,ITM-004916,8,@25 Kg
   ```
3. **139 item bersatuan besar tapi tanpa konversi** — daftar di `ITEM_MASTER_PERLU_CEK.csv`.
4. **Sebagian item namanya masih berupa kode** — cari `NAMA_BARANG_BELUM_DIISI` di kolom `NOTES`.

## 7. Menjalankan ulang migrasi

Bila sumber iPOSS berubah:

```bash
# 1. taruh ekspor iPOSS di google_drive/
#    - Master Data Stock.xlsx    (tab "MS Details")
#    - Master Data Konversi.xlsx (tab "Sheet")
python3 tools/wms/build_masters.py     # -> CSV di templates/google-sheets/wms/
python3 tools/wms/build_workbook.py    # -> WMS_Database.xlsx (8 tab)
```

Lalu unggah ulang `WMS_Database.xlsx` sebagai Google Spreadsheet baru.
**Jangan timpa spreadsheet yang sudah berisi transaksi** — `STOCK_LEDGER` akan hilang.

## 8. Test

```bash
npm run typecheck    # lolos
npm run test:run     # 21 test, 6 file — termasuk pemetaan WMS
```

`api/__tests__/wms.test.ts` menguji `rowsToObjects` dan `mapWmsItem`: pemetaan header,
pembuangan baris kosong, default aman untuk kolom kosong, dan flag `Discontinue` → `IS_ACTIVE=N`.

---

# 9. Menu Stok Awal Gudang (upload saldo awal)

Menu baru di sidebar: **Stok Awal Gudang** (akses: semua user; admin selalu bisa).
Halaman: `src/features/wms/StockOpeningImport.tsx`.

## Alur

```
Pilih gudang default + tanggal
        ↓
Tarik file .xlsx / .csv
        ↓
Pratinjau (dry run — tidak menulis apa pun)
        ↓
Simpan → baris masuk STOCK_LEDGER sebagai OPNAME_IN
```

Pratinjau menampilkan empat angka: **Siap**, **Perhatian**, **Error**, **Total qty dasar**,
plus tabel per baris dengan status dan alasannya. Bisa difilter per status dan dicari per item.

## Format file

Kolom wajib: `ITEM_ID` dan `QTY`. Sisanya opsional.

| Kolom | Alias yang diterima | Keterangan |
|---|---|---|
| `ITEM_ID` | `ID BARANG`, `KODE BARANG` | `ITM-000001`. Boleh juga kode iPOSS. |
| `ITEM_NAME` | `NAMA BARANG`, `NAMA` | Dipakai bila `ITEM_ID` kosong |
| `QTY` | `STOK`, `QUANTITY` | Angka |
| `UNIT` | `SATUAN` | DUS / SAK / KEMASAN / PCS. Kosong = satuan dasar |
| `BATCH_NO` | `BATCH`, `NO BATCH` | Opsional |
| `EXPIRED` | `EXPIRED_DATE`, `TGL EXPIRED` | Opsional |
| `WAREHOUSE` | `GUDANG`, `KODE GUDANG` | Opsional — untuk file yang berisi banyak gudang sekaligus |

Pemisah kolom boleh **koma atau titik koma** (Excel Indonesia sering memakai `;`).

Contoh:

```csv
ITEM_ID,ITEM_NAME,QTY,UNIT
ITM-004916,511 BRAVO (25 KG),29,KEMASAN
ITM-004945,A591-K,3,DUS
```

`29 KEMASAN` otomatis jadi `725 KG` (1 kemasan = 25 KG), dan `3 DUS` jadi `60 PCS`
(1 DUS = 20 PCS). Konversi diambil dari tab `UNIT_CONVERSION`.

## Aturan keselamatan

1. **Pratinjau tidak menulis apa pun.** Baru setelah tombol *Simpan* ditekan, data masuk.
2. **Tidak ada penyimpanan setengah.** Bila ada 1 baris error, tombol simpan dikunci.
   Perbaiki file dulu, unggah ulang.
3. **Baris error tidak menghasilkan `qtyBase`.** Nilainya 0, jadi tidak mungkin
   masuk ledger meskipun ada bug di lapisan atas.
4. **Ledger append-only.** Saldo awal ditulis sebagai `OPNAME_IN`, bukan menimpa angka.
   Koreksi dilakukan dengan entri lawan, riwayat tetap utuh.
5. **Gudang tak dikenal ditolak.** Tidak ada fallback diam-diam ke gudang pertama.
6. **Qty negatif ditolak** pada saldo awal.

## Pembacaan Excel tanpa library

`src/lib/xlsx.ts` membaca `.xlsx` langsung di browser:

- `.xlsx` adalah arsip ZIP → dibaca manual (End of Central Directory, local headers)
- dekompresi memakai `DecompressionStream("deflate-raw")` native
- `xl/sharedStrings.xml` → tabel string; `xl/worksheets/sheet1.xml` → sel

Tidak ada dependency baru. Ukuran bundle tidak bertambah. Konsekuensinya:

- `.xls` lama (format BIFF) **tidak didukung** — simpan ulang sebagai `.xlsx` atau `.csv`
- penggabungan sel, formula, dan beberapa sheet hanya terbaca dari **sheet pertama**
- bila dekompresi native tidak tersedia, pengguna memakai CSV (Excel tetap bisa membukanya)

## Endpoint

| Method | Path | Fungsi |
|---|---|---|
| POST | `/api/wms/import/opening/preview` | Validasi + pratinjau, tanpa menulis |
| POST | `/api/wms/import/opening/commit` | Tulis ke `STOCK_LEDGER` (maks 12 MB) |
| GET | `/api/wms/import/opening/status` | Ringkasan saldo awal per gudang |

Body: `{ csv, warehouseId, trxDate?, refNo? }`.

## Test

`44 test` di 8 file. Yang mencakup fitur ini:

- `src/lib/__tests__/xlsx.test.ts` — membaca **file .xlsx sungguhan** (fixture openpyxl),
  nama berkoma, tanggal expired, penolakan file bukan ZIP
- `api/__tests__/wms-opening.test.ts` — 17 test: alias header, BOM, kolom wajib,
  konversi DUS→PCS (20×20=400), kemasan 25 KG (29×25=725), satuan tak dikenal,
  pencocokan lewat nama, gudang tak dikenal, qty negatif

Jalankan: `npm run test:run`

---

# 10. Form Terima Barang + pencatatan stok otomatis

Fase 1 no. 1.3–1.4. Berlaku pada `POST /api/po/receive` dan
`src/features/receive/ReceiveForm.tsx`.

## Yang berubah di form

| Sebelum | Sesudah |
|---|---|
| Satuan terkunci mengikuti PO | **Satuan bisa dipilih** (DUS/PCS/BAL) sesuai `UNIT_CONVERSION` |
| Qty terima saja | Qty terima **+ pratinjau konversi** ("3 DUS = 60 PCS") |
| Tidak ada batch | **Batch + tanggal expired**, bisa lebih dari satu |
| Tidak menyentuh stok | **Menulis `STOCK_LEDGER`, `STOCK_BATCH`, `PRICE_HISTORY`** |

Satuan default diambil dari satuan PO bila punya konversi; kalau tidak, satuan dasar item.

## Pencocokan item PO ke WMS

PO/PR menyimpan **nama barang**, sedangkan WMS bekerja dengan `ITEM_ID`. Pencocokan
dilakukan di server saat form dibuka, berurutan:

1. **`ITEM_ID`** persis (`ITM-004945`)
2. **`IPOS_CODE`** persis (`A591-K`)
3. **Nama** yang dinormalkan — huruf besar, spasi dan tanda baca dibuang
   (`511  bravo (25 kg)` cocok dengan `511 BRAVO (25 KG)`)

Bila nama dipakai lebih dari satu item, dianggap **tidak cocok** — lebih baik tidak
mencatat daripada mencatat ke barang yang salah.

Item yang tidak cocok **tidak memblokir penerimaan**. Barang fisik tetap diterima dan
Berita Acara tetap terbit, tetapi:

- stoknya tidak bertambah di WMS
- muncul peringatan kuning di form sebelum disimpan
- namanya disebut di respons `wms.skipped` dan di layar sukses

## Validasi (berjalan sebelum apa pun ditulis)

| Aturan | Pesan bila dilanggar |
|---|---|
| Satuan harus punya konversi | `Satuan "SAK" tidak punya konversi untuk "A591-K". Pilihan: PCS, DUS.` |
| Item `TRACK_EXPIRY=Y` wajib tanggal expired | `Tanggal expired wajib diisi untuk ...` |
| Tanggal harus nyata (bukan 2027-02-30) | `Tanggal expired "..." tidak valid` |
| Total qty per batch = qty terima | `Total qty batch (2) tidak sama dengan Qty Terima (3)` |
| Qty batch > 0 | `Qty batch harus lebih dari 0` |

Urutannya disengaja: **validasi dulu → baru tulis**. Baris 4366 vs 4496 pada
`api/server.ts`. Jadi tidak mungkin ada PO berstatus `ALREADY RECEIVE` dengan ledger
setengah jadi.

## Yang ditulis ke spreadsheet WMS

Contoh: PO 3 DUS A591-K (1 DUS = 20 PCS, expired 2027-05-31), gudang Nagoya.

`STOCK_LEDGER` — satu baris per item:

| Kolom | Nilai |
|---|---|
| `LEDGER_ID` | `GR-GR-NGY000000005-26-001` |
| `TRX_TYPE` | `RECEIVE` |
| `REF_NO` | nomor GR |
| `WAREHOUSE_ID` | `WH-NAG` |
| `QTY_IN` / `TRX_UNIT` | `3` / `DUS` |
| `TO_UNIT_QTY` | `20` |
| `QTY_BASE` | **`60`** |
| `UNIT_COST` | harga PO ÷ 20 |

`STOCK_BATCH` — satu baris per batch, dengan `EXPIRED_DATE` dan `QTY_REMAIN_BASE` = 60.

`PRICE_HISTORY` — `PRICE_TYPE=BUY`, harga dalam satuan transaksi, `SOURCE=PO`.

## Bila penulisan WMS gagal

Penerimaan **tidak dibatalkan** — barang fisik sudah diterima dan Berita Acara sudah
terbit. Kegagalan dilaporkan jujur ke pengguna:

> Stok gudang BELUM tercatat di WMS: &lt;pesan error&gt;. Catat manual atau hubungi admin.

Alasan: membatalkan penerimaan karena Google Sheets bermasalah akan membuat staf gudang
kehilangan pekerjaan yang sudah dilakukan. Lebih baik dicatat sebagai utang kerja.

## Pemetaan divisi ke gudang

| Divisi di PO | `WAREHOUSE_ID` |
|---|---|
| `GD NAGOYA`, `NGY` | `WH-NAG` |
| `GD PONCOL`, `PCL` | `WH-PON` |
| `GD CIRACAS` | `WH-CIR` |
| lainnya | kode divisi apa adanya |

## Multi-batch

Default **satu baris = satu batch**, dengan tombol **Tambah Batch** bila satu kedatangan
punya dua tanggal expired berbeda. Qty batch harus berjumlah sama dengan qty terima —
kalau tidak, tombol simpan ditolak.

Keputusan "satu PO boleh berapa batch" tidak perlu diambil sekarang; form sudah fleksibel
untuk keduanya.

## Test

`71 test` di 10 file. Yang baru:

- `api/__tests__/wms-receive.test.ts` — pemetaan gudang, normalisasi tanggal
  (`31/05/2027` → `2027-05-31`), penolakan `2027-02-30`, pencocokan item
  (ID / kode iPOSS / nama), daftar satuan yang sah
- `src/features/receive/__tests__/receiveItemRow.test.ts` — 3 DUS = 60 PCS,
  satuan dasar faktor 1, qty kosong = 0, qty desimal

---

# 11. Halaman Stok Gudang + Kartu Stok

Fase 1 no. 1.5. Menu **Stok Gudang** (di atas menu Stok Awal Gudang).

## Prinsip: saldo tidak pernah disimpan

Saldo **selalu dihitung ulang** dari `STOCK_LEDGER`. Tidak ada tabel saldo, tidak ada
job sinkronisasi. Ledger bersifat append-only, jadi menjumlahkannya selalu benar — dan
kalau ada selisih, penyebabnya selalu bisa ditemukan di baris ledger.

Konsekuensinya: kalau ada baris ledger yang salah, **perbaiki barisnya** (atau tambah
baris koreksi), jangan mengubah saldo di tempat lain.

## Rumus

```
saldo(item, gudang) = Σ QTY_BASE
```

`QTY_BASE` sudah bertanda: `QTY_IN` positif, `QTY_OUT` negatif. Bila kolom `QTY_BASE`
kosong (data lama), dipakai `(QTY_IN − QTY_OUT) × TO_UNIT_QTY`.

## Tampilan saldo: pilihan C

Angka utama **selalu satuan terkecil**, dengan rincian bertingkat sebagai pelengkap:

| Saldo | Tampil |
|---|---|
| 5 PCS | `5 PCS` |
| 60 PCS | `60 PCS` + `3 DUS / 60 PCS` |
| 260 PCS | `260 PCS` + `1 BAL + 1 DUS / 260 PCS` |
| 265 PCS | `265 PCS` + `1 BAL + 1 DUS + 5 PCS / 265 PCS` |
| 0 | `0 PCS` |
| −25 PCS | `-25 PCS` + `-1 DUS + -5 PCS / -25 PCS` |

Alasan angka terkecil jadi utama: itulah yang tersimpan di ledger, jadi bisa dicocokkan
langsung dengan spreadsheet. Satuan besar hanya kenyamanan membaca.

**Konversi bertingkat** disusun otomatis: `BAL → DUS ×12` dan `DUS → PCS ×20`
menghasilkan `BAL → PCS = 240` tanpa tabel tambahan. Rantai ditelusuri maksimal 8
tingkat agar data yang saling menunjuk tidak membuat server berputar.

## Status baris

| Status | Arti |
|---|---|
| `EMPTY` | saldo ≤ 0 |
| `LOW` | `MIN_STOCK > 0` dan saldo di bawahnya |
| `OVER` | `MAX_STOCK > 0` dan saldo di atasnya |
| `OK` | selain itu |

Kalau `MIN_STOCK` tidak diisi (0), barang **tidak pernah** dianggap LOW. Ini disengaja:
lebih baik diam daripada memunculkan ribuan peringatan palsu untuk barang yang belum
punya batas minimum.

## API

`GET /api/wms/stock?q=&warehouseId=&category=&belowMin=1&limit=&offset=`

```json
{
  "summary": { "rows": 1200, "items": 890, "warehouses": 3, "totalQtyBase": 52000, "lowCount": 14, "emptyCount": 3 },
  "total": 1200,
  "rows": [{ "itemId": "ITM-004945", "warehouseName": "Gudang Nagoya", "qtyBase": 260,
             "display": "1 BAL + 1 DUS / 260 PCS", "status": "OK", "lastTrxDate": "2027-01-10" }]
}
```

`summary` = seluruh stok, `filteredSummary` = setelah filter. Keduanya dikirim supaya
kartu ringkasan tidak berubah-ubah saat pengguna mengetik pencarian.

`GET /api/wms/stock/:itemId/movements?warehouseId=`

Mengembalikan mutasi **terbaru lebih dulu** (sudah dibalik di server), dengan
`runningBase` dihitung dari urutan **kronologis** — bukan urutan baris di sheet, yang
tidak dijamin.

## Kinerja

Ledger tumbuh terus. Tanpa cache, setiap klik filter membaca 8.789 item + seluruh
ledger. Cache 60 detik dengan kunci **jumlah baris ledger**: begitu ada penerimaan baru,
jumlahnya berubah dan cache otomatis dilewati. Jadi tidak ada risiko angka basi setelah
barang masuk.

Bila ledger melewati ±50.000 baris, langkah berikutnya adalah tab ringkasan bulanan —
bukan lagi menghitung seluruh ledger tiap request.

## Filter

- `q` — nama, kode iPOSS, ITEM_ID, atau kategori (tidak peka huruf besar)
- `warehouseId` — satu gudang
- `belowMin=1` — hanya yang di bawah minimum
- Tabel menampilkan 100 baris; tombol di bawah memuat sampai 2.000

## Klik baris → Kartu Stok

Menampilkan riwayat: tanggal, tipe (`OPNAME_IN`, `RECEIVE`, …), referensi (nomor GR /
nomor saldo awal), qty masuk, qty keluar, dan saldo berjalan. Ini yang menjawab
pertanyaan "kenapa stoknya segini?" tanpa membuka spreadsheet.

## Test

`117 test` di 12 file. Yang baru:

- `api/__tests__/wms-stock.test.ts` (40) — konversi bertingkat, pemecahan satuan,
  agregasi per gudang, QTY_BASE kosong, stok minus, status LOW/EMPTY, filter,
  saldo berjalan
- `src/features/wms/__tests__/stockOverview.test.tsx` (6) — halaman benar-benar
  memanggil `/api/wms/stock`, menampilkan angka satuan dasar, rincian bertingkat, dan
  label status

---

# 12. ATURAN KONVERSI SATUAN (dikoreksi 18 Nov 2026)

Bagian ini menggantikan asumsi sebelumnya. Sumber kebenaran: **Master Data Konversi
iPOSS**, bukan tebakan dari nama satuan.

## Cara membaca satu baris konversi

iPOSS menulis tiga kolom: **Satuan | Qty/ | Paket**, dan artinya:

```
1 [SATUAN] = [QTY/] [PAKET]
```

| Satuan | Qty/ | Paket | Arti |
|---|---|---|---|
| BAL | 1 | BAL | BAL adalah satuan terkecil **dan** satuan transaksi |
| SAK | 3 | SAK | 1 transaksi SAK = 3 paket SAK |
| Kg | 25 | BAL | 1 BAL = 25 Kg — jadi **Kg lebih kecil dari BAL** |
| DUS | 20 | PCS | 1 DUS = 20 PCS |

## Yang SALAH sebelumnya

Kode lama menganggap setiap item **selalu** punya satuan besar dan satuan terkecil
terpisah, dan menebak satuan dasar dari nama. Akibatnya:

- **BR11 CP (50 KG)** dipaksa punya satuan dasar PCS
- **CANARY SEED TOYS 25 KG** dipaksa punya satuan dasar PCS
- **BAL** dianggap selalu satuan besar, padahal di banyak item BAL justru satuan terkecil

Tidak ada PCS di master data untuk barang-barang itu. Menampilkan PCS di sana adalah
karangan.

## Aturan yang benar

**Satuan dasar tidak ditentukan oleh namanya, tapi oleh arah relasi.**

Satuan yang selalu muncul sebagai **Paket** dan tidak pernah sebagai **Satuan** adalah
satuan terkecil. Jadi:

- BAL bisa jadi satuan terkecil (BR11 CP) **dan** satuan besar (GALAC ZOO: 1 BAL = 50 Kg)
- SAK bisa jadi satuan terkecil (CANARY SEED) **dan** satuan besar (CCKITTEN: 1 SAK = 20 PCS)

Kode tidak boleh punya daftar "satuan besar" bawaan. Yang menentukan hanya data.

## Bug paling serius: konversi tidak pernah terbaca

| Kolom | Isi |
|---|---|
| `UNIT_CONVERSION.ITEM_ID` | `SPS000023` (kode iPOSS) |
| `ITEM_MASTER.ITEM_ID` | `ITM-000001` |
| `ITEM_MASTER.IPOS_CODE` | **kosong di seluruh 8.789 baris** |

Tidak ada kunci bersama selain **NAMA barang**. Sebelum diperbaiki, pencocokan memakai
`ITEM_ID` sehingga **0 dari 2.634 item** punya konversi — artinya semua PO akan ditolak
dengan pesan "satuan tidak punya konversi".

Sekarang konversi dijembatani lewat nama yang dinormalkan (huruf besar, spasi dan tanda
baca dibuang): `511  bravo (25 kg)` cocok dengan `511 BRAVO (25 KG)`.

**Nama yang dipakai lebih dari satu item sengaja dibuang**, bukan ditebak. Lebih baik
item dianggap tanpa konversi (muncul peringatan) daripada konversi menempel ke barang
yang salah.

## Hasil validasi terhadap master data nyata

Diuji dengan 8.789 item dan 2.800 baris konversi:

| Ukuran | Sebelum | Sesudah |
|---|---|---|
| Item punya konversi | **0** | **2.624** |
| Baris konversi terbaca | 0 | 2.788 |
| Nama ganda (dibuang) | — | 44 |
| Konversi tanpa padanan | — | 12 |
| `UNIT_BASE` master ≠ satuan terkecil tabel | — | **0** |

Selisih nol itu penting: artinya `UNIT_BASE` di `ITEM_MASTER` **memang** sudah diisi
satuan terkecil, dan tabel konversi konsisten dengannya. Jadi tidak perlu migrasi data.

## Dampak ke form Terima Barang

Pilihan satuan per baris sekarang mengikuti aturan ini:

| Barang | Satuan dasar | Yang bisa dipilih |
|---|---|---|
| BR11 CP (50 KG) | BAL | **BAL saja** |
| CANARY SEED TOYS 25 KG | SAK | **SAK saja** |
| GALAC ZOO | KG | KG, BAL, SAK |
| KAPAS 1 LAPIS | PCS | PCS, BAL |

Untuk BR11, memilih BAL berarti faktor 1 — **1 BAL tetap 1 BAL**, tidak dikali apa pun.
Ini yang benar: satuannya memang BAL, bukan 50 PCS.

## Catatan teknis: modul API ditempel, bukan diimpor

`wms-stock.ts` tinggal di `src/lib/` (dipakai test frontend), tetapi `api/server.ts`
**tidak mengimpornya**. Isi modul ditempel langsung ke `api/server.ts` di antara dua
penanda:

```
// Perhitungan stok WMS — SENGAJA DITEMPEL ...
...
// ===================== akhir modul stok WMS
```

Alasannya: Vercel **tidak** memakai `dist/server.cjs`. Vercel meng-compile `api/server.ts`
sendiri menjadi `/var/task/api/server.js` dan hanya mengunggah folder `api/`. Berkas apa pun
di luar `api/` (termasuk `src/lib/`) tidak ikut, sehingga `import '../src/lib/wms-stock'`
berakhir dengan:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/var/task/src/lib/wms-stock'
```

Itulah penyebab `/api/*` 500 pada PR #6 dan #7.

**Aturan keras:** `api/` hanya boleh berisi `server.ts` dan tidak boleh punya import
relatif. Hanya `import` dari `node_modules` yang aman.

### Cara kerja sehari-hari

| Perintah | Fungsi |
|---|---|
| `npm run wms:inline` | tempel ulang `src/lib/wms-stock.ts` ke `api/server.ts` (idempoten) |
| `npm run verify:vercel` | tiru `/var/task`: compile per-berkas tanpa bundling, cek `/api/health` 200 & `/api/wms/stock` 401 |

Dua test menjaga ini: `api/__tests__/no-relative-imports.test.ts` (menolak import relatif
dan berkas tambahan di `api/`) dan `api/__tests__/inlined-module-sync.test.ts` (menolak
badan tempelan yang berbeda dari `src/lib/wms-stock.ts`).

`npm run build` (`vite build` + `dist/server.cjs`) tetap ada untuk pemakaian lokal, tetapi
**bukan** bukti production sehat — jangan pakai itu untuk menyimpulkan Vercel akan lulus.

---

# 13. Satuan multipak "@N" — BUKAN duplikat

Dikoreksi 18 Nov 2026 setelah koreksi langsung dari pemilik data, lalu
**diperbaiki ulang** pada hari yang sama setelah rumusnya terbukti salah.

> **Peringatan:** versi pertama §13 ini menulis bahwa faktornya `Qty/ × N`.
> Itu **salah** dan sudah dibuang. `Qty/` sudah berisi N.

## Baris `@N` bukan duplikat

Script lama membuang semua baris yang kolom `Satuan`-nya berawalan `@` dengan
alasan "tier harga iPOSS". Alasan itu keliru.

| Nama Barang | Satuan | Qty/ | Paket |
|---|---|---|---|
| CAT CHOIZE KITTEN SALMON 20KG | SAK | 1 | SAK |
| CAT CHOIZE KITTEN SALMON 20KG | @3 SAK | 3 | SAK |
| CAT CHOIZE KITTEN SALMON 20KG | @5 SAK | 5 | SAK |
| CAT CHOIZE KITTEN SALMON 20KG | @20 SAK | 20 | SAK |

Empat baris itu punya **satuan berbeda**: `SAK`, `@3 SAK`, `@5 SAK`, `@20 SAK`.
Masing-masing adalah satuan transaksi nyata di iPOSS, jadi semuanya harus bisa
dipilih saat menerima barang.

## Aturan resmi — satu rumus saja

```
1 [SATUAN] = [QTY/] [PAKET]
```

`Qty/` **sudah** berisi jumlah satuan tujuan per satu satuan transaksi.
Jangan dikalikan lagi dengan angka pada label `@N`.

| Satuan | Qty/ | Paket | Arti | Faktor ke satuan dasar |
|---|---|---|---|---|
| PCS | 1 | PCS | 1 transaksi = 1 PCS | 1 |
| `@6` | 6 | PCS | 1 transaksi = 6 PCS | 6 |
| `SAK` | 20 | PCS | 1 transaksi = 20 PCS | 20 |
| `@3 SAK` | 60 | PCS | 1 transaksi = 60 PCS | 60 |
| `DUS` | 50 | PCS | 1 transaksi = 50 PCS | 50 |
| `@25 DUS` | 1250 | PCS | 1 transaksi = 1.250 PCS | 1250 |
| `@25 Kg` | 1 | `@25 Kg` | 1 transaksi = 25 KG | 25 |

Satuan dasar sebuah item **selalu** diambil dari kolom `Paket` pada baris
`Qty/ = 1`, tidak pernah ditebak dari nama satuan (`BAL`/`SAK` bisa jadi satuan
terkecil sekaligus satuan transaksi).

## Bukti dari data (18 Nov 2026)

Sumber: `Master Data Konversi.xlsx`, hanya sheet **`Sheet`**
(`Sheet (2)` dan `Sheet (3)` bukan data yang dipakai).

| Kenyataan | Jumlah |
|---|---|
| Baris data | 23.661 |
| Item unik | 8.788 |
| Baris `Satuan` berlabel `@` | 12.126 |
| Nilai `Paket` berlabel `@` | 88 (8 label) |
| Baris konversi dihasilkan | **14.884** |
| Di antaranya multipak `@N` | **12.111** |

Seluruh 8.788 item sudah diuji ulang: tidak ada lagi item yang kehilangan
konversi karena label `@` dibuang.

## Yang berubah

1. `tools/wms/build_masters.py` — `parse_multipack()` membaca sel `@N X`, dan
   `build_conversion_chain()` memakai `1 [Satuan] = Qty/ [Paket]`.
   Label `@N` **disimpan apa adanya** sebagai `FROM_UNIT`.
2. `src/lib/wms-stock.ts` — `parseMultiPackLabel()` membaca `@N X`,
   `resolveFactors()` menghitung faktor dengan rumus yang sama, dan
   `buildUnitOptions()` menampilkan label `@N` sebagai pilihan satuan.
3. Test regresi memakai baris asli: `src/lib/__tests__/multipack.test.ts`
   (contoh per item) dan `src/lib/__tests__/conversionCatalog.test.ts`
   (seluruh 8.788 item dari workbook sumber).

## Bentuk data setelah perbaikan

```
FROM_UNIT    TO_UNIT  TO_UNIT_QTY
@3 SAK       SAK      3
@5 SAK       SAK      5
@20 SAK      SAK      20
```

Pada form terima barang, pilihan satuannya menjadi:

```
SAK  ·  @3 SAK  ·  @5 SAK  ·  @20 SAK
```

## Membangun ulang workbook

```bash
# kedua file sumber harus ada di google_drive/
#   Master Data Stock.xlsx     (tab "MS Details")
#   Master Data Konversi.xlsx  (tab "Sheet")
python3 tools/wms/build_masters.py
python3 tools/wms/build_workbook.py
```

lalu unggah `templates/google-sheets/wms/WMS_Database.xlsx` ke Google Drive dan
salin isinya ke spreadsheet WMS (`WMS_SPREADSHEET_ID`).

Perbaikan manual per item tetap bisa lewat layar **Master Konversi** (tombol
pensil), tetapi jangan menambah baris `@N` secara manual untuk seluruh katalog —
bangun ulang workbook supaya angkanya konsisten dengan sumber.
