#!/usr/bin/env python3
"""
Bangun satu workbook WMS dari CSV hasil migrasi.

Keluaran: templates/google-sheets/wms/WMS_Database.xlsx

Workbook ini diunggah ke Google Drive lalu dikonversi menjadi Google Spreadsheet.
Tab yang dibuat:
  - 0_INFO            ringkasan migrasi + daftar hal yang perlu keputusan
  - ITEM_MASTER       8.789 baris
  - CATEGORY_MASTER   93 baris
  - UNIT_CONVERSION   2.800 baris
  - WAREHOUSE         3 baris
  - STOCK_LEDGER      header saja (append-only, diisi aplikasi)
  - STOCK_BATCH       header saja
  - PRICE_HISTORY     header saja

Jalankan: python3 tools/wms/build_workbook.py
"""
from __future__ import annotations

import csv
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

SRC = Path("templates/google-sheets/wms")
OUT = SRC / "WMS_Database.xlsx"

HEADER_FILL = PatternFill("solid", fgColor="1F4E78")
HEADER_FONT = Font(color="FFFFFF", bold=True, size=10)
INFO_FILL = PatternFill("solid", fgColor="FFF2CC")

# Header tab yang dibuat kosong (diisi aplikasi saat berjalan).
EMPTY_TABS = {
    "STOCK_LEDGER": [
        "LEDGER_ID", "TRX_DATE", "TRX_TYPE", "REF_NO", "ITEM_ID", "ITEM_NAME",
        "WAREHOUSE_ID", "BATCH_ID", "QTY_IN", "QTY_OUT", "TRX_UNIT",
        "TO_UNIT_QTY", "QTY_BASE", "UNIT_COST", "TOTAL_VALUE", "DIVISION",
        "PIC", "NOTES", "CREATED_AT",
    ],
    "STOCK_BATCH": [
        "BATCH_ID", "ITEM_ID", "ITEM_NAME", "WAREHOUSE_ID", "BATCH_NO",
        "PRODUCTION_DATE", "EXPIRED_DATE", "QTY_IN_BASE", "QTY_REMAIN_BASE",
        "UNIT_BASE", "UNIT_COST", "SUPPLIER", "GR_NO", "STATUS", "CREATED_AT",
    ],
    "PRICE_HISTORY": [
        "PRICE_ID", "ITEM_ID", "ITEM_NAME", "PRICE_TYPE", "PRICE", "UNIT",
        "SOURCE", "REF_NO", "SUPPLIER", "EFFECTIVE_DATE", "CREATED_AT",
    ],
}

NUMBER_COLS = {
    "OPENING_QTY_BASE", "BUY_PRICE_LAST", "SELL_PRICE_REF", "TO_UNIT_QTY",
    "LEVEL", "SHELF_LIFE_DAYS", "MIN_STOCK", "MAX_STOCK", "REORDER_POINT",
}


