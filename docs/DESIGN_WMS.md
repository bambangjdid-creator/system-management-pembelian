# DESAIN TEKNIS — WMS (Warehouse Management System)
## Rencana Pengembangan dari "Sistem Manajemen Pembelian"

> Status: **DOKUMEN DESAIN — belum ada kode yang diubah**
> Tanggal: 2026-11-18
> Basis kode: `main` @ `5b556d0`
> Cakupan: skema data, alur proses, daftar endpoint, rencana migrasi, dan urutan implementasi
> Penulis: disusun bersama pemilik sistem, berdasarkan analisa data produksi "Aplikasi Pembelian"

---

## 0. Ringkasan Eksekutif

Aplikasi sekarang adalah **sistem pembelian** (PR → approval → PO → GR). WMS membutuhkan
lapisan baru: **persediaan** (inventory). Perubahan terbesar bukan pada tampilan, tapi pada
**cara menyimpan stok**: dari "satu angka di Master_Stock" menjadi **buku besar mutasi (stock ledger)**.

### Lima keputusan inti yang harus disepakati

| # | Keputusan | Alasan |
|---|---|---|
| 1 | Stok **tidak** disimpan sebagai angka di `Master_Stock`, melainkan dihitung dari `STOCK_LEDGER` | Tanpa jejak audit, WMS hanya tebakan. Opname, koreksi, dan laporan butuh riwayat. |
| 2 | `TRACK_EXPIRY` ditentukan **per item**, tanggal expired disimpan **per batch** | Tanggal kedaluwarsa berbeda tiap kedatangan, tidak bisa menempel di item |
| 3 | Fase 1 **tetap Google Sheets**, tetapi strukturnya disiapkan agar mudah pindah ke Postgres | Perubahan kecil dulu, risiko rendah; migrasi dilakukan saat data sudah besar |
| 4 | **Stok selalu dalam satuan terkecil (base unit).** Satuan besar (DUS/BAL/SAK/RENCENG) hanya untuk transaksi, dikonversi saat simpan | Bisnis melayani partai besar **dan** eceran PCS. Kalau stok disimpan dalam DUS, penjualan 1 PCS tidak bisa dicatat |
| 5 | **iPOSS = sumber acuan harga** (beli & jual), bukan sumber stok | iPOSS sudah operasional; aplikasi ini yang mengatur penerimaan & mutasi gudang |

### Fakta data produksi (hasil pembacaan langsung, 2026-11-18)

| Temuan | Angka | Implikasi |
|---|---|---|
| Item master (data iPOSS terbaru) | **8.789 baris** | Naik dari 3.875 karena ekspor iPOSS memuat semua item, termasuk nonaktif. Yang `Sale` = 3.895, yang punya stok > 0 = 2.174 |
| Kategori | **80 kategori** | Perlu master kategori terpisah (sekarang teks bebas) |
| Nama item duplikat | 8 nama / 16 baris | Perlu `ITEM_ID` sebagai kunci, bukan nama |
| Kolom master stock | **19 kolom** sudah tersedia: `ID Barang`, Nama, Supplier, Kategori, Satuan, Stock Onhand, Harga Pokok, Harga Jual, Status Jual, Berat, P/L/T, Volume, Status Expired, Production/Expired Date, Minimum Stock | Master sudah jauh lebih siap dari perkiraan awal |
| Kolom E (dikonfirmasi) | **Qty total seluruh gudang**, dalam satuan terkecil; 0 – 51.972 | Boleh dihapus setelah saldo awal pindah ke ledger (lihat §7 Langkah 3) |
| Kolom F (dikonfirmasi) | **Harga beli**, acuan dari iPOSS; median 23.500 | Dipakai sebagai pembanding harga PO |
| Satuan | PCS 3.166, SAK 166, SET 74, BAL 73, PAK 55, ROLL 17, RENC 17, kosong 251 | **Satuan di master = satuan terkecil.** Perlu tabel kemasan berjenjang |
| Contoh nyata | `A591-K` = `SPS004945`, unit `PCS`, stok 2.644, harga pokok 11.189, harga jual 15.500. **1 DUS = 20 PCS** (dari file konversi iPOSS) | Membuktikan perlunya multi-satuan: beli DUS, simpan PCS, jual PCS |
| Kode barang | **`ID Barang` iPOSS tersedia**: `SPS000001`–`SPS008789`, unik tanpa duplikat | **`ITEM_ID` memakai ID iPOSS apa adanya.** Tidak perlu membuat `ITM-000001`, tidak perlu tabel pemetaan |
| Item yang perlu `TRACK_EXPIRY=Y` | **2.220 item (25%)** | Pakan, cat/dog food, obat, vaksin, jamu, DOC, hasil bumi, shampoo, desinfektan. Kolom `Status Expired Date` di master masih kosong seluruhnya |
| Item `TRACK_EXPIRY=N` | **2.274 item (59%)** | Mainan, sangkar, aksesoris pancing/burung, joran, kerodong, dll. |
| Gudang aktif | GD NAGOYA, GD PONCOL, GD CIRACAS | Multi-lokasi → butuh transfer & stok per gudang |
| `User_Role` | ~96 user, hanya ±13 yang ROLE/DIVISION/ACCESS lengkap | Perlu dirapikan sebelum fitur ber-approval |

> **Catatan penting:** angka 41% / 59% adalah **usulan awal** berbasis kategori. Pemetaan final
> per item harus dikonfirmasi tim gudang (lihat §7 Langkah 0).

---

## 1. Posisi WMS terhadap aplikasi sekarang

