/**
 * Perhitungan saldo stok dari STOCK_LEDGER.
 *
 * File ini sengaja bebas dari Express/Google Sheets supaya bisa diuji cepat
 * dan dipakai ulang. Semua angka stok berasal dari SATU sumber: kolom QTY_BASE
 * pada ledger (append-only). Saldo tidak pernah disimpan, selalu dijumlahkan.
 */

export type LedgerRow = Record<string, string>;

export type ConversionRow = {
  itemId?: string;
  fromUnit: string;
  toUnit: string;
  toUnitQty: number;
  level: number;
  isActive: boolean;
};

export type ItemRow = {
  itemId: string;
  itemName: string;
  category: string;
  unitBase: string;
  buyUnitDefault: string;
  iposCode: string;
  trackExpiry: boolean;
  minStock: number;
  maxStock: number;
  isActive: boolean;
};

export type WarehouseRow = {
  warehouseId: string;
  warehouseName: string;
};

export type UnitBreakdown = {
  unit: string;
  qty: number;
};

export type StockBalance = {
  itemId: string;
  itemName: string;
  category: string;
  iposCode: string;
  unitBase: string;
  trackExpiry: boolean;
  warehouseId: string;
  warehouseName: string;
  qtyBase: number;
  /** Rincian bertingkat dari satuan terbesar ke terkecil, mis. 3 DUS + 0 PCS. */
  breakdown: UnitBreakdown[];
  /** Teks siap tampil, mis. "3 DUS + 0 PCS". Diisi hanya bila breakdown ada. */
  display: string;
  minStock: number;
  maxStock: number;
  status: "EMPTY" | "LOW" | "OK" | "OVER";
  lastTrxDate: string;
};

const toNumber = (value: unknown): number => {
  const n = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const toText = (value: unknown): string => String(value ?? "").trim();

/**
 * Arahkan setiap satuan ke satuan dasar item.
 *
 * UNIT_CONVERSION misalnya: DUS -> PCS x20, dan bisa bertingkat
 * (BAL -> DUS x12, DUS -> PCS x20). Fungsi ini menggabungkan keduanya
 * sehingga BAL -> PCS = 240 tanpa perlu tabel tambahan.
 */
export function buildUnitFactors(
  conversions: ConversionRow[]
): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {};
  const byItem: Record<string, ConversionRow[]> = {};

  for (const row of conversions) {
    const itemId = toText(row.itemId).toUpperCase();
    const from = toText(row.fromUnit).toUpperCase();
    const to = toText(row.toUnit).toUpperCase();
    const factor = toNumber(row.toUnitQty);
    if (!itemId || !from || !to || factor <= 0) continue;
    if (row.isActive === false) continue;
    (byItem[itemId] = byItem[itemId] || []).push({ ...row, fromUnit: from, toUnit: to, toUnitQty: factor });
  }

  for (const [itemId, rows] of Object.entries(byItem)) {
    // Faktor langsung: from -> to. Kebanyakan data hanya satu tingkat
    // (DUS -> PCS), jadi ini menangani sebagian besar kasus tanpa iterasi.
    const direct: Record<string, number> = {};
    for (const row of rows) direct[`${row.fromUnit}|${row.toUnit}`] = row.toUnitQty;

    const units = new Set<string>();
    for (const row of rows) {
      units.add(row.fromUnit);
      units.add(row.toUnit);
    }

    // Satuan dasar = tujuan (toUnit) yang tidak pernah jadi sumber (fromUnit).
    const sources = new Set(rows.map((r) => r.fromUnit));
    const baseCandidates = [...units].filter((u) => !sources.has(u));
    const base = baseCandidates.length === 1 ? baseCandidates[0] : baseCandidates[0] || "";

    const factors: Record<string, number> = {};
    if (base) factors[base] = 1;

    // Telusuri rantai sampai satuan dasar, maksimal 8 tingkat untuk mencegah
    // loop bila data konversi saling menunjuk.
    const resolve = (unit: string, depth: number, seen: Set<string>): number => {
      if (base && unit === base) return 1;
      if (depth > 8 || seen.has(unit)) return 0;
      seen.add(unit);
      let best = 0;
      for (const row of rows) {
        if (row.fromUnit !== unit) continue;
        const sub = resolve(row.toUnit, depth + 1, new Set(seen));
        const total = row.toUnitQty * (sub || 0);
        if (total > best) best = total;
      }
      return best;
    };

    for (const unit of units) {
      const factor = resolve(unit, 0, new Set());
      if (factor > 0) factors[unit] = factor;
    }
    result[itemId] = factors;
  }

  return result;
}

