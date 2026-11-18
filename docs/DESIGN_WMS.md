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

### Tiga keputusan inti yang harus disepakati

| # | Keputusan | Alasan |
|---|---|---|
| 1 | Stok **tidak** disimpan sebagai angka di `Master_Stock`, melainkan dihitung dari `STOCK_LEDGER` | Tanpa jejak audit, WMS hanya tebakan. Opname, koreksi, dan laporan butuh riwayat. |
| 2 | `TRACK_EXPIRY` ditentukan **per item**, tanggal expired disimpan **per batch** | Tanggal kedaluwarsa berbeda tiap kedatangan, tidak bisa menempel di item |
| 3 | Fase 1 **tetap Google Sheets**, tetapi strukturnya disiapkan agar mudah pindah ke Postgres | Perubahan kecil dulu, risiko rendah; migrasi dilakukan saat data sudah besar |

### Fakta data produksi (hasil pembacaan langsung, 2026-11-18)

| Temuan | Angka | Implikasi |
|---|---|---|
| Item di `Master_Stock` | **3.875 baris** | Terlalu banyak untuk diopname manual tanpa barcode |
| Kategori | **80 kategori** | Perlu master kategori terpisah (sekarang teks bebas) |
| Nama item duplikat | 8 nama / 16 baris | Perlu `ITEM_ID` sebagai kunci, bukan nama |
| Header `Master_Stock` | A–D saja, padahal **kolom E dan F berisi data** (3.875 & 3.842 baris) | Header tidak sinkron; E/F kemungkinan stok & harga. **Harus diputuskan bersama pemilik data.** |
| Nilai kolom E | 0 – 51.972, median 3 | Dugaan kuat: **stok**. Jika benar, ini stok gudang mana? (3 gudang) |
| Nilai kolom F | 0 – 2.175.000, median 23.500 | Dugaan kuat: **harga** (harga di `PO_Detail` median ~23.500 juga) |
| Satuan | PCS 3.166, SAK 166, SET 74, BAL 73, PAK 55, ROLL 17, RENC 17, kosong 251 | Perlu konversi satuan untuk item BAL/SAK/PAK |
| Item yang perlu `TRACK_EXPIRY=Y` | **1.601 item (41%)** | Pakan, cat/dog food, obat, vaksin, jamu, DOC, hasil bumi, shampoo, desinfektan |
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
   │  Master Item ──► Stock Ledger ──► Stock Batch (expired)                │
   │       │                 │                  │                           │
   │       ├── Putaway ◄─────┘                  ├── FEFO Picking            │
   │       ├── Permintaan Divisi (Issue)        ├── Alert Expiry            │
   │       ├── Transfer Antar Gudang            ├── Write-off / Karantina   │
   │       ├── Stock Opname (cycle count)       └── Laporan Aging           │
   │       └── Reorder Point ──► usul PR (balik ke modul lama)              │
   └────────────────────────────────────────────────────────────────────────┘
```

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
| A | `ITEM_ID` | teks | ya | Kunci utama, auto: `ITM-000001`. **Tidak berubah walau nama item diedit** |
| B | `ITEM_NAME` | teks | ya | Nama barang (boleh duplikat, kunci tetap ITEM_ID) |
| C | `CATEGORY` | teks | ya | Diambil dari `CATEGORY_MASTER` |
| D | `SUPPLIER` | teks | tidak | Supplier utama |
| E | `UNIT_BASE` | teks | ya | Satuan terkecil (PCS/SAK/BAL/…) |
| F | `TRACK_EXPIRY` | `Y`/`N` | ya | **Penentu apakah batch & expired wajib** |
| G | `TRACK_BATCH` | `Y`/`N` | ya | `Y` bila nomor batch supplier perlu dilacak walau tanpa expired |
| H | `SHELF_LIFE_DAYS` | angka | tidak | Umur simpan (hari). Dipakai validasi saat GR |
| I | `MIN_STOCK` | angka | tidak | Batas bawah → memicu usulan PR |
| J | `MAX_STOCK` | angka | tidak | Batas atas → peringatan overstock |
| K | `REORDER_POINT` | angka | tidak | Titik pemesanan ulang |
| L | `IS_ACTIVE` | `Y`/`N` | ya | Nonaktifkan tanpa menghapus riwayat |
| M | `NOTES` | teks | tidak | Catatan |
| N | `CREATED_AT` | tanggal | ya | |
| O | `UPDATED_AT` | tanggal | ya | |

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

Manfaat: mempercepat pembuatan item baru (3.875 item, penambahan rutin), dan menjaga
`TRACK_EXPIRY` konsisten — mis. semua `CAT FOOD WET KALENG` otomatis `Y` dengan shelf life 540 hari.

### 2.3 `UNIT_CONVERSION` (baru)

| Kolom | Nama | Keterangan |
|---|---|---|
| A | `ITEM_ID` | atau `CATEGORY_ID` bila berlaku umum |
| B | `FROM_UNIT` | mis. `BAL` |
| C | `TO_UNIT` | mis. `SAK` |
| D | `FACTOR` | mis. `2` (1 BAL = 2 SAK) |
| E | `NOTES` | |

Wajib untuk 405 item bersatuan BAL/SAK/PAK/SET. Tanpa ini, stok akan selalu selisih
saat pembelian masuk dalam BAL tetapi permintaan keluar dalam SAK.

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
| H | `QTY_IN` | angka ≥ 0 |
| I | `QTY_OUT` | angka ≥ 0 |
| J | `UNIT` | satuan saat transaksi |
| K | `QTY_BASE` | qty setelah konversi ke `UNIT_BASE` (positif masuk, negatif keluar) |
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
| `PR_Header` | **tambah** `L=ISSUE_STATUS` (untuk permintaan divisi, lihat §3.3) | opsional |
| `Master_Stock` | dipertahankan; **header A–F dirapikan** dan diberi label `STOCK_QTY`, `PRICE` | perbaikan |

### 2.8 Tabel pendukung fase lanjutan

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
PR → Approval → PO → Barang datang
   → Staf gudang klik TERIMA (form sekarang)
   → [BARU] bila item TRACK_EXPIRY=Y: isi No. Batch + Expired Date per item
   → Validasi: expired > hari ini, sisa umur ≥ SHELF_LIFE_DAYS minimum
   → Simpan:
       1. PO_Header  (status, DO, supir, nopol, GR_NO, dll)          ← sudah ada
       2. PO_Detail  H:I (qty terima, keterangan) + J:K (batch, exp)  ← diperluas
       3. PR_Detail  K:L (mirror)                                    ← sudah ada
       4. STOCK_BATCH  (buat batch baru per item ber-expired)
       5. STOCK_LEDGER (baris RECEIVE per item)
       6. Berita Acara GR PDF → Drive GR_PDF                         ← sudah ada
```

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
| GET | `/api/units/conversion` | semua login | Konversi satuan |
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
| `SettingsView` | Kelola item, kategori, konversi satuan, gudang | 1 |
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

