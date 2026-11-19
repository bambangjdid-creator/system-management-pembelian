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
    (byItem[itemId] = byItem[itemId] || []).push({
      ...row,
      fromUnit: from,
      toUnit: to,
      toUnitQty: factor,
    });
  }

  for (const [itemId, rows] of Object.entries(byItem)) {
    result[itemId] = resolveFactors(rows);
  }

  return result;
}

/**
 * Hitung faktor setiap satuan ke SATUAN DASAR dari relasi master data.
 *
 * Aturan master data (iPOSS -> UNIT_CONVERSION):
 *   1 [FROM_UNIT] = TO_UNIT_QTY [TO_UNIT]
 *
 * Perhatikan kolom-kolom iPOSS aslinya:
 *   Satuan | Qty/ | Paket
 *   BAL    | 1    | BAL      -> BAL adalah satuan terkecil sekaligus satuan transaksi
 *   SAK    | 3    | SAK      -> 1 transaksi SAK = 3 paket SAK
 *   Kg     | 25   | BAL      -> 1 BAL = 25 Kg, jadi Kg LEBIH KECIL dari BAL
 *
 * Jadi satuan dasar tidak boleh ditebak dari nama, dan BAL/SAK tidak otomatis
 * dianggap satuan besar. Yang menentukan adalah arah relasi: satuan yang selalu
 * muncul sebagai To (tidak pernah sebagai From) adalah satuan terkecil.
 */
export function resolveFactors(rows: ConversionRow[]): Record<string, number> {
  const table = rows.filter(
    (row) => row.fromUnit !== row.toUnit && row.toUnitQty > 0 && row.isActive !== false
  );
  if (table.length === 0) return {};

  const units = new Set<string>();
  for (const row of table) {
    units.add(row.fromUnit);
    units.add(row.toUnit);
  }

  const sources = new Set(table.map((row) => row.fromUnit));
  const targets = new Set(table.map((row) => row.toUnit));

  // Satuan terkecil = tujuan yang tidak pernah menjadi sumber.
  const leaves = [...units].filter((unit) => targets.has(unit) && !sources.has(unit));
  const base = leaves[0] || [...units].find((unit) => !sources.has(unit)) || "";
  if (!base) return {};

  // Faktor langsung untuk mempercepat; graf tetap dipakai sebagai cadangan
  // agar rantai bertingkat (BAL -> DUS -> PCS) tetap terpecahkan.
  const factors: Record<string, number> = { [base]: 1 };

  const resolve = (unit: string, depth: number, seen: Set<string>): number => {
    if (unit === base) return 1;
    if (depth > 8 || seen.has(unit)) return 0;
    seen.add(unit);
    let best = 0;
    for (const row of table) {
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

  return factors;
}

/**
 * Satuan yang boleh dipakai saat menerima barang.
 *
 * Aturan:
 * - Satuan dasar (faktor 1) selalu ada.
 * - Hanya satuan yang punya faktor > 1 yang ditawarkan.
 * - Satuan transaksi yang kebetulan SAMA dengan satuan dasar tetap satu pilihan.
 *
 * Contoh: BR11 CP (50 KG) -> satuan dasar BAL, tanpa konversi lain -> pilihan
 * hanya "BAL". Ini benar: 1 BAL memang satuannya, bukan 50 PCS.
 */
export function buildUnitOptions(
  unitBase: string,
  factors: Record<string, number> | undefined,
  preferredUnit?: string
): { unit: string; toUnitQty: number; isBase: boolean }[] {
  const base = toText(unitBase).toUpperCase() || "PCS";
  const table = { ...(factors || {}) };
  if (!table[base]) table[base] = 1;

  const options = Object.entries(table)
    .map(([unit, factor]) => ({
      unit,
      toUnitQty: Math.round(toNumber(factor) * 1000) / 1000,
      isBase: unit === base,
    }))
    .filter((option) => option.toUnitQty >= 1)
    .sort((a, b) => a.toUnitQty - b.toUnitQty);

  // Pastikan satuan dasar ada walau tabel konversi tidak menyebutnya.
  if (!options.some((option) => option.unit === base)) {
    options.unshift({ unit: base, toUnitQty: 1, isBase: true });
  }

  // Satuan dari PO naik ke urutan pertama supaya checker tidak perlu klik.
  const wanted = toText(preferredUnit).toUpperCase();
  if (wanted) {
    const index = options.findIndex((option) => option.unit === wanted);
    if (index > 0) options.unshift(...options.splice(index, 1));
  }

  return options;
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

/**
 * Jembatani tab UNIT_CONVERSION ke ITEM_MASTER.
 *
 * Kenyataan data:
 *   UNIT_CONVERSION.ITEM_ID  = kode iPOSS  (SPS000023)
 *   ITEM_MASTER.ITEM_ID      = kode internal (ITM-000001)
 *   ITEM_MASTER.IPOS_CODE    = KOSONG di semua 8.789 baris
 *
 * Jadi TIDAK ADA kunci bersama selain NAMA barang. Konversi harus dipetakan
 * lewat nama yang dinormalkan (huruf besar, spasi & tanda baca dibuang).
 *
 * Nama yang dipakai lebih dari satu item sengaja DIBUANG, supaya konversi
 * tidak menempel ke barang yang salah. Lebih baik item dianggap tanpa
 * konversi daripada stoknya salah hitung.
 */
export type RawConversionRow = {
  itemId?: string;
  itemName?: string;
  fromUnit?: string;
  toUnit?: string;
  toUnitQty?: number | string;
  level?: number | string;
  isActive?: string | boolean;
};

export type BridgedConversion = {
  itemId: string;
  fromUnit: string;
  toUnit: string;
  toUnitQty: number;
  level: number;
  isActive: boolean;
};

export function normalizeNameKey(value: unknown): string {
  return toText(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function bridgeConversionsToItems(
  conversions: RawConversionRow[],
  items: { itemId: string; itemName: string }[]
): { byItem: Map<string, BridgedConversion[]>; stats: { bridged: number; direct: number; unresolved: number; ambiguousNames: number } } {
  const idByName = new Map<string, string>();
  const ambiguous = new Set<string>();

  for (const item of items) {
    const key = normalizeNameKey(item.itemName);
    const id = toText(item.itemId).toUpperCase();
    if (!key || !id) continue;
    const existing = idByName.get(key);
    if (existing && existing !== id) {
      ambiguous.add(key);
      continue;
    }
    idByName.set(key, id);
  }
  for (const key of ambiguous) idByName.delete(key);

  const byItem = new Map<string, BridgedConversion[]>();
  const stats = { bridged: 0, direct: 0, unresolved: 0, ambiguousNames: ambiguous.size };

  for (const row of conversions) {
    const rawId = toText(row.itemId).toUpperCase();
    if (!rawId) continue;

    let itemId: string;
    if (/^ITM-/.test(rawId)) {
      itemId = rawId;
      stats.direct += 1;
    } else {
      const bridged = idByName.get(normalizeNameKey(row.itemName));
      if (!bridged) {
        stats.unresolved += 1;
        continue;
      }
      itemId = bridged;
      stats.bridged += 1;
    }

    const list = byItem.get(itemId) || [];
    list.push({
      itemId,
      fromUnit: toText(row.fromUnit).toUpperCase(),
      toUnit: toText(row.toUnit).toUpperCase(),
      toUnitQty: toNumber(row.toUnitQty),
      level: toNumber(row.level),
      isActive: String(row.isActive ?? "Y").toUpperCase() !== "N",
    });
    byItem.set(itemId, list);
  }

  return { byItem, stats };
}