```text
                        ┌──────────────────────────────────────────┐
                        │           APLIKASI SEKARANG              │
                        │  PR → Approval → PO → Terima Barang (GR) │
                        └───────────────────┬──────────────────────┘
                                            │ GR menambah stok
                                            ▼
   ┌────────────────────────────────────────────────────────────────────────┐
   │                    LAPISAN BARU: PERSEDIAAN (WMS)                      │
   │                                                                        │
   │  Master Item ──► Konversi Satuan ──► Stock Ledger ──► Stock Batch      │
   │       │            (BAL→RENC→PCS)         │              (expired)     │
   │       │                                   │                  │         │
   │       ├── Putaway ◄───────────────────────┘                  ├── FEFO  │
   │       ├── Permintaan Divisi (Issue)                          ├── Alert │
   │       ├── Transfer Antar Gudang                              ├── Write-off
   │       ├── Stock Opname (cycle count)                         └── Aging │
   │       └── Reorder Point ──► usul PR (balik ke modul lama)              │
   └────────────────────────────────────────────────────────────────────────┘
              ▲                                        ▲
              │ harga acuan                            │ qty satuan terkecil
   ┌──────────┴───────────┐                  ┌──────────┴────────────┐
   │       iPOSS          │                  │  Ekspor stok iPOSS    │
   │  (sistem operasional │                  │  (qty dalam PCS/BTL)  │
   │   penjualan & harga) │                  └───────────────────────┘
   └──────────────────────┘
```

### Pembagian peran dengan iPOSS (penting)

| Aspek | iPOSS | Aplikasi WMS ini |
|---|---|---|
| Penjualan ke pelanggan | ✅ sumber utama | ❌ tidak menangani |
| Harga beli & harga jual | ✅ **acuan** | menyimpan riwayat & pembanding |
| Stok barang | ✅ punya angka (satuan terkecil) | ✅ punya ledger sendiri (per gudang, per batch) |
| Penerimaan barang dari supplier | — | ✅ sumber utama (GR + batch + expired) |
| Mutasi internal gudang | — | ✅ sumber utama |
| Expired / batch / FEFO | — | ✅ sumber utama |

> **Catatan penting:** ada **dua angka stok** (iPOSS dan WMS). Ini harus dikelola sadar.
> Rekomendasi: WMS jadi acuan untuk **barang masuk & mutasi gudang**, lalu angka WMS
> disinkronkan/direkonsiliasi dengan iPOSS setiap periode (lihat §6.5). Jangan mencoba
> menyatukan keduanya di Fase 1 — itu pekerjaan integrasi tersendiri.

Prinsip: **modul lama tidak dibongkar**. GR (yang baru selesai) diperluas agar menulis ke ledger.
PR/PO tetap seperti sekarang, hanya ditambah kemampuan "usulan otomatis saat stok minimum".

---

## 2. Skema Data (Google Sheets — Fase 1)

Konvensi: satu tab = satu tabel. Kolom baru **selalu ditambahkan di kanan** agar range lama aman.
Semua tanggal disimpan `YYYY-MM-DD` (konsisten dengan kode saat ini), tanggal terima yang
ditampilkan `DD/MM/YYYY` tetap dipertahankan pada kolom yang sudah ada.

### 2.1 `ITEM_MASTER` (baru — menggantikan peran `Master_Stock` untuk WMS)

| Kolom | Nama | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| A | `ITEM_ID` | teks | ya | Kunci utama = **`ID Barang` iPOSS** (`SPS000001`). Tidak dibuat ulang. **Tidak berubah walau nama item diedit** |
| B | `ITEM_NAME` | teks | ya | Nama barang (boleh duplikat, kunci tetap ITEM_ID) |
| C | `CATEGORY` | teks | ya | Diambil dari `CATEGORY_MASTER` |
| D | `SUPPLIER` | teks | tidak | Supplier utama |
| E | `UNIT_BASE` | teks | ya | **Satuan terkecil** (PCS/BTL/SCT). Semua stok disimpan dalam satuan ini |
| F | `BUY_UNIT_DEFAULT` | teks | tidak | Satuan beli yang biasa dipakai (DUS/BAL/SAK) — hanya prefill form |
| G | `IPOS_CODE` | teks | tidak | **Kode barang di iPOSS**, jembatan untuk tarik harga beli & jual |
| H | `IPOS_NAME` | teks | tidak | Nama barang versi iPOSS (untuk pencocokan saat impor) |
| I | `TRACK_EXPIRY` | `Y`/`N` | ya | **Penentu apakah batch & expired wajib** |
| J | `TRACK_BATCH` | `Y`/`N` | ya | `Y` bila nomor batch supplier perlu dilacak walau tanpa expired |
| K | `SHELF_LIFE_DAYS` | angka | tidak | Umur simpan (hari). Dipakai validasi saat GR |
| L | `MIN_STOCK` | angka | tidak | Batas bawah (dalam `UNIT_BASE`) → memicu usulan PR |
| M | `MAX_STOCK` | angka | tidak | Batas atas → peringatan overstock |
| N | `REORDER_POINT` | angka | tidak | Titik pemesanan ulang |
| O | `IS_ACTIVE` | `Y`/`N` | ya | Nonaktifkan tanpa menghapus riwayat |
| P | `NOTES` | teks | tidak | Catatan |
| Q | `CREATED_AT` | tanggal | ya | |
| R | `UPDATED_AT` | tanggal | ya | |

> **Kenapa `UNIT_BASE` wajib satuan terkecil?** Bisnis melayani partai besar *dan* eceran PCS.
> Contoh `A591-K` (`SPS004945`): dibeli dalam **DUS**, di iPOSS **1 DUS = 20 PCS**, dijual eceran **PCS**.
> Kalau stok disimpan dalam DUS, penjualan 1 PCS tidak bisa dicatat tanpa angka desimal. Karena itu:
> **beli dalam DUS → konversi ke PCS → simpan 20 PCS per DUS → jual per PCS.**

> `Master_Stock` lama **tidak dihapus**. Setelah migrasi, ia menjadi sumber `ITEM_MASTER`
> dan tetap dipakai sebagai daftar pilihan di form PR (read-only).

### 2.2 `CATEGORY_MASTER` (baru)

| Kolom | Nama | Keterangan |
|---|---|---|
| A | `CATEGORY_ID` | `CAT-001` |
| B | `CATEGORY_NAME` | 80 kategori yang sudah ada |
| C | `DEFAULT_TRACK_EXPIRY` | `Y`/`N` — *default* saat membuat item baru di kategori ini |
| D | `SHELF_LIFE_DAYS` | *default* umur simpan per kategori |
| E | `IS_ACTIVE` | |

Manfaat: mempercepat pembuatan item baru (8.789 item, penambahan rutin), dan menjaga
`TRACK_EXPIRY` konsisten — mis. semua `CAT FOOD WET KALENG` otomatis `Y` dengan shelf life 540 hari.

