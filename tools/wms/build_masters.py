#!/usr/bin/env python3
"""
Migrasi data WMS — Fase 1 langkah 1.

Membaca ekspor iPOSS:
  - google_drive/Master Data Stock.xlsx     -> "MS Details"  (daftar item)
  - google_drive/Master Data Konversi.xlsx  -> "Sheet"       (faktor konversi)

Menghasilkan tab WMS siap tempel:
  - ITEM_MASTER.csv
  - CATEGORY_MASTER.csv
  - UNIT_CONVERSION.csv
  - WAREHOUSE.csv
  - ITEM_MASTER_PERLU_CEK.csv   (item yang butuh keputusan manual)

Aturan penting:
  * Stok selalu satuan terkecil (UNIT_BASE). Semua konversi dihitung ke UNIT_BASE.
  * ID barang TIDAK dibuat ulang. `ITEM_ID` = `SPS000001` milik iPOSS.
  * Konversi yang tidak konsisten TIDAK ditebak — masuk laporan perbaikan.

Jalankan:  python3 tools/wms/build_masters.py
"""
from __future__ import annotations

import csv
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

import openpyxl

SRC_DIR = Path("google_drive")
OUT_DIR = Path("templates/google-sheets/wms")
NOW = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

# Satuan besar yang dipakai iPOSS. Selain ini dianggap satuan kecil.
BIG_UNITS = {
    "DUS", "SAK", "BAL", "PAK", "KARTON", "KODI", "LUSIN", "GROSS",
    "RENC", "KRG", "TOPLES", "TRAY", "BOX", "CTN", "IKAT", "PAPAN",
}
UNIT_CANON = {
    "PCS": "PCS", "SAK": "SAK", "BAL": "BAL", "PAK": "PAK", "SET": "SET",
    "DUS": "DUS", "KARTON": "KARTON", "KODI": "KODI", "LUSIN": "LUSIN",
    "GROSS": "GROSS", "RENC": "RENC", "RENCENG": "RENC", "KRG": "KRG",
    "KARUNG": "KRG", "ROLL": "ROLL", "TOPLES": "TOPLES", "MTR": "MTR",
    "KG": "KG", "TBLT": "TBLT", "EKOR": "EKOR", "BTL": "BTL", "PACK": "PAK",
    "BOX": "BOX", "CTN": "KARTON", "TRAY": "TRAY", "IKAT": "IKAT",
    "PAPAN": "PAPAN", "GALON": "GALON", "SACHET": "SCT", "SCT": "SCT",
}

# Kategori yang barangnya WAJIB ada tanggal expired.
EXPIRY_CATEGORIES = {
    "PAKAN AYAM REPACK", "PAKAN AYAM BROILER", "PAKAN AYAM HOBI",
    "PAKAN AYAM LAYER", "PAKAN AYAM PETELUR", "PAKAN AYAM AYAM",
    "PAKAN BURUNG", "PAKAN IKAN", "PAKAN KUCING", "PAKAN ANJING",
    "PAKAN TERNAK", "PAKAN KELINCI", "PAKAN HAMSTER",
    "CAT FOOD DRY SAK", "CAT FOOD DRY BAG", "CAT FOOD REPACK",
    "CAT FOOD WET KALENG", "CAT FOOD WET POUCH", "CAT FOOD MILK DAN SNACK",
    "DOG FOOD DRY SAK", "DOG FOOD DRY BAG", "DOG FOOD REPACK",
    "DOG FOOD WET KALENG", "DOG FOOD WET POUCH", "DOG FOOD SNACK",
    "OBAT-OBATAN", "OBAT", "OBAT HEWAN", "VAKSIN", "VITAMIN", "JAMU",
    "PROBIOTIK", "SUSU HEWAN", "DOC", "HASIL BUMI", "SAYUR",
    "SHAMPOO", "DESINFEKTAN DAN PESTISIDA", "SIPUT", "BIBIT TANAMAN",
    "MAKANAN IKAN", "MAKANAN BURUNG",
}
EXPIRY_KEYWORDS = (
    "OBAT", "VAKSIN", "VITAMIN", "JAMU", "SUSU", "PAKAN", "FOOD",
    "DESINFEK", "SHAMPOO", "BIBIT", "TANAM", "SIPUT", "PROBIOTIK",
)