### 6.4 Rekonsiliasi

Rutin harian: bandingkan `STOCK_BATCH.QTY_ONHAND` dengan hasil penjumlahan `STOCK_LEDGER`
per `ITEM_ID` + `WH_CODE` + `BATCH_ID`. Selisih → log peringatan, bukan koreksi otomatis.

---

## 7. Rencana Migrasi Data (dijalankan sebelum Fase 1 rilis)

**Langkah 0 — Konfirmasi ke pemilik data (WAJIB, manusia)**

1. Kolom **E** di `Master_Stock` — apakah benar stok? Gudang mana? Per tanggal berapa?
2. Kolom **F** — apakah harga beli terakhir?
3. 80 kategori → mana yang `TRACK_EXPIRY=Y` (usulan awal sudah dibuat, perlu dikoreksi)
4. `SHELF_LIFE_DAYS` per kategori ber-expired (dari supplier/kemasan)
5. Konversi satuan untuk 405 item BAL/SAK/PAK/SET
6. 8 nama item duplikat — apakah memang barang berbeda?

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
- Untuk item `TRACK_EXPIRY=N`: satu baris `STOCK_LEDGER` bertipe `ADJUST_IN`
  dengan `REF_NO = OPENING-2026-11-18`, `NOTES = "saldo awal migrasi"`.
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
| 1.1 | Tab master baru + migrasi | Total qty saldo awal = data lama; laporan ditandatangani |
| 1.2 | `STOCK_LEDGER` + `STOCK_BATCH` + penomoran | Mutasi tersimpan; penomoran `LGR-`/`BTC-` unik & berurutan |
| 1.3 | GR diperluas (batch & expired) | Item `TRACK_EXPIRY=Y` tidak bisa disimpan tanpa batch+expired; ledger & batch terbentuk otomatis |
| 1.4 | Halaman Stok Gudang + Kartu Stok | Stok per gudang cocok dengan penjumlahan ledger |
| 1.5 | Expiry Monitor + alert | Batch H-90/H-60/H-30 muncul dan terkirim notifikasi |
| 1.6 | Unit test + dokumentasi | `typecheck`, `test`, `build` lolos; `docs/SPREADSHEET_SCHEMA.md` diperbarui |

### Fase 2 — Operasional (±3–4 minggu)
Putaway/bin, Permintaan Divisi (+ FEFO, surat jalan), Transfer antar gudang, Barcode/QR.

### Fase 3 — Pengendalian (±2–3 minggu)
Opname (cycle count), Adjustment ber-approval, Reorder point → usul PR, Write-off, laporan akurasi.

### Fase 4 — Analitik (±2 minggu)
Nilai persediaan, aging expiry, fast/slow moving, ABC analysis, dashboard KPI gudang.

---

## 9. Keputusan yang Diminta dari Anda

Mohon jawab agar Fase 1 bisa langsung dieksekusi tanpa asumsi:

| # | Pertanyaan | Dampak bila belum dijawab |
|---|---|---|
| 1 | Kolom **E** `Master_Stock` = stok? Gudang mana? Per tanggal? | Saldo awal salah; semua laporan ikut salah |
| 2 | Kolom **F** = harga beli terakhir? | Nilai persediaan tidak bisa dihitung |
| 3 | Setuju usulan `TRACK_EXPIRY=Y` untuk 1.601 item (pakan, food, obat, vaksin, jamu, DOC, hasil bumi, shampoo, desinfektan)? | Form GR tidak tahu kolom mana yang wajib |
| 4 | Satu baris PO = satu batch, atau perlu multi-batch per item sejak awal? | Mempengaruhi rancangan form & skema |
| 5 | Boleh menambah tab baru (6 tab) tanpa mengganggu laporan lama? | Menentukan desain migrasi |
| 6 | Siapa role yang boleh adjustment & write-off? | Menentukan matriks hak akses |
| 7 | Siapkan barcode di Fase 2 (printer + scanner) atau tunda? | Kecepatan opname 3.875 SKU |

---

## 10. Yang TIDAK dilakukan (sengaja)

- **Tidak** memindahkan ke database dulu — Fase 1 tetap Sheets agar perubahan kecil dan bisa dibalik.
- **Tidak** membongkar modul PR/PO yang sudah berjalan.
- **Tidak** menghapus `Master_Stock` lama — dipertahankan sebagai referensi dan daftar pilihan.
- **Tidak** mengubah alur approval pembelian yang sudah ada.
- **Tidak** membuat multi-currency, multi-company, atau akuntansi penuh — di luar cakupan WMS ini.