### 2.3 `UNIT_CONVERSION` (baru — **sudah dimigrasi dari iPOSS**)

Mendukung rantai kemasan lebih dari 2 tingkat. Rantai nyata dari data Anda:

```
1 DUS   = 20 PCS            (A591-K / SPS004945)
1 LUSIN = 12 PCS            (DC) A711- NIROX -1,5 L (ISI 24)
1 DUS   = 24 PCS            -> DUS dan LUSIN dua jalur terpisah ke PCS
1 PAK   = 50 PCS            (DC) DIAMOND LIGHT STICK ISI 5
1 DUS   = 5.000 PCS         (1 DUS = 100 PAK)
1 STRIP = 8 TBLT            (DC) DRONTAL CAT (ISI 40)
1 DUS   = 40 TBLT
```

| Kolom | Nama | Keterangan |
|---|---|---|
| A | `CONV_ID` | `CNV-000001` |
| B | `ITEM_ID` | `SPS000001` |
| C | `ITEM_NAME` | hanya untuk pembacaan manusia |
| D | `LEVEL` | urutan tampil (2, 3, 4 …); `UNIT_BASE` sendiri tidak ditulis |
| E | `FROM_UNIT` | satuan transaksi, mis. `DUS` |
| F | `TO_UNIT` | **selalu `UNIT_BASE`** item tersebut |
| G | `TO_UNIT_QTY` | 1 `FROM_UNIT` = berapa `TO_UNIT` |
| H | `IS_ACTIVE` | `Y`/`N` |
| I | `NOTES` | diisi bila ada hal yang perlu dicek |

**Semua konversi langsung ke `UNIT_BASE`** (bukan bertingkat di tabel) supaya perhitungan
stok hanya satu langkah: `QTY_BASE = QTY × TO_UNIT_QTY`. Rantai bertingkat tetap benar karena
setiap tingkat sudah dihitung ke satuan dasar — contoh `DIAMOND LIGHT STICK`: `1 PAK = 50 PCS`
dan `1 DUS = 5.000 PCS`; keduanya valid tanpa perlu konversi DUS→PAK→PCS saat transaksi.

**Temuan penting: awalan `@` di iPOSS bukan satuan fisik.**

Dari 23.661 baris file konversi iPOSS, **12.119 baris memakai `@3`, `@6`, `@12`, `@5 SAK`** dan
sejenisnya. Itu **tier harga jual**, bukan satuan gudang. Contoh `A591-K`:

| Satuan iPOSS | Qty/ | Paket | Arti sebenarnya |
|---|---|---|---|
| PCS | 1 | PCS | satuan dasar |
| `@5` | 5 | PCS | beli 5 PCS (tier harga) |
| `@10` | 10 | PCS | beli 10 PCS (tier harga) |
| DUS | 20 | PCS | **1 DUS = 20 PCS — ini satuan fisik** |

Jadi yang masuk `UNIT_CONVERSION` hanya **2.800 baris dari 2.591 item**; 12.119 baris tier harga
tidak dimasukkan (kalau dimasukkan, tabel konversi jadi 5× lebih besar tanpa manfaat).

**Bukti kebenaran rumus:** di file iPOSS, `stok(satuan) × Qty/` selalu = `stok(satuan dasar)`.
Saya uji ke **2.760 baris — cocok semua, 0 selisih**. Artinya pemetaan ini bukan tebakan.

**Aturan validasi:**
- Item yang punya satuan besar **wajib** punya baris konversi; item tanpa konversi hanya boleh
  transaksi dalam `UNIT_BASE`.
- Konversi **tidak boleh** diubah bila sudah ada transaksi; buat baris baru, set yang lama `N`.

**Cakupan hasil migrasi:** 2.730 item punya satuan besar (DUS/SAK/BAL/PAK/KARTON/LUSIN/KODI/RENC),
2.591 di antaranya sudah punya rantai konversi dari iPOSS, 166 item punya 2 tingkat.
Sisa 139 item perlu dilengkapi manual — terdaftar di `ITEM_MASTER_PERLU_CEK.csv`.

> **`QTY_TERIMA` di form GR tetap dalam satuan transaksi (DUS), sedangkan
> `STOCK_LEDGER.QTY_BASE` berisi hasil konversi (PCS).** Keduanya disimpan agar bisa diaudit.

### 2.4 `WAREHOUSE` (baru)

| Kolom | Nama | Keterangan |
|---|---|---|
| A | `WH_CODE` | `NGY`, `PCL`, `CRS` (sudah dipakai untuk kode GR) |
| B | `WH_NAME` | `GD NAGOYA` |
| C | `DIVISION` | Divisi pemilik |
| D | `IS_ACTIVE` | |

Konsisten dengan `resolveDivisionCode()` yang sudah ada di `api/server.ts`.

### 2.5 `STOCK_LEDGER` (baru — **tabel paling penting**)

Append-only. **Tidak boleh ada UPDATE atau DELETE.** Koreksi dilakukan dengan baris baru.

| Kolom | Nama | Keterangan |
|---|---|---|
| A | `LEDGER_ID` | `LGR-000000001`, auto-increment |
| B | `TRX_DATE` | `YYYY-MM-DD` |
| C | `TRX_TIME` | `HH:mm:ss` |
| D | `TRX_TYPE` | lihat tabel tipe di bawah |
| E | `ITEM_ID` | relasi `ITEM_MASTER` |
| F | `WH_CODE` | gudang |
| G | `BATCH_ID` | wajib bila item `TRACK_EXPIRY=Y` / `TRACK_BATCH=Y` |
| H | `QTY_IN` | angka ≥ 0 | qty dalam **satuan transaksi** (mis. 3 DUS) |
| I | `QTY_OUT` | angka ≥ 0 | qty dalam **satuan transaksi** |
| J | `TRX_UNIT` | teks | satuan saat transaksi: `DUS`, `BAL`, `PCS` |
| K | `QTY_BASE` | angka | qty setelah konversi ke `UNIT_BASE`; **inilah yang dipakai semua perhitungan stok** |
| L | `REF_TYPE` | `GR` / `PR` / `TRANSFER` / `OPNAME` / `ADJUST` / `WRITEOFF` / `RETURN` |
| M | `REF_NO` | nomor dokumen sumber (mis. `GR-NGY000000012-26`) |
| N | `BIN_CODE` | lokasi rak (opsional Fase 2) |
| O | `UNIT_COST` | harga satuan saat masuk (untuk nilai persediaan) |
| P | `USER` | siapa yang mencatat |
| Q | `NOTES` | alasan / keterangan |