/**
 * Pecah qty satuan dasar menjadi satuan besar + sisa.
 *
 * Contoh (faktor PCS=1, DUS=20, BAL=240) dengan qty 260:
 *   [{ BAL: 1 }, { DUS: 0 }, { PCS: 20 }]  -> "1 BAL + 20 PCS"
 *
 * Satuan yang hasilnya 0 dilewati agar tidak menulis "1 BAL + 0 DUS + 20 PCS".
 * Bila qty 0, kembalikan satu entri satuan dasar dengan qty 0.
 */
export function breakdownBaseQty(
  qtyBase: number,
  factors: Record<string, number> | undefined,
  unitBase: string
): UnitBreakdown[] {
  const qty = toNumber(qtyBase);
  const base = toText(unitBase).toUpperCase() || "PCS";
  const table = { ...(factors || {}) };
  if (!table[base]) table[base] = 1;

  if (qty === 0) return [{ unit: base, qty: 0 }];

  const negative = qty < 0;
  let remaining = Math.round(Math.abs(qty) * 1000) / 1000;

  const ordered = Object.entries(table)
    .filter(([unit, factor]) => unit !== base && factor > 1)
    .sort((a, b) => b[1] - a[1]);

  const parts: UnitBreakdown[] = [];
  for (const [unit, factor] of ordered) {
    const count = Math.floor(remaining / factor + 1e-9);
    if (count > 0) {
      parts.push({ unit, qty: negative ? -count : count });
      remaining = Math.round((remaining - count * factor) * 1000) / 1000;
    }
  }

  if (remaining > 0 || parts.length === 0) {
    parts.push({ unit: base, qty: negative ? -remaining : remaining });
  }

  return parts;
}

/** "3 DUS" atau "1 BAL + 1 DUS" — rincian bertingkat tanpa total. */
export function formatBreakdown(parts: UnitBreakdown[]): string {
  if (!parts.length) return "";
  return parts
    .map((part) => `${formatQty(part.qty)} ${part.unit}`)
    .join(" + ");
}

/**
 * Teks saldo siap tampil: rincian bertingkat + total satuan dasar.
 *
 *   60 PCS  -> "3 DUS / 60 PCS"
 *   260 PCS -> "1 BAL + 1 DUS / 260 PCS"
 *   5 PCS   -> "5 PCS"
 *
 * Total satuan dasar SELALU ditampilkan karena itulah angka yang tersimpan di
 * ledger. Tanpa itu, "1 BAL + 1 DUS" tidak bisa dicocokkan dengan spreadsheet.
 */
export function formatStockDisplay(
  parts: UnitBreakdown[],
  qtyBase: number,
  unitBase: string
): string {
  const base = toText(unitBase).toUpperCase() || "PCS";
  const breakdown = formatBreakdown(parts);
  const total = `${formatQty(qtyBase)} ${base}`;

  // Rincian hanya berisi satuan dasar -> cukup tulis totalnya sekali.
  const onlyBase = parts.length <= 1 && parts.every((part) => part.unit === base);
  if (onlyBase || !breakdown) return total;
  return `${breakdown} / ${total}`;
}

/** Angka tanpa desimal panjang: 60 -> "60", 1.5 -> "1,5". */
export function formatQty(value: number): string {
  const n = toNumber(value);
  const rounded = Math.round(n * 1000) / 1000;
  return String(rounded).replace(".", ",");
}

/**
 * Jumlahkan ledger menjadi saldo per item × gudang.
 *
 * Aturan:
 * - QTY_BASE positif menambah, negatif mengurangi (sudah termasuk tanda).
 *   Bila kolom QTY_BASE kosong, pakai QTY_IN - QTY_OUT dikali TO_UNIT_QTY.
 * - Baris tanpa ITEM_ID dilewati (baris kosong / catatan).
 * - Item yang tidak ada di ITEM_MASTER tetap dihasilkan, dengan nama dari
 *   ledger, agar stok tidak "hilang" hanya karena master data belum lengkap.
 */
