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
/**
 * Baca label satuan multipak iPOSS.
 *
 * iPOSS memakai kolom Satuan seperti: "SAK", "@3 SAK", "@5 SAK", "@20 SAK".
 * Artinya 1 transaksi "@5 SAK" = 5 paket SAK. Dipadukan dengan kolom Qty/:
 *
 *   Satuan   Qty/  Paket
 *   SAK      1     SAK    -> 1 transaksi = 1 SAK
 *   @3 SAK   3     SAK    -> 1 transaksi = 3 SAK
 *   @20 SAK  20    SAK    -> 1 transaksi = 20 SAK
 *
 * Karena Paket selalu "SAK", satuan dasar tetap SAK dan TIDAK perlu ditebak.
 */
export function parseMultiPackLabel(label: string): { qty: number; unit: string } | null {
  const raw = toText(label).toUpperCase();
  const match = /^@\s*(\d+(?:[.,]\d+)?)\s*([A-Z]*)$/.exec(raw);
  if (!match) return null;
  const qty = Number(match[1].replace(",", "."));
  if (!Number.isFinite(qty) || qty <= 0) return null;
  return { qty, unit: match[2] || "" };
}

export function buildUnitFactors(
  conversions: ConversionRow[]
): Record<string, Record<string, number>> {
  const byItem: Record<string, ConversionRow[]> = {};
  for (const row of conversions) {
    const itemId = toText(row.itemId).toUpperCase();
    const from = toText(row.fromUnit).toUpperCase();
    if (!itemId || !from) continue;
    if (row.isActive === false) continue;
    (byItem[itemId] = byItem[itemId] || []).push({
      ...row,
      fromUnit: from,
      toUnit: toText(row.toUnit).toUpperCase(),
      toUnitQty: toNumber(row.toUnitQty),
    });
  }

  const result: Record<string, Record<string, number>> = {};
  for (const [itemId, rows] of Object.entries(byItem)) {
    result[itemId] = resolveFactors(rows);
  }
  return result;
}

/**
 * Hitung faktor setiap satuan ke SATUAN DASAR dari relasi master data.
 *
 * ATURAN TUNGGAL (sudah diverifikasi ke 8.788 item di Master Data Konversi):
 *
 *     1 [FROM_UNIT] = TO_UNIT_QTY [TO_UNIT]
 *
 * Kolom `Qty/` SUDAH berisi jumlah satuan tujuan per satu satuan transaksi.
 * Jangan dikalikan lagi dengan angka pada label `@N`.
 *
 *   Satuan      Qty/  Paket   Arti
 *   PCS         1     PCS     1 transaksi = 1 PCS          -> faktor 1
 *   @6          6     PCS     1 transaksi = 6 PCS          -> faktor 6
 *   PCS         1     PCS
 *   @15 DUS     750   PCS     1 transaksi = 750 PCS        -> faktor 750
 *
 * Label `@N X` TETAP DISIMPAN sebagai satuan tersendiri (`@6`, `@5 SAK`,
 * `@25 Kg`), karena itu satuan transaksi yang dipakai iPOSS dan harus bisa
 * dipilih saat menerima barang. Yang dilarang hanyalah meleburnya menjadi `X`
 * — kalau dilebur, `@5 SAK` bertabrakan dengan `SAK` dan barisnya terbuang.
 *
 * Satuan dasar TIDAK ditebak dari nama (BAL/SAK bisa jadi satuan terkecil).
 * Yang menentukan: satuan tujuan yang tidak pernah menjadi satuan asal.
 */