**Tipe transaksi (TRX_TYPE):**

| TYPE | QTY_IN | QTY_OUT | Sumber | Keterangan |
|---|---|---|---|---|
| `RECEIVE` | ✓ | | Form Terima Barang (GR) | Barang masuk dari supplier |
| `ISSUE` | | ✓ | Permintaan Divisi | Barang keluar ke divisi |
| `TRANSFER_OUT` | | ✓ | Transfer | Keluar dari gudang asal |
| `TRANSFER_IN` | ✓ | | Transfer | Masuk ke gudang tujuan |
| `ADJUST_IN` | ✓ | | Adjustment | Koreksi tambah (dengan approval) |
| `ADJUST_OUT` | | ✓ | Adjustment | Koreksi kurang (dengan approval) |
| `OPNAME_IN` | ✓ | | Stock Opname | Selisih lebih hasil hitung fisik |
| `OPNAME_OUT` | | ✓ | Stock Opname | Selisih kurang hasil hitung fisik |
| `WRITEOFF` | | ✓ | Write-off | Barang rusak / expired dimusnahkan |
| `RETURN_SUPPLIER` | | ✓ | Retur | Dikembalikan ke supplier |
| `QUARANTINE_IN` / `QUARANTINE_OUT` | ✓ / ✓ | ✓ / ✓ | Karantina | Perpindahan status barang |

Aturan validasi (ditegakkan di server):
1. `QTY_OUT` tidak boleh melebihi stok tersedia (kecuali `ADJUST_OUT`/`OPNAME_OUT` yang butuh approval).
2. `BATCH_ID` wajib bila item `TRACK_EXPIRY=Y` atau `TRACK_BATCH=Y`.
3. Barang berstatus `EXPIRED`/`QUARANTINE` tidak boleh keluar lewat `ISSUE`.
4. Setiap baris harus punya `REF_NO` — tidak ada mutasi tanpa dokumen.

### 2.6 `STOCK_BATCH` (baru — untuk item ber-expired)

| Kolom | Nama | Keterangan |
|---|---|---|
| A | `BATCH_ID` | `BTC-000000001` |
| B | `ITEM_ID` | |
| C | `WH_CODE` | |
| D | `BATCH_NO` | nomor batch supplier (boleh = nomor GR bila tidak ada) |
| E | `EXPIRED_DATE` | `YYYY-MM-DD`, **wajib** bila `TRACK_EXPIRY=Y` |
| F | `RECEIVED_DATE` | tanggal masuk |
| G | `GR_NO` | dokumen asal |
| H | `QTY_ONHAND` | cache dari ledger (batch, gudang) |
| I | `QTY_RESERVED` | sudah dialokasikan belum diambil |
| J | `STATUS` | `GOOD` / `QUARANTINE` / `EXPIRED` |
| K | `UNIT_COST` | harga beli batch ini |
| L | `NOTES` | |

> `QTY_ONHAND` di sini adalah **cache** agar pembacaan cepat. Nilai kebenaran tetap dari
> `STOCK_LEDGER`; ada rutin rekonsiliasi (lihat §6.4) untuk memastikan keduanya sama.

### 2.7 Perubahan pada tab yang sudah ada

| Tab | Perubahan | Sifat |
|---|---|---|
| `PO_Header` | tetap; `GR_NO`, `RECEIVE_BY` sudah ada. Tambah `Y=GR_PDF_LINK` (belum dibuat) | tambahan |
| `PO_Detail` | tetap `H=QTY_TERIMA`, `I=KETERANGAN` | tidak berubah |
| `PR_Detail` | tetap `K=Qty Terima`, `L=Keterangan` | tidak berubah |
| `PO_Detail` | **tambah** `J=BATCH_NO`, `K=EXPIRED_DATE` (hanya terisi untuk item `TRACK_EXPIRY=Y`) | tambahan |
| `PO_Detail` | **tambah** `L=UNIT_BUY`, `M=QTY_PER_UNIT`, `N=QTY_BASE` — menyimpan "3 DUS × 30 = 90 PCS" agar bisa diaudit | tambahan |
| `PR_Header` | **tambah** `L=ISSUE_STATUS` (untuk permintaan divisi, lihat §3.3) | opsional |
| `Master_Stock` | dipertahankan; **header A–F dirapikan** dan diberi label `STOCK_QTY`, `PRICE` | perbaikan |

### 2.8 `PRICE_HISTORY` (baru — jembatan ke iPOSS)

iPOSS adalah **acuan harga**. Aplikasi ini tidak menghitung harga jual; ia menyimpan riwayat
harga dari iPOSS + harga beli aktual dari PO, agar Purchase bisa membandingkan.

| Kolom | Nama | Keterangan |
|---|---|---|
| A | `PRICE_ID` | `PRC-000001` |
| B | `ITEM_ID` | relasi `ITEM_MASTER` |
| C | `IPOS_CODE` | kode barang iPOSS |
| D | `PRICE_DATE` | tanggal berlaku |
| E | `BUY_PRICE` | harga beli acuan (dari iPOSS) **per `UNIT_BASE`** |
| F | `SELL_PRICE` | harga jual acuan (dari iPOSS) **per `UNIT_BASE`** |
| G | `SOURCE` | `IPOSS_IMPORT` / `PO_ACTUAL` / `MANUAL` |
| H | `REF_NO` | nomor PO bila `PO_ACTUAL` |
| I | `CREATED_BY` | |

Kolom F (`BUY_PRICE`) di `Master_Stock` sekarang menjadi **snapshot terakhir** dari tabel ini.

### 2.9 Tabel pendukung fase lanjutan

| Tabel | Isi | Fase |
|---|---|---|
| `STOCK_OPNAME` | header + detail hitung fisik (system vs actual vs selisih) | 3 |
| `STOCK_ADJUSTMENT` | header + detail koreksi + jejak approval | 3 |
| `TRANSFER_HEADER` / `TRANSFER_DETAIL` | transfer antar gudang + status in-transit | 2 |
| `ISSUE_HEADER` / `ISSUE_DETAIL` | permintaan barang antar divisi | 2 |
| `BIN_LOCATION` | rak/lokasi penyimpanan per gudang | 2 |

