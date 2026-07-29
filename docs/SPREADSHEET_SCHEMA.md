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
| A | `PRD_ID` | ID detail PR, auto-generated |
| B | `PR_ID` | Nomor PR relasi ke `PR_Header.PR_ID` |
| C | `ITEM_NAME` | Nama barang |
| D | `UNIT` | Satuan |
| E | `QTY` | Qty request |
| F | `STOCK_ONHAND` | Stock saat ini |
| G | `AVG_SALES` | Rata-rata sales |
| H | `B1` | Sales bulan/history 1 |
| I | `B2` | Sales bulan/history 2 |
| J | `B3` | Sales bulan/history 3 |

## 5. `PO_Header`

Satu baris mewakili satu PO.

| Kolom | Header | Keterangan |
|---|---|---|
| A | `PO_NO` | Nomor PO, auto-generated |
| B | `PR_ID` | Nomor PR terkait |
| C | `PURCHASE_NAME` | Pembuat PO |
| D | `DATE` | Tanggal PO |
| E | `DELIVERY_DATE` | Target delivery |
| F | `SUPPLIER` | Supplier |
| G | `NOTES` | Catatan umum PO |
| H | `PDF_LINK` | Link PDF PO |
| I | `STATUS` | Status PO |
| J | `DIVISION` | Gudang/divisi tujuan |
| K | `DISCOUNT` | Nominal diskon |
| L | `TAX` | Nominal pajak |
| M | `OTHERS` | Biaya lain-lain |
| N | `GRAND_TOTAL` | Total akhir |
| O | `DISCOUNT_PERCENT` | Persen diskon |
| P | `TAX_PERCENT` | Persen pajak |
| Q | `SUB_TOTAL` | Subtotal sebelum diskon/pajak/lain-lain |

## 6. `PO_Detail`

Satu baris mewakili satu item dalam PO.

| Kolom | Header | Keterangan |
|---|---|---|
| A | `POD_ID` | ID detail PO, auto-generated |
| B | `PO_NO` | Nomor PO relasi ke `PO_Header.PO_NO` |
| C | `PR_ID` | Nomor PR terkait |
| D | `ITEM_NAME` | Nama barang |
| E | `UNIT` | Satuan |
| F | `QTY` | Qty |
| G | `PRICE` | Harga |
| H | `TOTAL` | Total item (`QTY * PRICE`) |

## Cara setup cepat

1. Buat Google Spreadsheet baru.
2. Buat 6 tab dengan nama persis seperti di atas.
3. Copy header dari file CSV di folder `templates/google-sheets/` ke baris pertama masing-masing sheet.
4. Tambahkan minimal 1 admin pertama di `User_Role`.
5. Tambahkan minimal beberapa item di `Master_Stock`.
6. Share spreadsheet ke service account dari `.env` (`GOOGLE_SERVICE_ACCOUNT_EMAIL`) sebagai Editor.
7. Isi `SPREADSHEET_ID` di `.env` dengan ID spreadsheet tersebut.