export function aggregateLedger(
  ledger: LedgerRow[],
  items: ItemRow[],
  warehouses: WarehouseRow[],
  factorsByItem: Record<string, Record<string, number>>
): StockBalance[] {
  const itemById = new Map<string, ItemRow>();
  for (const item of items) itemById.set(toText(item.itemId).toUpperCase(), item);

  const warehouseById = new Map<string, string>();
  for (const wh of warehouses) {
    warehouseById.set(toText(wh.warehouseId).toUpperCase(), toText(wh.warehouseName));
  }

  type Acc = { qtyBase: number; lastTrxDate: string; itemName: string };
  const acc = new Map<string, Acc>();

  for (const row of ledger) {
    const itemId = toText(row.ITEM_ID).toUpperCase();
    if (!itemId) continue;

    const qtyRaw = row.QTY_BASE;
    let qtyBase: number;
    if (toText(qtyRaw) === "") {
      const qtyIn = toNumber(row.QTY_IN);
      const qtyOut = toNumber(row.QTY_OUT);
      const factor = toNumber(row.TO_UNIT_QTY) || 1;
      qtyBase = (qtyIn - qtyOut) * factor;
    } else {
      qtyBase = toNumber(qtyRaw);
    }

    const warehouseId = toText(row.WAREHOUSE_ID).toUpperCase() || "TANPA-GUDANG";
    const key = `${itemId}|${warehouseId}`;
    const entry = acc.get(key) || { qtyBase: 0, lastTrxDate: "", itemName: "" };
    entry.qtyBase += qtyBase;
    const trxDate = toText(row.TRX_DATE);
    if (trxDate > entry.lastTrxDate) entry.lastTrxDate = trxDate;
    if (!entry.itemName) entry.itemName = toText(row.ITEM_NAME);
    acc.set(key, entry);
  }

  const result: StockBalance[] = [];
  for (const [key, entry] of acc.entries()) {
    const [itemId, warehouseId] = key.split("|");
    const master = itemById.get(itemId);
    const unitBase = master?.unitBase || "PCS";
    const factors = factorsByItem[itemId];
    const parts = breakdownBaseQty(entry.qtyBase, factors, unitBase);

    const minStock = master?.minStock || 0;
    const maxStock = master?.maxStock || 0;
    let status: StockBalance["status"] = "OK";
    if (entry.qtyBase <= 0) status = "EMPTY";
    else if (minStock > 0 && entry.qtyBase < minStock) status = "LOW";
    else if (maxStock > 0 && entry.qtyBase > maxStock) status = "OVER";

    result.push({
      itemId,
      itemName: master?.itemName || entry.itemName || itemId,
      category: master?.category || "",
      iposCode: master?.iposCode || "",
      unitBase,
      trackExpiry: Boolean(master?.trackExpiry),
      warehouseId,
      warehouseName: warehouseById.get(warehouseId) || warehouseId,
      qtyBase: Math.round(entry.qtyBase * 1000) / 1000,
      breakdown: parts,
      display: formatStockDisplay(parts, Math.round(entry.qtyBase * 1000) / 1000, unitBase),
      minStock,
      maxStock,
      status,
      lastTrxDate: entry.lastTrxDate,
    });
  }

  result.sort((a, b) => {
    if (a.itemName !== b.itemName) return a.itemName.localeCompare(b.itemName);
    return a.warehouseName.localeCompare(b.warehouseName);
  });
  return result;
}

/**
 * Saring saldo untuk tampilan. Semua filter opsional dan tidak peka huruf.
 * `belowMin` hanya menyisakan item yang punya MIN_STOCK dan saldonya di bawahnya.
 */