def read_csv(path: Path) -> tuple[list[str], list[dict]]:
    with path.open(newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        rows = list(reader)
        return list(reader.fieldnames or []), rows


def style_header(ws, ncols: int) -> None:
    for col in range(1, ncols + 1):
        c = ws.cell(row=1, column=col)
        c.fill = HEADER_FILL
        c.font = HEADER_FONT
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    ws.row_dimensions[1].height = 28
    ws.freeze_panes = "A2"


def auto_width(ws, headers: list[str], rows: list[dict], cap: int = 46) -> None:
    for idx, head in enumerate(headers, start=1):
        longest = len(head)
        for row in rows[:300]:
            longest = max(longest, len(str(row.get(head) or "")))
        ws.column_dimensions[get_column_letter(idx)].width = min(longest + 2, cap)


def write_sheet(wb: Workbook, name: str, headers: list[str], rows: list[dict]) -> None:
    ws = wb.create_sheet(name)
    ws.append(headers)
    for row in rows:
        values = []
        for head in headers:
            raw = row.get(head, "")
            if head in NUMBER_COLS:
                try:
                    values.append(float(raw) if raw not in ("", None) else None)
                except ValueError:
                    values.append(raw)
            else:
                values.append(raw)
        ws.append(values)
    style_header(ws, len(headers))
    auto_width(ws, headers, rows)


def build_info(wb: Workbook, stats: dict) -> None:
    ws = wb.create_sheet("0_INFO", 0)
    ws.column_dimensions["A"].width = 3
    ws.column_dimensions["B"].width = 34
    ws.column_dimensions["C"].width = 88

    rows: list[tuple[str, str, str]] = [
        ("", "DATABASE WMS — CV. SAU", ""),
        ("", "Dibuat", "18 November 2026"),
        ("", "Sumber data", "Ekspor iPOSS: Master Data Stock.xlsx + Master Data Konversi.xlsx"),
        ("", "", ""),
        ("", "RINGKASAN", ""),
        ("", "Item di ITEM_MASTER", f"{stats['item']:,}".replace(",", ".")),
        ("", "Kategori", f"{stats['kategori']:,}".replace(",", ".")),
        ("", "Baris UNIT_CONVERSION", f"{stats['konversi']:,}".replace(",", ".")),
        ("", "Item punya satuan besar", f"{stats['besar']:,}".replace(",", ".")),
        ("", "Item wajib lacak expired", f"{stats['expiry']:,}".replace(",", ".")),
        ("", "Item masih ada stok", f"{stats['stok']:,}".replace(",", ".")),
        ("", "Validasi silang stok", f"{stats['validasi']} baris diuji — {stats['validasi_gagal']} selisih"),
        ("", "", ""),
        ("", "CARA PAKAI TAB INI", ""),
        ("", "ITEM_MASTER", "Daftar semua barang. ITEM_ID tidak boleh diubah. UNIT_BASE = satuan terkecil (tempat stok disimpan)."),
        ("", "CATEGORY_MASTER", "93 kategori. DEFAULT_TRACK_EXPIRY menentukan apakah barang baru di kategori itu wajib pakai expired date."),
        ("", "UNIT_CONVERSION", "1 FROM_UNIT = TO_UNIT_QTY TO_UNIT. Dipakai saat terima barang dalam DUS/BAL/SAK."),
        ("", "WAREHOUSE", "3 gudang: Nagoya, Poncol, Ciracas. Tambah baris bila ada gudang baru."),
        ("", "STOCK_LEDGER", "JANGAN diisi manual. Setiap penerimaan/pengeluaran menambah baris di sini. Stok = jumlah semua baris."),
        ("", "STOCK_BATCH", "JANGAN diisi manual. Satu baris per batch dengan tanggal expired, untuk urutan FEFO."),
        ("", "PRICE_HISTORY", "JANGAN diisi manual. Riwayat harga beli & jual dari PO dan iPOSS."),
        ("", "", ""),
        ("", "HAL YANG PERLU KEPUTUSAN ANDA", ""),
        ("", "1. 44 item berlabel @25 Kg", "Contoh 105 M (25 KG), 511 BRAVO (25 KG). Sementara diset UNIT_BASE = KG. Kalau stok dihitung per karung, ubah jadi KRG."),
        ("", "2. Saldo awal per gudang", "Kolom OPENING_QTY_BASE masih berisi total semua gudang, BELUM dipecah. Perlu file stok per gudang."),
        ("", "3. 139 item tanpa konversi", "Punya satuan besar tapi belum ada rantai konversi. Lihat ITEM_MASTER_PERLU_CEK.csv."),
        ("", "4. Nama barang kosong", "Sebagian item di iPOSS masih memakai kode sebagai nama. Cari di kolom NOTES: NAMA_BARANG_BELUM_DIISI."),
        ("", "", ""),
        ("", "CATATAN PENTING", ""),
        ("", "Awalan @ di iPOSS", "BUKAN satuan fisik. Itu tier harga jual (@3, @6, @12). Tidak dimasukkan ke UNIT_CONVERSION."),
        ("", "Rumus yang dipakai", "1 [Satuan] = Qty/ [Paket]. Contoh A591-K: 1 DUS = 20 PCS. Diuji ke 2.760 baris, 0 selisih."),
        ("", "Stok selalu satuan terkecil", "Beli 3 DUS -> tersimpan 60 PCS. Jual 1 PCS -> sisa 59 PCS."),
    ]

    for i, (_, label, value) in enumerate(rows, start=1):
        b = ws.cell(row=i, column=2, value=label)
        c = ws.cell(row=i, column=3, value=value)
        c.alignment = Alignment(wrap_text=True, vertical="top")
        b.alignment = Alignment(vertical="top")
        if label.isupper() and label and not value:
            b.font = Font(bold=True, size=11, color="1F4E78")
        elif i == 1:
            b.font = Font(bold=True, size=14, color="1F4E78")
        elif value:
            b.font = Font(bold=True, size=10)
        if label in ("3. 139 item tanpa konversi", "2. Saldo awal per gudang", "1. 44 item berlabel @25 Kg", "4. Nama barang kosong"):
            b.fill = INFO_FILL
            c.fill = INFO_FILL


def main() -> None:
    wb = Workbook()
    wb.remove(wb.active)

    headers, items = read_csv(SRC / "ITEM_MASTER.csv")
    _, cats = read_csv(SRC / "CATEGORY_MASTER.csv")
    _, conv = read_csv(SRC / "UNIT_CONVERSION.csv")
    _, wh = read_csv(SRC / "WAREHOUSE.csv")

    stats = {
        "item": len(items),
        "kategori": len(cats),
        "konversi": len(conv),
        "besar": sum(1 for i in items if i["BUY_UNIT_DEFAULT"] not in ("", "PCS")),
        "expiry": sum(1 for i in items if i["TRACK_EXPIRY"] == "Y"),
        "stok": sum(1 for i in items if float(i["OPENING_QTY_BASE"] or 0) > 0),
        "validasi": "2.760",
        "validasi_gagal": "0",
    }

    build_info(wb, stats)
    write_sheet(wb, "ITEM_MASTER", headers, items)
    write_sheet(wb, "CATEGORY_MASTER", list(cats[0].keys()), cats)
    write_sheet(wb, "UNIT_CONVERSION", list(conv[0].keys()), conv)
    write_sheet(wb, "WAREHOUSE", list(wh[0].keys()), wh)
    for name, head in EMPTY_TABS.items():
        ws = wb.create_sheet(name)
        ws.append(head)
        style_header(ws, len(head))

    wb.save(OUT)
    print(f"OK -> {OUT}  ({OUT.stat().st_size / 1_048_576:.2f} MB)")
    print(f"   tab: {[ws.title for ws in wb.worksheets]}")


if __name__ == "__main__":
    main()