---

## 3. Alur Proses

### 3.1 Alur masuk barang (sudah ada, diperluas)

```text
PR → Approval → PO (boleh banyak item, satu supplier) → Barang datang
   → Staf gudang klik TERIMA (form sekarang)
   → [BARU] per item: pilih satuan terima (DUS/BAL/SAK/PCS) + qty
              sistem menghitung qty dalam satuan terkecil
              contoh: 3 DUS × 30 = 90 PCS
   → [BARU] bila item TRACK_EXPIRY=Y: isi No. Batch + Expired Date per item
   → Validasi: expired > hari ini, sisa umur ≥ SHELF_LIFE_DAYS minimum
   → Simpan:
       1. PO_Header   (status, DO, supir, nopol, GR_NO, dll)               ← sudah ada
       2. PO_Detail   H:I (qty terima, keterangan)
                      J:K (batch, expired)
                      L:N (unit beli, qty per unit, qty base)              ← diperluas
       3. PR_Detail   K:L (mirror)                                         ← sudah ada
       4. STOCK_BATCH (batch baru per item ber-expired, qty dalam PCS)
       5. STOCK_LEDGER (RECEIVE: qty transaksi + QTY_BASE hasil konversi)
       6. PRICE_HISTORY (harga beli aktual dari PO ini)
       7. Berita Acara GR PDF → Drive GR_PDF                              ← sudah ada
```

**Contoh konkret `A591-K`:**

| Tahap | Nilai |
|---|---|
| PO memesan | 3 DUS |
| Konversi | 1 DUS = 20 PCS → 3 × 20 = **60 PCS** |
| `PO_Detail` | `QTY`=3, `UNIT_BUY`=`DUS`, `QTY_PER_UNIT`=30, `QTY_BASE`=90 |
| `STOCK_LEDGER` | `QTY_IN`=3, `TRX_UNIT`=`DUS`, `QTY_BASE`=**+90** |
| Stok gudang | bertambah 90 PCS |
| Penjualan eceran | 1 PCS → `QTY_BASE`=**−1** → sisa 89 PCS |

### 3.2 Penentuan batch & expired saat terima

Aturan yang saya sarankan (mohon dikoreksi bila tidak sesuai praktik gudang):

1. **Satu baris PO = satu batch.** Bila dalam satu DO datang 2 batch berbeda untuk item yang
   sama, staf menekan "Tambah baris" pada item tersebut (perlu perubahan form kecil).
2. **Nomor batch** diambil dari kemasan supplier. Bila tidak ada, sistem membuat
   `{GR_NO}-{urut}` dan menandai `NOTES = "batch internal"`.
3. **Expired Date wajib** dan tidak boleh ≤ hari ini. Beri peringatan (bukan blokir) bila
   sisa umur < 30% dari `SHELF_LIFE_DAYS` — barang tetap diterima tapi ditandai.
4. Barang yang datang sudah dekat expired tetap dicatat, `STATUS = GOOD`, tapi langsung masuk
   daftar prioritas FEFO.

### 3.3 Permintaan barang antar divisi (Fase 2)

Sekarang PR hanya untuk **pembelian ke supplier**. WMS juga butuh permintaan **dari stok gudang**.

```text
Divisi minta barang → ISSUE (status WAITING)
   → Supervisor gudang approve
   → Sistem usulkan batch FEFO (expired terdekat lebih dulu)
   → Staf gudang picking & mencatat batch aktual yang diambil
   → Surat Jalan Internal (PDF) + STOCK_LEDGER: ISSUE
   → Stok berkurang, batch berkurang
```

Keputusan penting: **bila stok tidak cukup**, sistem menawarkan dua jalur —
(a) penuhi sebagian lalu buat PR pembelian untuk sisanya, atau (b) tolak dan buat PR.
Saran: **(a)**, karena divisi tidak boleh menunggu pembelian untuk barang yang ada.

**Permintaan boleh dalam satuan besar maupun eceran.** Divisi bisa minta "2 RENCENG" atau
"5 PCS"; sistem mengonversi ke `QTY_BASE` saat menulis ledger, dan menampilkan sisa stok
dalam **kedua satuan** (mis. "sisa 89 PCS = 2 RENCENG + 9 PCS") supaya staf gudang tidak salah hitung.

### 3.4 FEFO (First Expired First Out)

Saat mengeluarkan barang ber-expired, urutan batch yang dipakai:

1. `STATUS = GOOD`
2. `EXPIRED_DATE` paling dekat
3. Bila expired sama → `RECEIVED_DATE` paling awal
4. Bila berbeda gudang → gudang asal permintaan dulu

Bila staf memilih batch lain, **wajib isi alasan** (masuk ke `STOCK_LEDGER.NOTES`).

### 3.5 Alert expired bertingkat

| Ambang | Warna | Aksi |
|---|---|---|
| H-90 | kuning | Masuk laporan mingguan |
| H-60 | oranye | Notifikasi ke supervisor gudang |
| H-30 | merah | Notifikasi WhatsApp/Telegram (infrastruktur sudah ada) + usul promosi/retur |
| Lewat tanggal | hitam | Otomatis `STATUS=EXPIRED`, dilarang keluar, masuk daftar write-off |

### 3.6 Write-off & karantina

```text
Barang expired/rusak → pindah STATUS ke QUARANTINE (tetap tercatat stoknya)
   → Supervisor review → ajukan WRITEOFF
   → Approval (Admin/Manager)
   → STOCK_LEDGER: WRITEOFF + STATUS=EXPIRED
   → Laporan kerugian per kategori/gudang
```

Prinsip: **jangan pernah hapus baris** untuk mengurangi stok. Selalu lewat mutasi.

### 3.7 Stock opname (cycle count)

- Dibagi per kategori (80 kategori terlalu banyak untuk sekali jalan).
- Frekuensi berbasis nilai & risiko: kategori obat/pakan (ber-expired) lebih sering.
- Selisih → `OPNAME_IN`/`OPNAME_OUT` + approval bila nilainya di atas ambang.
- Target akurasi: **≥98%** (jumlah SKU tanpa selisih / total SKU dihitung).

