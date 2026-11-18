# Google Sheets Schema

Aplikasi sekarang memakai struktur **header/detail** dan membutuhkan 6 tab/sheet wajib:

1. `User_Role`
2. `Master_Stock`
3. `PR_Header`
4. `PR_Detail`
5. `PO_Header`
6. `PO_Detail`

> Nama tab harus persis sama. Baris pertama wajib berisi header. Data dimulai dari baris ke-2.

## 1. `User_Role`

| Kolom | Header | Keterangan |
|---|---|---|
| A | `USERNAME` | Username login, contoh `ADMIN` |
| B | `PASSWORD_HASH` | Password hash. Untuk user awal boleh isi plaintext sementara; akan di-upgrade otomatis saat login sukses. |
| C | `FULL_NAME` | Nama lengkap user |
| D | `DIVISION` | Divisi user |
| E | `DIV_CODE` | Kode divisi, contoh `ADMIN`, `MGR`, `DIR`, `CS` |
| F | `WA_NUMBER` | Nomor WhatsApp format internasional, contoh `6281234567890` |
| G | `ROLE` | `ADMIN`, `USER`, `Manager`, `Direktur`, `Purchase` |
| H | `ACCESS` | Hak menu dipisah koma, contoh `DASHBOARD, CREATE PR, PR HISTORY` |

Contoh admin pertama:

```csv
USERNAME,PASSWORD_HASH,FULL_NAME,DIVISION,DIV_CODE,WA_NUMBER,ROLE,ACCESS
ADMIN,ChangeMeNow123!,Administrator,ADMIN,ADMIN,628xxxxxxxxxx,ADMIN,"DASHBOARD, CREATE PR, PR HISTORY, PO HISTORY, PURCHASE, APPROVAL"
```

## 2. `Master_Stock`

| Kolom | Header | Keterangan |
|---|---|---|
| A | `ITEM_NAME` | Nama barang |
| B | `CATEGORY` | Kategori |
| C | `SUPPLIER` | Nama supplier |
| D | `UNIT` | Satuan, contoh `PCS`, `BOX`, `CTN` |
| E | `PRICE` | Harga default/awal |

## 3. `PR_Header`

Satu baris mewakili satu PR.

| Kolom | Header | Keterangan |
|---|---|---|
| A | `PR_ID` | Nomor PR, auto-generated |
| B | `DATE` | Tanggal PR |
| C | `REQUESTER` | Nama peminta |
| D | `DIVISION` | Divisi peminta |
| E | `SUPPLIER` | Supplier |
| F | `NOTES` | Catatan umum PR |
| G | `STATUS` | Status PR |
| H | `MGR_APPROVAL` | Catatan approval manager |
| I | `DIR_APPROVAL` | Catatan approval direktur |
| J | `PDF_LINK` | Link PDF PR |
| K | `PO_NO` | Nomor PO terkait |

Status PR yang dipakai aplikasi:

- `WAITING MANAGER APPROVAL`
- `WAITING DIREKTUR APPROVAL`
- `WAITING CREATED PO`
- `WAITING RECEIVE`
- `FINISH`
- `Rejected`

## 4. `PR_Detail`

Satu baris mewakili satu item dalam PR.

| Kolom | Header | Keterangan |
|---|---|---|
| A | `PRD ID` | ID detail PR, auto-generated |
| B | `PR ID` | Nomor PR relasi ke `PR_Header.PR_ID` |
| C | `Item Name` | Nama barang |
| D | `Unit` | Satuan |
| E | `QTY` | Qty request |
| F | `Stock Onhand` | Stock saat ini |
| G | `Avg Sales` | Rata-rata sales |
| H | `B1` | Sales bulan/history 1 |
| I | `B2` | Sales bulan/history 2 |
| J | `B3` | Sales bulan/history 3 |
| K | `Qty Terima` | Qty yang diterima (mirror dari `PO_Detail`), diisi saat terima barang |
| L | `Keterangan` | Keterangan penerimaan per item (mirror dari `PO_Detail`) |

## 5. `PO_Header`

Satu baris mewakili satu PO.

| Kolom | Header | Keterangan |
|---|---|---|
| A | `PO No` | Nomor PO, auto-generated |
| B | `PR ID` | Nomor PR terkait |
| C | `Purchase Name` | Pembuat PO |
| D | `Date` | Tanggal PO |
| E | `Delivery Date` | Target delivery |
| F | `Supplier` | Supplier |
| G | `Division` | Gudang/divisi tujuan |
| H | `Notes` | Catatan umum PO |
| I | `PDF Link` | Link PDF PO |
| J | `Status` | Status PO (`WAITING RECEIVE` / `ALREADY RECEIVE`) |
| K | `SubTotal` | Subtotal sebelum diskon/pajak/lain-lain |
| L | `Discount Nominal` | Nominal diskon |
| M | `Discount %` | Persen diskon |
| N | `Tax Nominal` | Nominal pajak |
| O | `Tax %` | Persen pajak |
| P | `Others (+)` | Biaya lain-lain |
| Q | `Grand Total` | Total akhir |
| R | `DO_NO` | Nomor DO / Surat Jalan (diisi saat terima barang) |
| S | `DRIVER_NAME` | Nama supir (diisi saat terima barang) |
| T | `LICENSE_PLATE` | No. polisi kendaraan (diisi saat terima barang) |
| U | `RECEIVED_DATE` | Tanggal terima, format DD/MM/YYYY |
| V | `CHECKER_BY` | Pemeriksa/penerima di lapangan (header live masih `CHEKER_BY` — betulkan) |
| W | `GR_NO` | Nomor Goods Receipt, generated server, format `GR-[DIV_KODE]000000001-26` (sudah ada di sheet live) |
| X | `RECEIVE_BY` | Nama user yang menyimpan penerimaan (dari session login) — sudah ada di sheet live |
| Y | `GR_PDF_LINK` | Link PDF Berita Acara GR — **kolom baru, perlu ditambahkan** |

## 6. `PO_Detail`

Satu baris mewakili satu item dalam PO.

| Kolom | Header | Keterangan |
|---|---|---|
| A | `POD ID` | ID detail PO, auto-generated |
| B | `PO No` | Nomor PO relasi ke `PO_Header.PO No` |
| C | `Item Name` | Nama barang |
| D | `Unit` | Satuan |
| E | `Qty` | Qty order |
| F | `Price` | Harga |
| G | `Total Price` | Total item (`Qty * Price`) |
| H | `QTY_TERIMA` | Qty yang diterima (diisi saat terima barang) |
| I | `KETERANGAN` | Keterangan penerimaan per item |

## Cara setup cepat

1. Buat Google Spreadsheet baru.
2. Buat 6 tab dengan nama persis seperti di atas.
3. Copy header dari file CSV di folder `templates/google-sheets/` ke baris pertama masing-masing sheet.
4. Tambahkan minimal 1 admin pertama di `User_Role`.
5. Tambahkan minimal beberapa item di `Master_Stock`.
6. Share spreadsheet ke service account dari `.env` (`GOOGLE_SERVICE_ACCOUNT_EMAIL`) sebagai Editor.
7. Isi `SPREADSHEET_ID` di `.env` dengan ID spreadsheet tersebut.