export function resolveFactors(rows: ConversionRow[]): Record<string, number> {
  type Norm = {
    raw: string;
    isLabel: boolean;
    qty: number;
    fromUnit: string;
    labelQty: number;
    toUnit: string;
    toQty: number;
    toLabelQty: number;
    toIsLabel: boolean;
  };

  const norm: Norm[] = [];
  for (const row of rows) {
    if (row.isActive === false) continue;
    const raw = toText(row.fromUnit).toUpperCase();
    const qty = toNumber(row.toUnitQty);
    if (!raw || qty <= 0) continue;

    const fromLabel = parseMultiPackLabel(raw);
    const toLabel = parseMultiPackLabel(row.toUnit);

    norm.push({
      raw,
      isLabel: Boolean(fromLabel),
      qty,
      fromUnit: toText(fromLabel ? fromLabel.unit : raw).toUpperCase(),
      labelQty: fromLabel ? fromLabel.qty : 1,
      toUnit: toText(toLabel ? toLabel.unit : row.toUnit).toUpperCase(),
      toQty: qty,
      toLabelQty: toLabel ? toLabel.qty : 1,
      toIsLabel: Boolean(toLabel),
    });
  }
  if (norm.length === 0) return {};

  // 1) Satuan dasar = satuan Paket berupa satuan NYATA pada baris Qty/ = 1.
  //    Paket berlabel '@M' bukan satuan dasar (itu ukuran kemasan).
  let base = "";
  for (const row of norm) {
    if (row.qty === 1 && row.toUnit && !row.toIsLabel) {
      base = row.toUnit;
      break;
    }
  }
  if (!base) {
    for (const row of norm) {
      if (row.toUnit && !row.toIsLabel) {
        base = row.toUnit;
        break;
      }
    }
  }
  // 2) Paket berlabel '@25 Kg' tetap menyebut satuannya (KG). Dipakai untuk
  //    item yang SATU-SATUNYA barisnya berbentuk '@25 Kg | 1 | @25 Kg'
  //    (mis. 201M (25 KG), BURAS BMS (25 KG)) agar '1 @25 Kg = 25 KG' tidak hilang.
  if (!base) {
    for (const row of norm) {
      if (row.toIsLabel && row.toUnit) {
        base = row.toUnit;
        break;
      }
    }
  }
  // 2) Graf satuan biasa (tanpa '@') memberi faktor satuan fisik.
  const edges: Record<string, { value: number; to: string }[]> = {};
  for (const row of norm) {
    if (row.isLabel) continue;
    const from = row.fromUnit || row.raw;
    if (!from) continue;
    if (!row.toUnit) continue;
    const value = row.qty * row.toLabelQty;
    if (value <= 0) continue;
    if (from === row.toUnit && Math.abs(value - 1) < 1e-9) continue;
    (edges[from] = edges[from] || []).push({ value, to: row.toUnit });
  }

  const factors: Record<string, number> = { [base]: 1 };
  const resolveUnit = (unit: string, seen: Set<string>): number => {
    if (unit === base) return 1;
    if (factors[unit]) return factors[unit];
    if (seen.has(unit)) return 0;
    const next = new Set(seen);
    next.add(unit);
    for (const edge of edges[unit] || []) {
      if (edge.value <= 0) continue;
      const sub = resolveUnit(edge.to, next);
      if (sub > 0) {
        factors[unit] = edge.value * sub;
        return factors[unit];
      }
    }
    return 0;
  };
  for (const unit of Object.keys(edges)) {
    const value = resolveUnit(unit, new Set());
    if (value > 0) factors[unit] = value;
  }

  // 3) Faktor sel Paket.
  //    - Paket satuan nyata  -> faktornya x (mis. Paket = DUS, x = 25)
  //    - Paket '@M'          -> M
  //    - Paket kosong / '-'  -> 1 (kebanyakan item memakai PCS implisit)
  const paketFactor = (row: Norm): number => {
    if (row.toUnit) return row.toLabelQty * (factors[row.toUnit] || 0);
    // Paket '@3' berarti kemasan berisi 3 satuan: 1 transaksi = 3 satuan.
    if (row.toIsLabel) return row.toLabelQty;
    return 1;
  };

  const out: Record<string, number> = {};
  for (const row of norm) {
    const pf = paketFactor(row);
    if (pf <= 0) continue;
    const factor = Math.round(row.qty * pf * 1000) / 1000;
    if (factor <= 0) continue;

    // Satuan dasar tidak perlu baris sendiri.
    if (!row.isLabel && (row.fromUnit || row.raw) === base && Math.abs(factor - 1) < 1e-9) continue;

    // Label '@N' disimpan APA ADANYA sebagai satuan tersendiri.
    const key = row.isLabel ? row.raw : row.fromUnit || row.raw;
    if (!key || key === base) continue;
    if (!row.isLabel && key === row.toUnit && Math.abs(factor - 1) < 1e-9) continue;
    out[key] = Math.max(out[key] || 0, factor);
  }

  // Satuan dasar hanya dicantumkan bila ada satuan lain yang benar-benar
  // terhubung. Tanpa itu hasilnya {} dan pemanggil memakai UNIT_BASE item.
  if (Object.keys(out).length === 0) return {};
  if (base) out[base] = 1;
  return out;
}