### 3.8 Reorder point → usul PR otomatis

```text
Setiap malam (cron Vercel sudah tersedia):
  untuk tiap item: stok total semua gudang vs REORDER_POINT
  bila stok ≤ REORDER_POINT → buat draft "usulan PR"
  → Purchase mereview → jadikan PR (tanpa mengetik ulang)
```

Ini menutup lingkaran: pembelian jadi reaktif berdasarkan data stok nyata, bukan perkiraan.

---

## 4. Daftar Endpoint API

Semua `/api/*` wajib sesi login (kecuali `/api/health`, `/api/login`, `/api/pdf/*`).

### 4.1 Master (Fase 1)

| Method | Endpoint | Akses | Fungsi |
|---|---|---|---|
| GET | `/api/items` | semua login | Daftar item + filter kategori/expiry/aktif |
| GET | `/api/items/:itemId` | semua login | Detail item |
| POST | `/api/items` | ADMIN, PURCHASE | Buat item (auto `ITEM_ID`) |
| PUT | `/api/items/:itemId` | ADMIN, PURCHASE | Edit item |
| PATCH | `/api/items/:itemId/expiry` | ADMIN | Set `TRACK_EXPIRY`, shelf life |
| GET | `/api/categories` | semua login | Master kategori + default expiry |
| GET | `/api/units/conversion` | semua login | Rantai konversi berjenjang per item |
| POST | `/api/units/conversion` | ADMIN | Tambah/ubah konversi (ditolak bila item sudah punya transaksi) |
| POST | `/api/units/convert` | semua login | Bantu hitung: `{itemId, from:"DUS", qty:3}` → `{base:90}` |
| GET | `/api/prices/:itemId` | semua login | Riwayat harga beli & jual (iPOSS + PO aktual) |
| POST | `/api/prices/import` | ADMIN, PURCHASE | Impor harga dari ekspor iPOSS (CSV) |
| GET | `/api/warehouses` | semua login | Daftar gudang |

### 4.2 Persediaan (Fase 1)

| Method | Endpoint | Akses | Fungsi |
|---|---|---|---|
| GET | `/api/stock/summary` | semua login | Stok per item per gudang (dari ledger) |
| GET | `/api/stock/ledger` | semua login | Mutasi, filter tanggal/item/gudang/tipe |
| GET | `/api/stock/batches` | semua login | Batch + sisa + expired, filter status |
| GET | `/api/stock/expiring` | semua login | Batch akan expired (default H-90) |
| POST | `/api/stock/adjust` | ADMIN, SUPERVISOR | Adjustment dengan alasan (butuh approval di Fase 3) |
| POST | `/api/stock/opname` | ADMIN, SUPERVISOR | Simpan hasil opname |
| POST | `/api/stock/writeoff` | ADMIN | Write-off barang expired/rusak |

### 4.3 Operasional (Fase 2)

| Method | Endpoint | Fungsi |
|---|---|---|
| POST | `/api/issue` | Buat permintaan barang divisi |
| POST | `/api/issue/:id/approve` | Approval supervisor |
| POST | `/api/issue/:id/pick` | Picking FEFO (catat batch aktual) |
| GET | `/api/pdf/issue/:id` | Surat Jalan Internal (PDF) |
| POST | `/api/transfer` | Transfer antar gudang |
| POST | `/api/transfer/:id/receive` | Konfirmasi terima di gudang tujuan |

### 4.4 Laporan (Fase 3–4)

| Method | Endpoint | Fungsi |
|---|---|---|
| GET | `/api/reports/stock-value` | Nilai persediaan per gudang/kategori |
| GET | `/api/reports/aging-expiry` | Umur stok & nilai akan expired |
| GET | `/api/reports/movement` | Fast/slow moving, days of inventory |
| GET | `/api/reports/accuracy` | Akurasi stok dari hasil opname |
| GET | `/api/reports/reorder` | Item di bawah reorder point |

### 4.5 Perluasan endpoint yang sudah ada

| Endpoint lama | Perubahan |
|---|---|
| `POST /api/po/receive` | + validasi & simpan batch/expired; + tulis `STOCK_LEDGER` (`RECEIVE`) dan `STOCK_BATCH` |
| `GET /api/po/receive/:poNo` | + kembalikan `trackExpiry`/`shelfLifeDays` per item agar form tahu kolom mana yang wajib |
| `GET /api/stock` | tetap ada untuk kompatibilitas; diarahkan membaca `ITEM_MASTER` |
| `GET /api/stats` | + kartu "akan expired", "item di bawah minimum" |

---

## 5. Perubahan Frontend

| Halaman | Perubahan | Fase |
|---|---|---|
| `ReceiveForm.tsx` | Tambah kolom **No. Batch** + **Expired Date** secara kondisional (`TRACK_EXPIRY=Y`); tombol "tambah batch" | 1 |
| **Stok Gudang** (baru) | Tabel stok per gudang, pencarian, filter kategori, indikator min/max | 1 |
| **Kartu Stok** (baru) | Detail per item: mutasi kronologis + daftar batch + expired | 1 |
| **Expiry Monitor** (baru) | Daftar batch H-90/H-60/H-30, aksi karantina/write-off | 1 |
| **Permintaan Divisi** (baru) | Form permintaan + FEFO suggestion + surat jalan | 2 |
| **Transfer** (baru) | Buat transfer, status in-transit, konfirmasi terima | 2 |
| **Opname** (baru) | Layar hitung fisik per kategori, bandingkan sistem | 3 |
| `SettingsView` | Kelola item, kategori, **konversi berjenjang**, gudang, kode iPOSS | 1 |
| **Master Konversi** (baru) | Layar khusus: pilih item → susun rantai `BAL → RENCENG → PCS` dengan uji hasil ("1 BAL = 40 PCS") | 1 |
| **Harga** (baru) | Riwayat harga beli/jual per item, bandingkan PO aktual vs acuan iPOSS | 1 |
| Sidebar/menu | Grup menu baru: **GUDANG** (Stok, Kartu Stok, Expiry, Opname, Transfer) | 1 |

---

## 6. Risiko & Mitigasi

### 6.1 Batas Google Sheets

