# WMS Fase 1 — Langkah 1: Hasil Migrasi Data Nyata

Sumber: `Master Data Stock.xlsx` (tab `MS Details`) dan `Master Data Konversi.xlsx` (tab `Sheet`),
keduanya ekspor iPOSS. Diolah oleh `tools/wms/build_masters.py`.

Perintah: `python3 tools/wms/build_masters.py`
Keluaran: `templates/google-sheets/wms/*.csv`

## Hasil

| | Jumlah |
|---|---|
| Item di `ITEM_MASTER` | **8.789** |
| Kategori di `CATEGORY_MASTER` | **93** |
| Baris `UNIT_CONVERSION` | **2.800** |
| Item punya satuan besar (DUS/SAK/BAL/PAK/KARTON/LUSIN/KODI/RENC) | **2.730** |
| Item `TRACK_EXPIRY=Y` | **2.220** |
| Item aktif (`Sale`) | 3.895 |
| Item punya stok > 0 | 2.174 |
| Baris validasi silang stok | 2.760 |
| Validasi **tidak cocok** | **0** |

## Tiga temuan yang mengubah desain

### 1. `ID Barang` sudah ada di iPOSS — jangan buat ID baru

Data yang diperbaiki memuat kolom `ID Barang` (`SPS000001` … `SPS008789`), unik tanpa duplikat.
Karena itu `ITEM_ID` **memakai ID iPOSS apa adanya**, bukan `ITM-000001`.
Keuntungan: tidak perlu tabel pemetaan, dan `IPOS_CODE` = `ITEM_ID` sejak hari pertama.

### 2. Kolom `Satuan` iPOSS berarti `1 [Satuan] = Qty/ [Paket]`

Ini yang tadinya salah saya baca. Bukti dari data:

| Nama | Satuan | Qty/ | Paket | Arti |
|---|---|---|---|---|
| A591-K | DUS | 20 | PCS | 1 DUS = 20 PCS |
| BEAUTY CAT 20KG | SAK | 1 | SAK | satuan dasar = SAK |
| BEAUTY CAT 20KG | @5 SAK | 5 | SAK | 1 tier-5 = 5 SAK |
| 511 BRAVO (50 KG) | BAL | 1 | BAL | satuan dasar = BAL |

### 3. Awalan `@` adalah **tier harga**, bukan satuan fisik

12.119 baris memakai `@3`, `@6`, `@12`, `@5 SAK`, dan seterusnya. Semua itu **tidak masuk**
`UNIT_CONVERSION` karena bukan satuan gudang — hanya kelipatan harga jual di iPOSS.
Yang masuk tabel hanya satuan fisik nyata: **2.800 baris dari 2.591 item**.

Bukti kuat bahwa pemahaman ini benar: untuk setiap item, `stok(satuan) × Qty/ = stok(satuan dasar)`
di **2.760 baris, dan gagal di 0 baris**. Rumus konversi saya konsisten dengan angka stok iPOSS.

## Konversi berjenjang: hasil nyata

Dari 2.591 item yang punya konversi, **166 item punya 2 tingkat**. Contoh:

| Item | Rantai |
|---|---|
| (DC) A711- NIROX -1,5 L (ISI 24) | 1 LUSIN = 12 PCS · 1 DUS = 24 PCS |
| (DC) DIAMOND LIGHT STICK ISI 5 | 1 PAK = 50 PCS · 1 DUS = 5.000 PCS |
| (DC) DRONTAL CAT (ISI 40) | 1 STRIP = 8 TBLT · 1 DUS = 40 TBLT |
| A591-K | 1 DUS = 20 PCS |

Catatan penting: untuk `A591-K` angka iPOSS adalah **1 DUS = 20 PCS**, bukan 30 PCS seperti
asumsi awal saya di dokumen desain. Data yang benar menang; dokumen sudah dikoreksi.

## Yang masih butuh keputusan Anda

### a. 44 item berlabel `@25 Kg` — dihitung per karung atau per KG?

Contoh: `105 M (25 KG)`, `511 BRAVO (25 KG)`, `JAGUNG HIBRIDA (25 KG)`, `TIMAH LAUT J1` (`@0.5 Kg`).

Sementara saya set `UNIT_BASE = KG` dengan `1 KEMASAN = 25 KG`, dan diberi catatan
`PERLU KONFIRMASI`. Kalau ternyata stok dihitung per karung, tinggal ubah `UNIT_BASE` jadi `KRG`.