/**
 * Satuan yang boleh dipakai saat menerima barang.
 *
 * Aturan:
 * - Satuan dasar (faktor 1) selalu ada.
 * - Hanya satuan yang punya faktor >= 1 yang ditawarkan.
 * - Label multipak `@N X` DITAMPILKAN sebagai pilihan tersendiri, karena itu
 *   satuan transaksi nyata di iPOSS: `@3 SAK`, `@5 SAK`, `@20 SAK`, `@6`, `@25 Kg`.
 *   Tanpa ini, kasir/penerima hanya bisa memilih SAK dan harus menghitung
 *   sendiri berapa karung yang datang.
 * - Diurutkan dari faktor terkecil, jadi satuan dasar selalu di atas dan
 *   multipak kecil (mis. `@3`) mendahului multipak besar (mis. `@20`).
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
    .sort((a, b) => {
      if (a.isBase !== b.isBase) return a.isBase ? -1 : 1;
      if (a.toUnitQty !== b.toUnitQty) return a.toUnitQty - b.toUnitQty;
      // Faktor sama (mis. DUS 20 dan @20 PCS): satuan fisik dulu, label @ sesudahnya.
      const aLabel = a.unit.startsWith("@");
      const bLabel = b.unit.startsWith("@");
      if (aLabel !== bLabel) return aLabel ? 1 : -1;
      return a.unit.localeCompare(b.unit);
    });

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

  // Label multipak ('@5 SAK', '@6') adalah satuan TRANSAKSI, bukan satuan
  // tampilan saldo. Saldo tetap dipecah ke satuan fisik saja supaya
  // "3 @5 SAK" tidak pernah muncul sebagai hasil pecahan stok.
  const ordered = Object.entries(table)
    .filter(([unit, factor]) => unit !== base && factor > 1 && !unit.startsWith("@"))
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

/**
 * Expiry Monitor — membaca STOCK_BATCH dan menghitung sisa hari.
 *
 * Aturan bisnis yang WAJIB dipegang:
 * - Hanya item `TRACK_EXPIRY=Y` yang boleh masuk monitor. Stok gudang memang
 *   berisi barang ber-expired DAN tanpa expired; batch tanpa tanggal expired
 *   pada item ber-flag Y tetap ditampilkan sebagai "tanpa tanggal" (merah)
 *   karena itu data yang bolong, bukan alasan menyembunyikannya.
 * - Batch milik item `TRACK_EXPIRY=N` dibuang seluruhnya, walau tanggalnya
 *   kebetulan terisi.
 * - Sisa hari dihitung dari TANGGAL (bukan jam), supaya "besok" selalu 1.
 */
export type BatchRow = {
  batchId: string;
  itemId: string;
  itemName: string;
  warehouseId: string;
  batchNo: string;
  productionDate: string;
  expiredDate: string;
  qtyInBase: number;
  qtyRemainBase: number;
  unitBase: string;
  unitCost: number;
  supplier: string;
  grNo: string;
  status: string;
};

export type ExpiryStatus = "EXPIRED" | "CRITICAL" | "WARNING" | "SAFE" | "NO_DATE";

export type ExpiryRow = {
  batchId: string;
  itemId: string;
  itemName: string;
  category: string;
  warehouseId: string;
  warehouseName: string;
  batchNo: string;
  expiredDate: string;
  daysLeft: number | null;
  status: ExpiryStatus;
  qtyRemainBase: number;
  unitBase: string;
  display: string;
  unitCost: number;
  value: number;
  grNo: string;
  supplier: string;
};