export function filterBalances(
  balances: StockBalance[],
  opts: { q?: string; warehouseId?: string; category?: string; belowMin?: boolean; onlyPositive?: boolean }
): StockBalance[] {
  const q = toText(opts.q).toUpperCase();
  const warehouseId = toText(opts.warehouseId).toUpperCase();
  const category = toText(opts.category).toUpperCase();

  return balances.filter((row) => {
    if (warehouseId && row.warehouseId.toUpperCase() !== warehouseId) return false;
    if (category && row.category.toUpperCase() !== category) return false;
    if (opts.belowMin && !(row.minStock > 0 && row.qtyBase < row.minStock)) return false;
    if (opts.onlyPositive && row.qtyBase <= 0) return false;
    if (q) {
      const haystack = `${row.itemName} ${row.iposCode} ${row.itemId} ${row.category}`.toUpperCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

/** Riwayat mutasi satu item (untuk kartu stok), dengan saldo berjalan. */
export type StockMovement = {
  trxId: string;
  trxDate: string;
  trxType: string;
  refNo: string;
  warehouseId: string;
  warehouseName: string;
  qtyIn: number;
  qtyOut: number;
  unit: string;
  toUnitQty: number;
  qtyBase: number;
  runningBase: number;
  unitCost: number;
  pic: string;
  notes: string;
  createdAt: string;
};

export function buildMovements(
  ledger: LedgerRow[],
  itemId: string,
  warehouses: WarehouseRow[],
  opts: { warehouseId?: string } = {}
): StockMovement[] {
  const target = toText(itemId).toUpperCase();
  const warehouseId = toText(opts.warehouseId).toUpperCase();

  const warehouseById = new Map<string, string>();
  for (const wh of warehouses) {
    warehouseById.set(toText(wh.warehouseId).toUpperCase(), toText(wh.warehouseName));
  }

  const rows = ledger
    .filter((row) => toText(row.ITEM_ID).toUpperCase() === target)
    .filter((row) => {
      if (!warehouseId) return true;
      return (toText(row.WAREHOUSE_ID).toUpperCase() || "TANPA-GUDANG") === warehouseId;
    })
    .map((row) => {
      const qtyIn = toNumber(row.QTY_IN);
      const qtyOut = toNumber(row.QTY_OUT);
      const factor = toNumber(row.TO_UNIT_QTY) || 1;
      const raw = row.QTY_BASE;
      const qtyBase = toText(raw) === "" ? (qtyIn - qtyOut) * factor : toNumber(raw);
      const wh = toText(row.WAREHOUSE_ID).toUpperCase() || "TANPA-GUDANG";
      return {
        trxId: toText(row.TRX_ID),
        trxDate: toText(row.TRX_DATE),
        trxType: toText(row.TRX_TYPE),
        refNo: toText(row.REF_NO),
        warehouseId: wh,
        warehouseName: warehouseById.get(wh) || wh,
        qtyIn,
        qtyOut,
        unit: toText(row.UNIT),
        toUnitQty: factor,
        qtyBase,
        runningBase: 0,
        unitCost: toNumber(row.UNIT_COST),
        pic: toText(row.PIC),
        notes: toText(row.NOTES),
        createdAt: toText(row.CREATED_AT),
      };
    });

  // Urutkan kronologis (tanggal lalu jam input) sebelum menghitung saldo
  // berjalan. Ledger append-only, tapi urutan baris di sheet tidak dijamin.
  rows.sort((a, b) => {
    if (a.trxDate !== b.trxDate) return a.trxDate < b.trxDate ? -1 : 1;
    return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
  });

  let running = 0;
  for (const row of rows) {
    running += row.qtyBase;
    row.runningBase = Math.round(running * 1000) / 1000;
  }

  return rows;
}

/** Ringkasan angka untuk kartu di atas tabel. */
export function summarize(balances: StockBalance[]) {
  const totalQtyBase = balances.reduce((sum, row) => sum + row.qtyBase, 0);
  return {
    rows: balances.length,
    items: new Set(balances.map((row) => row.itemId)).size,
    warehouses: new Set(balances.map((row) => row.warehouseId)).size,
    totalQtyBase: Math.round(totalQtyBase * 1000) / 1000,
    lowCount: balances.filter((row) => row.status === "LOW").length,
    emptyCount: balances.filter((row) => row.status === "EMPTY").length,
  };
}