### b. 9 item memakai `DUS` sebagai satuan dasar

Contoh: `(DC) 201M` dsb. di kategori tertentu. Ini wajar, hanya perlu dipastikan memang tidak
dijual eceran.

### c. 16 item konflik — tidak ditebak

Daftar lengkap di `ITEM_MASTER_PERLU_CEK.csv` kolom `MASALAH`. Semua sudah diberi catatan,
tidak ada yang dibuang.

## Kenapa belum ada tab yang dibuat di spreadsheet?

Karena `ITEM_MASTER` berisi 8.789 baris × 18 kolom (1,5 MB CSV). Sebelum menulis ke Google Sheets,
saya perlu konfirmasi dua hal:

1. **Tab baru atau spreadsheet baru?** Menambah 6 tab ke spreadsheet yang sedang dipakai
   (3.875 baris `Master_Stock`) akan membuat file itu berat. Saran saya: tab WMS dibuat di
   **spreadsheet terpisah**, aplikasi membaca dua spreadsheet.
2. **`Master_Stock` lama diapakan?** Opsi: dibiarkan (read-only, dipakai form PR), atau
   diganti `ITEM_MASTER` sekalian dan form PR membaca `ITEM_MASTER`.

## Langkah berikutnya

1. Konfirmasi dua hal di atas → saya tulis tab-nya langsung ke Google Sheets.
2. Isi saldo awal per gudang (Nagoya / Poncol / Ciracas) — dari 3 gambar stok yang Anda kirim,
   saya butuh **file Excel-nya**, bukan screenshot, agar tidak salah ketik 2.000+ baris.
3. Setelah tab ada, saya kerjakan kode: endpoint `GET /api/wms/items`, `GET /api/wms/conversions`,
   lalu form Terima Barang dengan pemilihan satuan + batch + expired.

---

# Lampiran: rencana saldo awal per gudang

## Masalah

Anda punya stok per gudang (Nagoya / Poncol / Ciracas), tetapi `Master_Stock` hanya menyimpan
**satu angka total**. Saya bandingkan 15 item yang terlihat di screenshot gudang Nagoya + Ciracas
dengan `Master_Stock`:

| Item | Nagoya | Ciracas | Jumlah | Master_Stock | Selisih |
|---|---|---|---|---|---|
| 511 BRAVO (1 KG) | 20 | 203 | 223 | 235 | +12 |
| 511 BRAVO (50 KG) | 96 | 87 | 183 | 187 | +4 |
| 512 BRAVO (50 KG) | 84 | 14 | 98 | 63 | −35 |
| BR2 (50 KG) | 64 | 43 | 107 | 68 | −39 |
| 105 M (50 KG) | 19 | 11 | 30 | 142 | +112 |
| 551 (50 KG) | 22 | 1 | 23 | 47 | +24 |
| 781 (1 KG) | 20 | 125 | 145 | 144 | −1 |

Kesimpulan: **angka total saja tidak cukup**. Selisih bisa 112 unit pada satu item. Saldo awal
wajib dari file per gudang, bukan dialokasikan dari total.

## Rencana saldo awal

Tab `STOCK_LEDGER` dibuat append-only. Saldo awal ditulis sebagai entri `OPNAME_IN` per
(item × gudang), tanggal `2026-12-01`, referensi `SALDO-AWAL-2026-12`. Dengan begitu:

- stok gudang = `SUM(QTY_BASE)` dari ledger, bisa diaudit
- tidak ada angka stok yang ditulis langsung ke kolom mana pun
- koreksi saldo awal cukup tambah entri lawan, riwayat tetap utuh

Format file yang saya butuhkan (CSV/Excel):

```
WAREHOUSE_ID,ITEM_ID,ITEM_NAME,QTY,UNIT
WH-NAG,SPS004916,511 BRAVO (25 KG),29,@25 Kg
WH-CIR,SPS004916,511 BRAVO (25 KG),8,@25 Kg
```

`UNIT` harus salah satu satuan yang ada di `UNIT_CONVERSION` untuk item itu, agar konversi
otomatis ke satuan dasar. `ITEM_NAME` hanya untuk pemeriksaan manual — kuncinya `ITEM_ID`.