/** Ambil bagian YYYY-MM-DD dari berbagai bentuk sel spreadsheet. */
function toIsoDatePart(value: unknown): string {
  const raw = toText(value);
  if (!raw) return "";
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // 05/31/2027 atau 31/05/2027 — tebak dari besaran angka pertama.
  const slash = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(raw);
  if (slash) {
    const a = Number(slash[1]);
    const b = Number(slash[2]);
    const year = slash[3];
    const month = a > 12 ? b : a;
    const day = a > 12 ? a : b;
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${year}-${pad(month)}-${pad(day)}`;
  }
  return "";
}

/** Selisih hari kalender: `expired` - `today`, dua-duanya YYYY-MM-DD. */
export function daysUntil(expiredDate: string, today: string): number | null {
  const toUtc = (iso: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(toIsoDatePart(iso));
    if (!m) return null;
    return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  };
  const a = toUtc(expiredDate);
  const b = toUtc(today);
  if (a === null || b === null) return null;
  return Math.round((a - b) / 86400000);
}

/**
 * Warna status berdasarkan sisa hari.
 *
 * Ambang dipilih agar langsung bisa ditindaklanjuti:
 *   <= 0   EXPIRED  (merah) — sudah lewat, harus dipisah dari stok jual
 *   <= 30  CRITICAL (merah) — sebulan lagi, jadwalkan diskon/retur
 *   <= 90  WARNING  (kuning) — kuartal terakhir umur simpan
 *   > 90   SAFE     (hijau)
 *   null   NO_DATE  (merah) — item ber-expired tapi tanggalnya kosong
 */
export function expiryStatusFor(daysLeft: number | null, warningDays = 90, criticalDays = 30): ExpiryStatus {
  if (daysLeft === null) return "NO_DATE";
  if (daysLeft <= 0) return "EXPIRED";
  if (daysLeft <= criticalDays) return "CRITICAL";
  if (daysLeft <= warningDays) return "WARNING";
  return "SAFE";
}

/** Baris STOCK_BATCH mentah -> objek. Nama kolom mengikuti build_workbook.py. */
export function mapBatchRow(row: Record<string, string>): BatchRow {
  return {
    batchId: toText(row.BATCH_ID),
    itemId: toText(row.ITEM_ID).toUpperCase(),
    itemName: toText(row.ITEM_NAME),
    warehouseId: toText(row.WAREHOUSE_ID).toUpperCase(),
    batchNo: toText(row.BATCH_NO),
    productionDate: toIsoDatePart(row.PRODUCTION_DATE),
    expiredDate: toIsoDatePart(row.EXPIRED_DATE),
    qtyInBase: toNumber(row.QTY_IN_BASE),
    qtyRemainBase: toNumber(row.QTY_REMAIN_BASE),
    unitBase: toText(row.UNIT_BASE).toUpperCase() || "PCS",
    unitCost: toNumber(row.UNIT_COST),
    supplier: toText(row.SUPPLIER),
    grNo: toText(row.GR_NO),
    status: toText(row.STATUS).toUpperCase() || "ACTIVE",
  };
}

/**
 * Bangun daftar pantau kedaluwarsa.
 *
 * - Sisa qty 0 dilewati: batch habis tidak perlu dipantau.
 * - Batch non-AKTIF dilewati (sudah ditarik/rusak, ditangani terpisah).
 * - Item TRACK_EXPIRY=N dibuang walau batch-nya bertanggal.
 * - Diurutkan dari yang paling mendesak, batch tanpa tanggal ikut di depan
 *   karena tidak bisa dijadwalkan sama sekali.
 */
export function buildExpiryMonitor(
  batches: BatchRow[],
  items: ItemRow[],
  warehouses: WarehouseRow[],
  factorsByItem: Record<string, Record<string, number>>,
  opts: { today: string; warningDays?: number; criticalDays?: number }
): ExpiryRow[] {
  const warningDays = opts.warningDays && opts.warningDays > 0 ? opts.warningDays : 90;
  const criticalDays = opts.criticalDays && opts.criticalDays > 0 ? opts.criticalDays : 30;

  const itemById = new Map<string, ItemRow>();
  for (const item of items) itemById.set(toText(item.itemId).toUpperCase(), item);

  const warehouseById = new Map<string, string>();
  for (const wh of warehouses) {
    warehouseById.set(toText(wh.warehouseId).toUpperCase(), toText(wh.warehouseName));
  }

  const result: ExpiryRow[] = [];
  for (const batch of batches) {
    if (batch.qtyRemainBase <= 0) continue;
    if (batch.status && batch.status !== "ACTIVE") continue;

    const master = itemById.get(batch.itemId);
    if (master && !master.trackExpiry) continue;

    const unitBase = master?.unitBase || batch.unitBase || "PCS";
    const daysLeft = batch.expiredDate ? daysUntil(batch.expiredDate, opts.today) : null;
    const parts = breakdownBaseQty(batch.qtyRemainBase, factorsByItem[batch.itemId], unitBase);
    const qty = Math.round(batch.qtyRemainBase * 1000) / 1000;

    result.push({
      batchId: batch.batchId,
      itemId: batch.itemId,
      itemName: master?.itemName || batch.itemName || batch.itemId,
      category: master?.category || "",
      warehouseId: batch.warehouseId,
      warehouseName: warehouseById.get(batch.warehouseId) || batch.warehouseId,
      batchNo: batch.batchNo,
      expiredDate: batch.expiredDate,
      daysLeft,
      status: expiryStatusFor(daysLeft, warningDays, criticalDays),
      qtyRemainBase: qty,
      unitBase,
      display: formatStockDisplay(parts, qty, unitBase),
      unitCost: batch.unitCost,
      value: Math.round(batch.unitCost * qty),
      grNo: batch.grNo,
      supplier: batch.supplier,
    });
  }

  const rank: Record<ExpiryStatus, number> = {
    NO_DATE: 0,
    EXPIRED: 1,
    CRITICAL: 2,
    WARNING: 3,
    SAFE: 4,
  };
  result.sort((a, b) => {
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    if (a.daysLeft !== b.daysLeft) {
      const av = a.daysLeft === null ? -1 : a.daysLeft;
      const bv = b.daysLeft === null ? -1 : b.daysLeft;
      if (av !== bv) return av - bv;
    }
    return a.itemName.localeCompare(b.itemName);
  });
  return result;
}

/** Ringkasan Expiry Monitor untuk kartu angka + filter cepat. */
export function summarizeExpiry(rows: ExpiryRow[]) {
  const count = (status: ExpiryStatus) => rows.filter((row) => row.status === status).length;
  const valueOf = (from: number, to: number | null) =>
    rows
      .filter((row) => row.daysLeft !== null && row.daysLeft >= from && (to === null || row.daysLeft <= to))
      .reduce((sum, row) => sum + row.value, 0);

  return {
    batches: rows.length,
    items: new Set(rows.map((row) => row.itemId)).size,
    expired: count("EXPIRED"),
    critical: count("CRITICAL"),
    warning: count("WARNING"),
    safe: count("SAFE"),
    noDate: count("NO_DATE"),
    qtyBase: Math.round(rows.reduce((sum, row) => sum + row.qtyRemainBase, 0) * 1000) / 1000,
    // Nilai barang yang harus segera ditindaklanjuti: sudah lewat s/d 30 hari lagi.
    valueAtRisk: Math.round(valueOf(-100000, 30)),
    valueTotal: Math.round(rows.reduce((sum, row) => sum + row.value, 0)),
  };
}

/** Saring Expiry Monitor. `status` kosong = semua. */
export function filterExpiry(
  rows: ExpiryRow[],
  opts: { q?: string; warehouseId?: string; status?: string; maxDays?: number }
): ExpiryRow[] {
  const q = toText(opts.q).toUpperCase();
  const warehouseId = toText(opts.warehouseId).toUpperCase();
  const status = toText(opts.status).toUpperCase();
  const maxDays = Number(opts.maxDays);

  return rows.filter((row) => {
    if (warehouseId && row.warehouseId !== warehouseId) return false;
    if (status && row.status !== status) return false;
    if (Number.isFinite(maxDays) && maxDays > 0) {
      if (row.daysLeft === null || row.daysLeft > maxDays) return false;
    }
    if (q) {
      const haystack = `${row.itemName} ${row.itemId} ${row.batchNo} ${row.grNo} ${row.category}`.toUpperCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}