| Risiko | Ambang | Mitigasi |
|---|---|---|
| `STOCK_LEDGER` membesar | ±50.000 baris (≈2 tahun untuk 3 gudang) | Arsip tahunan ke sheet terpisah; siapkan jalur pindah Postgres |
| Penulisan bersamaan | 2+ staf input serupa bersamaan | Gunakan `batchUpdate` + kunci baris; dokumentasikan agar tidak dobel klik |
| Kuota API | 300 request/menit per project | Cache master data di server (TTL 5 menit); hindari baca seluruh sheet per request |

### 6.2 Integritas data

- **Nama item duplikat** (8 kasus) → wajib `ITEM_ID`; form PR memakai dropdown `ITEM_ID`.
- **Header `Master_Stock` tidak sinkron** (A–D vs data A–F) → perbaiki sebelum migrasi.
- **Satuan kosong** (251 item) → lengkapi saat migrasi.
- **`User_Role` belum lengkap** (±83 user) → lengkapi ROLE/DIVISION/ACCESS sebelum Fase 2.

### 6.3 Keamanan

- `/api/admin/*` sudah dilindungi; tambahkan peran **SUPERVISOR GUDANG** dan **CHECKER**.
- Adjustment & write-off **tidak boleh** dilakukan orang yang sama dengan yang menyetujui.
- Semua mutasi stok menyimpan `USER` — tidak ada perubahan tanpa jejak.

### 6.4 Rekonsiliasi internal

Rutin harian: bandingkan `STOCK_BATCH.QTY_ONHAND` dengan hasil penjumlahan `STOCK_LEDGER`
per `ITEM_ID` + `WH_CODE` + `BATCH_ID`. Selisih → log peringatan, bukan koreksi otomatis.

### 6.5 Rekonsiliasi dengan iPOSS (risiko utama)

Karena iPOSS dan WMS sama-sama mencatat stok, akan ada selisih. Penyebab yang paling sering:

| Penyebab | Contoh | Penanganan |
|---|---|---|
| Penjualan di iPOSS belum tercatat di WMS | Kasir jual 5 PCS, WMS belum tahu | Sinkronisasi keluar harian dari iPOSS, atau akui WMS hanya mengatur sisi **masuk** |
| Perbedaan satuan | iPOSS mencatat 20 PCS, staf gudang mencatat 1 DUS | Konversi berjenjang sudah dimigrasi (2.800 baris, 0 selisih) |
| Waktu potong berbeda | iPOSS tutup buku 23:59, WMS 00:00 | Tetapkan jam potong yang sama |
| Barang rusak/expired | WMS write-off, iPOSS belum | Kirim penyesuaian ke iPOSS atau catat sebagai selisih resmi |

**Rekomendasi tegas:** tetapkan **satu sumber kebenaran per peran** sejak awal —
- Stok **fisik gudang** (masuk, mutasi, batch, expired) → **WMS**
- Stok **komersial** (terjual, tersedia untuk dijual) → **iPOSS**

Lalu buat laporan selisih mingguan. Jangan diam-diam menimpa angka satu sama lain.

---

## 7. Rencana Migrasi Data (dijalankan sebelum Fase 1 rilis)

**Langkah 0 — Konfirmasi ke pemilik data**

Sudah terjawab:

| Pertanyaan | Jawaban |
|---|---|
| Kolom E | Qty total **seluruh gudang**, dalam satuan terkecil. Boleh dihapus setelah saldo awal pindah ke ledger |
| Kolom F | Harga beli, acuan dari **iPOSS** |
| `TRACK_EXPIRY` | **2.220 item** kategori pakan/food/obat/vaksin/jamu/DOC/hasil bumi/shampoo/desinfektan → disetujui |
| Sumber harga | iPOSS (harga beli & jual) |
| Multi-item per PO | Sudah didukung: satu PO boleh banyak item untuk satu supplier |

Masih perlu dijawab:

1. `SHELF_LIFE_DAYS` per kategori ber-expired (dari kemasan/supplier)
2. Rantai konversi per item — **prioritas 500 item** yang punya satuan besar
   (**2.730 item** punya satuan besar; sudah dimigrasi ke `UNIT_CONVERSION` — 2.800 baris)
3. Kolom kunci dari ekspor iPOSS: nama file, nama kolom untuk kode barang, qty, harga beli, harga jual
4. 8 nama item duplikat — apakah memang barang berbeda?

**Langkah 0b — Ekspor dari iPOSS**

1. Ekspor daftar barang: kode, nama, satuan, qty, harga beli, harga jual
2. Simpan sebagai CSV; impor ke `PRICE_HISTORY` (`SOURCE = IPOSS_IMPORT`)
3. Cocokkan `Master_Stock` ↔ iPOSS berdasarkan **nama** (karena hanya 2 item punya kode),
   hasil pencocokan disimpan di `ITEM_MASTER.IPOS_CODE`
4. Item yang tidak ketemu dicatat di laporan terpisah untuk dicocokkan manual

**Langkah 1 — Bekukan & cadangkan**
- Ekspor spreadsheet ke XLSX, simpan sebagai arsip bertanggal.
- Minta tim berhenti input transaksi selama migrasi (±1 hari).

**Langkah 2 — Bangun master**
- Buat tab baru: `ITEM_MASTER`, `CATEGORY_MASTER`, `UNIT_CONVERSION`, `WAREHOUSE`,
  `STOCK_LEDGER`, `STOCK_BATCH`.
- Isi `ITEM_MASTER` dari `Master_Stock` + `ITEM_ID` berurutan. Pertahankan `ITEM_NAME` asli.
- Isi `CATEGORY_MASTER` dari 80 kategori unik + default expiry.
- Isi `WAREHOUSE` dari 3 gudang (NGY, PCL, CRS).

**Langkah 3 — Saldo awal**

Karena kolom E = **total seluruh gudang** (bukan per gudang), saldo awal harus dialokasikan:

| Skenario | Cara |
|---|---|
| Anda punya angka stok **per gudang** | Isi ledger per gudang sesuai angka tersebut |
| **Sudah ada stok per gudang** (Nagoya, Poncol, Ciracas) | **Rekomendasi:** saldo awal dari file per gudang, ditulis sebagai entri `OPNAME_IN` per item×gudang. Bukan dialokasikan dari total — selisih terbukti sampai 112 unit pada satu item |
| Sementara sebelum opname | Alokasikan seluruh total ke satu gudang penampung (`NGY`), beri `NOTES = "alokasi sementara, menunggu opname"`, lalu pindahkan lewat `TRANSFER` setelah dihitung |

