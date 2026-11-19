#!/usr/bin/env python3
"""
Tempel src/lib/wms-stock.ts ke dalam api/server.ts.

KENAPA INI PERLU
----------------
Vercel meng-compile api/server.ts sendiri menjadi /var/task/api/server.js dan
HANYA mengunggah berkas itu. Import relatif ("../src/lib/wms-stock") lolos di
build lokal (esbuild --bundle) tetapi meledak di production:

    ERR_MODULE_NOT_FOUND: Cannot find module '/var/task/src/lib/wms-stock'

Karena api/server.ts tidak boleh punya import relatif, modul stok ditempel.

CARA PAKAI
----------
Ubah src/lib/wms-stock.ts (sumber kebenaran), lalu jalankan:

    python3 tools/wms/inline_stock_module.py

Test api/__tests__/inlined-module-sync.test.ts akan gagal bila lupa.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MODULE = ROOT / "src/lib/wms-stock.ts"
SERVER = ROOT / "api/server.ts"

BEGIN = "// Perhitungan stok WMS — SENGAJA DITEMPEL"
END = "// ===================== akhir modul stok WMS"

HEADER = """// ===========================================================================
// Perhitungan stok WMS — SENGAJA DITEMPEL DI SINI, BUKAN DIIMPOR.
//
// Vercel meng-compile api/server.ts sendiri menjadi /var/task/api/server.js
// dan HANYA mengunggah berkas itu. Import relatif ("../src/lib/wms-stock")
// lolos di build lokal (esbuild --bundle) tetapi meledak di production:
//
//   ERR_MODULE_NOT_FOUND: Cannot find module '/var/task/src/lib/wms-stock'
//
// Aturan tetap: api/server.ts tidak boleh punya import relatif sama sekali.
// Penjaga otomatisnya ada di api/__tests__/no-relative-imports.test.ts
// ===========================================================================

"""

FOOTER = f"\n{END} ===============================\n\n"


def to_inlined_form(source: str) -> str:
    """Ubah modul menjadi bentuk tempelan: tanpa export, tanpa nama bentrok."""
    out = re.sub(r"^export (type|function|const) ", r"\1 ", source, flags=re.M)
    # toNumber/toText bisa bentrok dengan helper lokal di server.ts
    out = re.sub(r"\btoNumber\b", "wmsToNumber", out)
    out = re.sub(r"\btoText\b", "wmsToText", out)
    return out


def build_block() -> str:
    return HEADER + to_inlined_form(MODULE.read_text()) + FOOTER


def main() -> int:
    server = SERVER.read_text()
    # buang SEMUA blok lama dulu supaya idempoten
    while True:
        start = server.find(BEGIN)
        if start == -1:
            break
        end = server.find(END, start)
        if end == -1:
            print("GAGAL: penanda awal ada tanpa penanda akhir", file=sys.stderr)
            return 1
        line_end = server.find("\n", end)
        server = server[:start] + (server[line_end + 1:] if line_end != -1 else "")

    # buang import relatif ke modul (kalau masih ada)
    server = re.sub(
        r'import \{\n(?:[^}]*\n)*?\} from "\.\./src/lib/wms-stock";\n',
        "",
        server,
        count=1,
    )
    server = re.sub(r'import[^;\n]*from "\.\./src/lib/wms-stock";\n', "", server)

    start = server.find(BEGIN)
    end = server.find(END)

    if start != -1 and end != -1:
        # potong sampai AKHIR BARIS penanda penutup, bukan sampai karakternya
        line_end = server.find("\n", end)
        rest = server[line_end + 1:] if line_end != -1 else ""
        new_server = server[:start] + build_block() + rest
        action = "diperbarui"
    else:
        marker = "const app = express();"
        if marker not in server:
            print("GAGAL: tidak menemukan 'const app = express();'", file=sys.stderr)
            return 1
        new_server = server.replace(marker, build_block() + marker, 1)
        action = "disisipkan"

    SERVER.write_text(new_server)
    print(f"Modul stok WMS {action} ke api/server.ts")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