# Perkiraan umur simpan (hari) per kelompok kategori. Dipakai sebagai default,
# owner bisa menimpa per item / per kategori.
SHELF_LIFE_DEFAULT = {
    "DOC": 3,
    "HASIL BUMI": 14,
    "SAYUR": 14,
    "BIBIT TANAMAN": 30,
    "SIPUT": 30,
    "CAT FOOD WET POUCH": 540,
    "CAT FOOD WET KALENG": 720,
    "DOG FOOD WET POUCH": 540,
    "DOG FOOD WET KALENG": 720,
    "CAT FOOD MILK DAN SNACK": 365,
    "DOG FOOD SNACK": 365,
    "OBAT-OBATAN": 730,
    "OBAT": 730,
    "VAKSIN": 365,
    "VITAMIN": 730,
    "JAMU": 730,
    "PROBIOTIK": 365,
    "DESINFEKTAN DAN PESTISIDA": 730,
    "SHAMPOO": 1095,
}
SHELF_LIFE_FALLBACK = {
    "SAK": 365, "BAL": 180, "DUS": 365, "PAK": 365, "KARTON": 365,
    "REPACK": 180, "KALENG": 720,
}


def norm_name(value: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", str(value).upper())


def canon_unit(value) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    key = raw.upper()
    if key in UNIT_CANON:
        return UNIT_CANON[key]
    if raw.startswith("@"):
        return ""  # "@25 Kg" = unit beli sementara, bukan satuan dasar
    return key


def num(value) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def read_items(path: Path) -> list[dict]:
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb["MS Details"]
    items = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        if not row or not row[0]:
            continue
        items.append(
            {
                "code": str(row[0]).strip(),
                "name": str(row[1]).strip(),
                "supplier": str(row[2] or "").strip(),
                "category": str(row[3] or "").strip().upper(),
                "unit": str(row[4] or "").strip(),
                "stock": num(row[5]),
                "cost": num(row[6]),
                "price": num(row[7]),
                "status": str(row[8] or "").strip(),
            }
        )
    return items


def read_conversions(path: Path) -> dict[str, list[dict]]:
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb["Sheet"]
    by_item: dict[str, list[dict]] = defaultdict(list)
    for row in ws.iter_rows(min_row=2, values_only=True):
        if not row or not row[0]:
            continue
        qty = num(row[4])
        if qty <= 0:
            continue
        by_item[norm_name(row[0])].append(
            {
                "raw_name": str(row[0]).strip(),
                "category": str(row[1] or "").strip().upper(),
                "satuan": str(row[3] or "").strip(),
                "qty": qty,
                "paket": str(row[5] or "").strip(),
                "stock": num(row[2]),
            }
        )
    return by_item


def guess_track_expiry(category: str, name: str) -> str:
    cat = category.upper()
    if cat in EXPIRY_CATEGORIES:
        return "Y"
    upper = name.upper()
    if any(k in upper for k in EXPIRY_KEYWORDS):
        return "Y"
    return "N"


def guess_shelf_life(category: str, unit: str, name: str) -> str:
    cat = category.upper()
    if cat in SHELF_LIFE_DEFAULT:
        return str(SHELF_LIFE_DEFAULT[cat])
    upper = f"{cat} {name.upper()}"
    for key, days in SHELF_LIFE_DEFAULT.items():
        if key in upper:
            return str(days)
    for key, days in SHELF_LIFE_FALLBACK.items():
        if key in upper or canon_unit(unit) == key:
            return str(days)
    return ""


stats_skip: Counter = Counter()

MULTIPACK_RE = re.compile(r"^@\s*(\d+(?:[.,]\d+)?)\s*([A-Z]*)$")


def parse_multipack(label) -> tuple[float, str, bool]:
    """
    Baca sel satuan/paket iPOSS.

    "5"       -> (1, "5", False)
    "@5 SAK"  -> (5, "SAK", True)
    "@3"      -> (3, "", True)
    "@25 Kg"  -> (25, "KG", True)
    """
    raw = str(label or "").strip().upper()
    if not raw:
        return 1.0, "", False
    m = MULTIPACK_RE.match(raw)
    if not m:
        return 1.0, canon_unit(raw), False
    size = float(m.group(1).replace(",", "."))
    return size, canon_unit(m.group(2)), True


def build_conversion_chain(rows: list[dict]) -> tuple[dict, str, str]:
    """
    Susun faktor setiap satuan ke SATUAN DASAR dari Master Data Konversi.

    ATURAN TUNGGAL:  1 [Satuan] = [Qty/] [Paket]

    Kolom Qty/ SUDAH berisi jumlah satuan tujuan per satu satuan transaksi,
    jadi JANGAN dikalikan lagi dengan angka pada label '@N'. Bug lama
    (Qty/ x N) membuat '@5 PAK' dihitung 25 dan seluruh konversi item hilang.

    Contoh nyata:
        Satuan    Qty/  Paket   Arti
        PCS       1     PCS     1 transaksi = 1 PCS      -> faktor 1
        @6        6     PCS     1 transaksi = 6 PCS      -> faktor 6
        DUS       48    PCS     1 transaksi = 48 PCS     -> faktor 48
        @5       1      @25 Kg  Paket 25 Kg              -> 25 x 5 = 125
        @25 Kg    1     @25 Kg  Paket 25 Kg              -> 25

    Label '@N X' TETAP disimpan sebagai satuan tersendiri ('@5 SAK', '@6',
    '@25 Kg'), karena itu satuan transaksi nyata di iPOSS. Meleburnya menjadi
    'X' membuat '@5 SAK' bertabrakan dengan 'SAK' dan barisnya terbuang.

    Kembalikan (factors, unit_base, catatan).
    """
    norm = []
    for row in rows:
        qty = num(row.get("qty"))
        raw = str(row.get("satuan") or "").strip()
        if not raw or qty <= 0:
            continue
        label_qty, from_unit, from_is_label = parse_multipack(raw)
        to_label_qty, to_unit, to_is_label = parse_multipack(row.get("paket"))
        norm.append(
            {
                "raw": raw,
                "qty": qty,
                "from_unit": from_unit,
                "from_is_label": from_is_label,
                "to_unit": to_unit,
                "to_label_qty": to_label_qty,
                "to_is_label": to_is_label,
            }
        )

    if not norm:
        return {}, "", "tanpa baris qty>0"

    # 1) Satuan dasar = satuan Paket berupa satuan NYATA pada baris Qty/ = 1.
    base_unit = ""
    for row in norm:
        if row["qty"] == 1 and row["to_unit"] and not row["to_is_label"]:
            base_unit = row["to_unit"]
            break
    if not base_unit:
        for row in norm:
            if row["to_unit"] and not row["to_is_label"]:
                base_unit = row["to_unit"]
                break
    # 2) Paket berlabel '@25 Kg' masih menyebut satuan (KG). Dipakai item yang
    #    satu-satunya barisnya '@25 Kg | 1 | @25 Kg' (201M (25 KG), BURAS BMS).
    if not base_unit:
        for row in norm:
            if row["to_is_label"] and row["to_unit"]:
                base_unit = row["to_unit"]
                break
    if not base_unit:
        return {}, "", "tidak ada satuan dasar yang bisa ditentukan"

    # 3) Graf satuan biasa (tanpa '@') memberi faktor tiap satuan fisik.
    edges: dict[str, list[tuple[str, float]]] = defaultdict(list)
    for row in norm:
        if row["from_is_label"]:
            continue
        frm = row["from_unit"]
        to = row["to_unit"]
        if not frm or not to:
            continue
        value = row["qty"] * row["to_label_qty"]
        if value <= 0:
            continue
        if frm == to and abs(value - 1) < 1e-9:
            continue
        edges[frm].append((to, value))

    factors: dict[str, float] = {base_unit: 1.0}

    def resolve(unit: str, seen: frozenset) -> float:
        if unit == base_unit:
            return 1.0
        if unit in factors:
            return factors[unit]
        if unit in seen:
            return 0.0
        for to, value in edges.get(unit, []):
            if value <= 0:
                continue
            sub = resolve(to, seen | {unit})
            if sub > 0:
                factors[unit] = value * sub
                return factors[unit]
        return 0.0

    for unit in list(edges):
        resolve(unit, frozenset())

    # 4) Faktor sel Paket: satuan nyata -> faktornya x, '@M' -> M, kosong -> 1.
    def paket_factor(row) -> float:
        if row["to_unit"]:
            unit_factor = factors.get(row["to_unit"], 0.0)
            if unit_factor <= 0:
                return 0.0
            return row["to_label_qty"] * unit_factor
        if row["to_is_label"]:
            return row["to_label_qty"]
        return 1.0

    out: dict[str, float] = {}
    for row in norm:
        pf = paket_factor(row)
        if pf <= 0:
            continue
        factor = round(row["qty"] * pf, 6)
        if factor <= 0:
            continue
        if not row["from_is_label"]:
            key = row["from_unit"]
            if not key:
                continue
            if key == base_unit and abs(factor - 1) < 1e-9:
                continue
            if key == row["to_unit"] and abs(factor - 1) < 1e-9:
                continue
        else:
            key = row["raw"]
            if key == base_unit:
                continue
        out[key] = max(out.get(key, 0.0), factor)

    if not out:
        return {}, base_unit, ""

    out.pop(base_unit, None)
    return out, base_unit, ""


def _stock_of(row: dict) -> float:
    return num(row.get("stock"))


def _kg_chain(kg: float) -> dict:
    return {"KG": 1.0}


def main() -> None:
    items = read_items(SRC_DIR / "Master Data Stock.xlsx")
    conversions = read_conversions(SRC_DIR / "Master Data Konversi.xlsx")
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    stats = Counter()
    item_rows: list[dict] = []
    conv_rows: list[dict] = []
    needs_check: list[dict] = []
    seen_ids: set[str] = set()

    for idx, item in enumerate(items, start=1):
        key = norm_name(item["name"])
        conv = conversions.get(key, [])
        unit_base = canon_unit(item["unit"]) or "PCS"
        track_expiry = guess_track_expiry(item["category"], item["name"])
        shelf = guess_shelf_life(item["category"], item["unit"], item["name"]) if track_expiry == "Y" else ""

        # --- pakai konversi iPOSS bila ada & masuk akal ---
        buy_unit = unit_base
        note_parts: list[str] = []
        if conv:
            factors, conv_base, conv_note = build_conversion_chain(conv)
            if conv_note:
                note_parts.append(conv_note)
                stats["konversi_konflik"] += 1
            if conv_base and conv_base != unit_base:
                note_parts.append(f"UNIT_BASE disesuaikan dari {unit_base} ke {conv_base} (iPOSS)")
                stats["unit_base_dikoreksi"] += 1
                unit_base = conv_base
            for level, (unit, factor) in enumerate(
                sorted(factors.items(), key=lambda kv: kv[1]), start=2
            ):
                conv_rows.append(
                    {
                        "CONV_ID": f"CNV-{len(conv_rows) + 1:06d}",
                        "ITEM_ID": item["code"],
                        "ITEM_NAME": item["name"],
                        "LEVEL": level,
                        "FROM_UNIT": unit,
                        "TO_UNIT": unit_base,
                        "TO_UNIT_QTY": f"{factor:g}",
                        "IS_ACTIVE": "Y",
                        "NOTES": "" if not conv_note else conv_note,
                    }
                )
                stats["baris_konversi"] += 1
                if unit in BIG_UNITS:
                    stats["item_punya_satuan_besar"] += 1
            big = [u for u in factors if u in BIG_UNITS]
            if big:
                buy_unit = sorted(big)[0]
        else:
            note_parts.append("tidak ada data konversi di iPOSS")
            stats["tanpa_konversi"] += 1

        code_tag = ""
        if not re.match(r"^SPS\d+$", item["code"]):
            code_tag = f"kode iPOSS: {item['code']}"

        if item["code"] in seen_ids:
            note_parts.append("ITEM_ID duplikat di sumber")
            stats["id_duplikat"] += 1
        seen_ids.add(item["code"])

        item_id = f"ITM-{idx:06d}"
        ipos_code = "" if re.match(r"^SPS\d+$", item["code"]) else item["code"]
        if item["status"] != "Sale":
            note_parts.append(f"status iPOSS: {item['status']}")
        if code_tag:
            note_parts.append(code_tag)
        if re.match(r"^SPS\d+$", item["name"]):
            note_parts.append("NAMA_BARANG_BELUM_DIISI (masih kode)")

        item_rows.append(
            {
                "ITEM_ID": item_id,
                "ITEM_NAME": item["name"],
                "CATEGORY": item["category"],
                "SUPPLIER": item["supplier"],
                "UNIT_BASE": unit_base,
                "BUY_UNIT_DEFAULT": buy_unit,
                "IPOS_CODE": ipos_code,
                "IPOS_NAME": item["name"],
                "TRACK_EXPIRY": track_expiry,
                "TRACK_BATCH": "Y" if track_expiry == "Y" else "N",
                "SHELF_LIFE_DAYS": shelf,
                "MIN_STOCK": "",
                "MAX_STOCK": "",
                "REORDER_POINT": "",
                "IS_ACTIVE": "Y" if item["status"] == "Sale" else "N",
                "NOTES": " | ".join(note_parts),
                "OPENING_QTY_BASE": f"{item['stock']:g}",
                "BUY_PRICE_LAST": f"{item['cost']:g}",
                "SELL_PRICE_REF": f"{item['price']:g}",
                "STATUS_IPOS": item["status"],
                "CREATED_AT": NOW,
                "UPDATED_AT": NOW,
                # kolom bantu (tidak masuk tab, hanya untuk laporan)
                "_stock": item["stock"],
                "_cost": item["cost"],
                "_price": item["price"],
                "_status": item["status"],
                "_conv_rows": len(conv),
            }
        )
        stats["item"] += 1
        if track_expiry == "Y":
            stats["track_expiry_Y"] += 1
        if item["stock"] > 0:
            stats["item_ada_stok"] += 1

        if not conv or note_parts:
            needs_check.append(
                {
                    "ITEM_ID": item_id,
                    "ITEM_NAME": item["name"],
                    "CATEGORY": item["category"],
                    "UNIT": item["unit"],
                    "UNIT_BASE_HASIL": unit_base,
                    "STOK": f"{item['stock']:g}",
                    "STATUS_IPOS": item["status"],
                    "JUMLAH_BARIS_KONVERSI": len(conv),
                    "MASALAH": " | ".join(note_parts) or "ok",
                }
            )

    # ---------- tulis ITEM_MASTER ----------
    item_cols = [
        "ITEM_ID", "ITEM_NAME", "CATEGORY", "SUPPLIER", "UNIT_BASE",
        "BUY_UNIT_DEFAULT", "IPOS_CODE", "IPOS_NAME", "TRACK_EXPIRY",
        "TRACK_BATCH", "SHELF_LIFE_DAYS", "MIN_STOCK", "MAX_STOCK",
        "REORDER_POINT", "IS_ACTIVE", "NOTES",
        "OPENING_QTY_BASE", "BUY_PRICE_LAST", "SELL_PRICE_REF", "STATUS_IPOS",
        "CREATED_AT", "UPDATED_AT",
    ]
    with (OUT_DIR / "ITEM_MASTER.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=item_cols, extrasaction="ignore")
        w.writeheader()
        w.writerows(item_rows)

    # ---------- CATEGORY_MASTER ----------
    cats = Counter(it["CATEGORY"] for it in item_rows)
    expiry_by_cat = defaultdict(Counter)
    for it in item_rows:
        expiry_by_cat[it["CATEGORY"]][it["TRACK_EXPIRY"]] += 1
    with (OUT_DIR / "CATEGORY_MASTER.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["CATEGORY_ID", "CATEGORY_NAME", "DEFAULT_TRACK_EXPIRY",
                    "SHELF_LIFE_DAYS", "IS_ACTIVE", "NOTES"])
        for i, (cat, _count) in enumerate(sorted(cats.items()), start=1):
            votes = expiry_by_cat[cat]
            default_exp = "Y" if votes["Y"] >= votes["N"] else "N"
            shelf = guess_shelf_life(cat, "", "") if default_exp == "Y" else ""
            w.writerow([f"CAT-{i:03d}", cat, default_exp, shelf, "Y", ""])

    # ---------- UNIT_CONVERSION ----------
    with (OUT_DIR / "UNIT_CONVERSION.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(
            fh,
            fieldnames=["CONV_ID", "ITEM_ID", "ITEM_NAME", "LEVEL", "FROM_UNIT",
                        "TO_UNIT", "TO_UNIT_QTY", "IS_ACTIVE", "NOTES"],
        )
        w.writeheader()
        w.writerows(conv_rows)

    # ---------- WAREHOUSE ----------
    with (OUT_DIR / "WAREHOUSE.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["WAREHOUSE_ID", "WAREHOUSE_NAME", "ADDRESS", "PIC", "IS_ACTIVE", "NOTES"])
        for wid, name in [("WH-NAG", "GUDANG NAGOYA"), ("WH-PON", "GUDANG PONCOL"),
                          ("WH-CIR", "GUDANG CIRACAS")]:
            w.writerow([wid, name, "", "", "Y", ""])

    # ---------- validasi silang: stok iPOSS vs rumus konversi ----------
    conv_by_item = defaultdict(list)
    for c in conv_rows:
        conv_by_item[c["ITEM_ID"]].append(c)
    mismatch = []
    checked = 0
    for key, raw_rows in conversions.items():
        base = next((num(r["qty"] * 0 + _stock_of(r)) for r in raw_rows if r["qty"] == 1), None)
        if base is None:
            continue
        for r in raw_rows:
            if r["qty"] == 1 or str(r["satuan"]).startswith("@"):
                continue
            checked += 1
            expected = base / r["qty"]
            got = _stock_of(r)
            if abs(expected - got) > 0.02:
                mismatch.append(
                    {
                        "NAMA_IPOSS": r["raw_name"],
                        "SATUAN": r["satuan"],
                        "QTY_PER": f"{r['qty']:g}",
                        "STOK_DI_FILE": f"{got:g}",
                        "STOK_SEHARUSNYA": f"{expected:.4g}",
                    }
                )
    with (OUT_DIR / "VALIDASI_STOK_KONVERSI.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=["NAMA_IPOSS", "SATUAN", "QTY_PER",
                                           "STOK_DI_FILE", "STOK_SEHARUSNYA"])
        w.writeheader()
        w.writerows(mismatch)
    stats["validasi_baris"] = checked
    stats["validasi_tidak_cocok"] = len(mismatch)

    # ---------- laporan perlu cek ----------
    with (OUT_DIR / "ITEM_MASTER_PERLU_CEK.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(
            fh,
            fieldnames=["ITEM_ID", "ITEM_NAME", "CATEGORY", "UNIT", "UNIT_BASE_HASIL",
                        "STOK", "STATUS_IPOS", "JUMLAH_BARIS_KONVERSI", "MASALAH"],
        )
        w.writeheader()
        w.writerows(needs_check)

    print("=== RINGKASAN MIGRASI ===")
    stats["baris_tier_harga_diabaikan"] = stats_skip["tier_harga"]
    stats["baris_multipak_dibaca"] = stats_skip["multipack"]
    for k, v in sorted(stats.items()):
        print(f"  {k:22} {v}")
    print(f"\n  kategori             {len(cats)}")
    print(f"  perlu cek manual     {len(needs_check)}")
    print(f"\nOutput: {OUT_DIR}/")


if __name__ == "__main__":
    main()