- Untuk item `TRACK_EXPIRY=N`: satu baris `STOCK_LEDGER` bertipe `ADJUST_IN`
  dengan `REF_NO = OPENING-2026-11-18`, `NOTES = "saldo awal migrasi"`, `QTY_BASE` = qty terkecil.
- Untuk item `TRACK_EXPIRY=Y`: butuh batch awal. Buat `STOCK_BATCH` dengan
  `BATCH_NO = OPENING-2026-11-18` dan **expired date = perkiraan terbaik** (bila tidak diketahui,
  isi tanggal akhir tahun berjalan dan tandai `NOTES = "expired belum terverifikasi"`).
- Barang tanpa expired yang tidak diketahui → masuk `STATUS=GOOD` dengan catatan.

**Langkah 4 — Verifikasi**
- Total qty di ledger awal harus **sama** dengan kolom E `Master_Stock` (bila E memang stok).
- Cetak laporan "Stok Awal per Gudang/Kategori" untuk ditandatangani supervisor.

**Langkah 5 — Rilis bertahap**
- Aktifkan dulu **hanya baca** (Stok Gudang + Kartu Stok) selama 1 minggu.
- Setelah data dipercaya, aktifkan penulisan (GR dengan batch, adjustment).

---

## 8. Urutan Implementasi & Definisi Selesai

### Fase 1 — Fondasi (±2–3 minggu)

| # | Deliverable | Definisi Selesai |
|---|---|---|
| 1.1 | Tab master baru + `IPOS_CODE` + impor harga iPOSS | `PRICE_HISTORY` terisi; persentase item yang berhasil dicocokkan dilaporkan |
| 1.2 | **Konversi satuan berjenjang** + layar Master Konversi | `1 BAL = 4 RENCENG = 40 PCS` tersimpan; endpoint `/api/units/convert` benar untuk 20 item uji |
| 1.3 | `STOCK_LEDGER` + `STOCK_BATCH` + penomoran | Mutasi tersimpan; penomoran `LGR-`/`BTC-` unik & berurutan |
| 1.4 | GR diperluas: satuan terima + konversi + batch/expired | Item `A591-K` 3 DUS tersimpan sebagai 60 PCS; item `TRACK_EXPIRY=Y` wajib batch+expired |
| 1.5 | Halaman Stok Gudang + Kartu Stok | Stok per gudang cocok dengan penjumlahan `QTY_BASE` di ledger; tampil dalam 2 satuan |
| 1.6 | Expiry Monitor + alert | Batch H-90/H-60/H-30 muncul dan terkirim notifikasi |
| 1.7 | Unit test + dokumentasi | `typecheck`, `test`, `build` lolos; `docs/SPREADSHEET_SCHEMA.md` diperbarui |

### Fase 2 — Operasional (±3–4 minggu)
Putaway/bin, Permintaan Divisi (+ FEFO, surat jalan), Transfer antar gudang, Barcode/QR.

### Fase 3 — Pengendalian (±2–3 minggu)
Opname (cycle count), Adjustment ber-approval, Reorder point → usul PR, Write-off, laporan akurasi.

### Fase 4 — Analitik (±2 minggu)
Nilai persediaan, aging expiry, fast/slow moving, ABC analysis, dashboard KPI gudang.

---

## 9. Status Keputusan

### Sudah dijawab (2026-11-18)

| # | Pertanyaan | Jawaban | Konsekuensi pada desain |
|---|---|---|---|
| 1 | Kolom E `Master_Stock` | Qty total **seluruh gudang**, boleh dihapus | Saldo awal harus dialokasikan per gudang; ledger jadi sumber kebenaran |
| 2 | Harga | iPOSS = acuan harga beli & jual | Tabel `PRICE_HISTORY` + `IPOS_CODE` di `ITEM_MASTER` |
| 3 | `TRACK_EXPIRY` 1.601 item | **Setuju** | Form GR wajib batch+expired untuk 41% item |
| 4 | Multi-batch | Belum diputuskan; PO boleh banyak item per supplier | Form GR dibuat fleksibel: 1 baris PO = 1 batch default, tombol "tambah batch" bila perlu |
| 5 | Konversi satuan | **Ada, dan wajib** — bisnis melayani partai besar & eceran PCS | `UNIT_CONVERSION` berjenjang; stok selalu satuan terkecil |
| 6 | Sumber stok | iPOSS (qty satuan terkecil) | Ikut model ini: qty terkecil, bukan DUS |

### Masih perlu dijawab (tidak menghalangi mulai Fase 1, tapi menghalangi rilis)

| # | Pertanyaan | Dipakai untuk |
|---|---|---|
| 1 | Format ekspor iPOSS: nama file, nama kolom kode/nama/qty/harga beli/harga jual | Impor `PRICE_HISTORY` & pencocokan `IPOS_CODE` |
| 2 | Apakah ada angka stok **per gudang**, atau hanya total? | Rencana saldo awal (§7 Langkah 3) |
| 3 | `SHELF_LIFE_DAYS` per kategori ber-expired | Validasi saat GR & alert expiry |
| 4 | Rantai konversi prioritas 500 item (BAL/SAK/PAK/SET/RENC + item dibeli dalam DUS) | Master Konversi |
| 5 | Siapa role yang boleh adjustment & write-off? | Matriks hak akses Fase 3 |
| 6 | Barcode di Fase 2 atau tunda? | Kecepatan opname 8.789 SKU |

## 10. Yang TIDAK dilakukan (sengaja)

- **Tidak** memindahkan ke database dulu — Fase 1 tetap Sheets agar perubahan kecil dan bisa dibalik.
- **Tidak** membongkar modul PR/PO yang sudah berjalan.
- **Tidak** menghapus `Master_Stock` lama — dipertahankan sebagai referensi dan daftar pilihan.
- **Tidak** mengubah alur approval pembelian yang sudah ada.
- **Tidak** membuat multi-currency, multi-company, atau akuntansi penuh — di luar cakupan WMS ini.
