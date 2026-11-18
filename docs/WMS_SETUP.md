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

## 5. Yang belum dikerjakan (lanjutan Fase 1)

| # | Pekerjaan | Butuh apa |
|---|---|---|
| 1.3 | Tulis ke `STOCK_LEDGER` + `STOCK_BATCH` saat terima barang | Selesai desain, perlu kode transaksi |
| 1.4 | Form Terima Barang: pilih satuan (DUS/PCS) + batch + expired | Perlu 1.2 selesai |
| 1.5 | Halaman Stok Gudang + Kartu Stok | Perlu saldo awal masuk |
| 1.6 | Expiry Monitor (merah/kuning/hijau) | Perlu `STOCK_BATCH` terisi |
| 1.7 | Master Konversi (layar admin untuk sunting konversi) | Bisa jalan sekarang |

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
