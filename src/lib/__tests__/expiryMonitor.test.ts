import { describe, expect, it } from 'vitest';
import {
  buildExpiryMonitor,
  daysUntil,
  expiryStatusFor,
  filterExpiry,
  mapBatchRow,
  summarizeExpiry,
  type BatchRow,
  type ItemRow,
  type WarehouseRow,
} from '../wms-stock';

const TODAY = '2026-11-18';

const item = (over: Partial<ItemRow> = {}): ItemRow => ({
  itemId: 'ITM-1',
  itemName: 'CAT CHOIZE KITTEN SALMON 20KG',
  category: 'MAKANAN KUCING',
  unitBase: 'SAK',
  buyUnitDefault: 'SAK',
  iposCode: '',
  trackExpiry: true,
  minStock: 0,
  maxStock: 0,
  isActive: true,
  ...over,
});

const batch = (over: Partial<BatchRow> = {}): BatchRow => ({
  batchId: 'GR-1-B1',
  itemId: 'ITM-1',
  itemName: 'CAT CHOIZE KITTEN SALMON 20KG',
  warehouseId: 'WH-NAG',
  batchNo: 'B-001',
  productionDate: '',
  expiredDate: '2027-05-31',
  qtyInBase: 60,
  qtyRemainBase: 60,
  unitBase: 'SAK',
  unitCost: 1000,
  supplier: 'SUP-A',
  grNo: 'GR-1',
  status: 'ACTIVE',
  ...over,
});

const warehouses: WarehouseRow[] = [{ warehouseId: 'WH-NAG', warehouseName: 'Nagoya' }];
const factors = { 'ITM-1': { SAK: 1, BAL: 20 } };

describe('daysUntil', () => {
  it('menghitung selisih hari kalender', () => {
    expect(daysUntil('2026-11-18', TODAY)).toBe(0);
    expect(daysUntil('2026-11-19', TODAY)).toBe(1);
    expect(daysUntil('2026-11-17', TODAY)).toBe(-1);
    expect(daysUntil('2027-05-31', TODAY)).toBe(194);
  });

  it('tahan terhadap jam, tanggal teks, dan sel kosong', () => {
    expect(daysUntil('2026-11-19T00:00:00.000Z', TODAY)).toBe(1);
    expect(daysUntil('19/11/2026', TODAY)).toBe(1);
    expect(daysUntil('11/19/2026', TODAY)).toBe(1);
    expect(daysUntil('', TODAY)).toBeNull();
    expect(daysUntil('2026-11-19', '')).toBeNull();
  });
});

describe('expiryStatusFor', () => {
  it('memakai ambang merah / kuning / hijau', () => {
    expect(expiryStatusFor(-3)).toBe('EXPIRED');
    expect(expiryStatusFor(0)).toBe('EXPIRED');
    expect(expiryStatusFor(1)).toBe('CRITICAL');
    expect(expiryStatusFor(30)).toBe('CRITICAL');
    expect(expiryStatusFor(31)).toBe('WARNING');
    expect(expiryStatusFor(90)).toBe('WARNING');
    expect(expiryStatusFor(91)).toBe('SAFE');
    expect(expiryStatusFor(null)).toBe('NO_DATE');
  });

  it('ambang bisa diubah lewat parameter', () => {
    expect(expiryStatusFor(10, 20, 5)).toBe('WARNING');
    expect(expiryStatusFor(10)).toBe('CRITICAL');
  });
});

describe('mapBatchRow', () => {
  it('memetakan kolom STOCK_BATCH', () => {
    const row = mapBatchRow({
      BATCH_ID: 'GR-9-B1',
      ITEM_ID: 'itm-1',
      ITEM_NAME: 'CAT CHOIZE',
      WAREHOUSE_ID: 'wh-nag',
      BATCH_NO: 'B-9',
      EXPIRED_DATE: '2027-01-31',
      QTY_IN_BASE: '60',
      QTY_REMAIN_BASE: '45',
      UNIT_BASE: 'sak',
      UNIT_COST: '1000',
      SUPPLIER: 'SUP-A',
      GR_NO: 'GR-9',
      STATUS: 'active',
    });
    expect(row.itemId).toBe('ITM-1');
    expect(row.warehouseId).toBe('WH-NAG');
    expect(row.unitBase).toBe('SAK');
    expect(row.expiredDate).toBe('2027-01-31');
    expect(row.qtyRemainBase).toBe(45);
    expect(row.status).toBe('ACTIVE');
  });
});

describe('buildExpiryMonitor', () => {
  it('hanya memantau item ber-flag TRACK_EXPIRY=Y', () => {
    const rows = buildExpiryMonitor(
      [batch(), batch({ batchId: 'GR-2-B1', itemId: 'ITM-2', expiredDate: '2026-11-20' })],
      [item(), item({ itemId: 'ITM-2', itemName: 'TANPA EXPIRED', trackExpiry: false })],
      warehouses,
      factors,
      { today: TODAY }
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].itemId).toBe('ITM-1');
  });

  it('membuang batch habis dan batch non-aktif', () => {
    const rows = buildExpiryMonitor(
      [
        batch({ batchId: 'A', qtyRemainBase: 0 }),
        batch({ batchId: 'B', status: 'VOID' }),
        batch({ batchId: 'C' }),
      ],
      [item()],
      warehouses,
      factors,
      { today: TODAY }
    );
    expect(rows.map((r) => r.batchId)).toEqual(['C']);
  });

  it('menandai batch tanpa tanggal sebagai NO_DATE', () => {
    const rows = buildExpiryMonitor([batch({ expiredDate: '' })], [item()], warehouses, factors, {
      today: TODAY,
    });
    expect(rows[0].status).toBe('NO_DATE');
    expect(rows[0].daysLeft).toBeNull();
  });

  it('mengurutkan yang paling mendesak lebih dulu', () => {
    const rows = buildExpiryMonitor(
      [
        batch({ batchId: 'SAFE', expiredDate: '2028-01-01' }),
        batch({ batchId: 'WARN', expiredDate: '2026-12-20' }),
        batch({ batchId: 'EXP', expiredDate: '2026-10-01' }),
        batch({ batchId: 'NODATE', expiredDate: '' }),
        batch({ batchId: 'CRIT', expiredDate: '2026-11-25' }),
      ],
      [item()],
      warehouses,
      factors,
      { today: TODAY }
    );
    expect(rows.map((r) => r.batchId)).toEqual(['NODATE', 'EXP', 'CRIT', 'WARN', 'SAFE']);
  });

  it('mengisi rincian satuan bertingkat dan nilai rupiah', () => {
    const rows = buildExpiryMonitor(
      [batch({ qtyRemainBase: 45, unitCost: 2000 })],
      [item()],
      warehouses,
      factors,
      { today: TODAY }
    );
    expect(rows[0].display).toBe('2 BAL + 5 SAK / 45 SAK');
    expect(rows[0].value).toBe(90000);
    expect(rows[0].warehouseName).toBe('Nagoya');
  });

  it('memakai nama dari ledger bila item tidak ada di master', () => {
    const rows = buildExpiryMonitor(
      [batch({ itemId: 'ITM-X', itemName: 'BARANG TAK ADA MASTER', unitBase: 'PCS' })],
      [item()],
      warehouses,
      {},
      { today: TODAY }
    );
    expect(rows[0].itemName).toBe('BARANG TAK ADA MASTER');
    expect(rows[0].unitBase).toBe('PCS');
  });
});

describe('summarizeExpiry', () => {
  it('menghitung jumlah per status dan nilai berisiko', () => {
    const rows = buildExpiryMonitor(
      [
        batch({ batchId: 'EXP', expiredDate: '2026-11-01', qtyRemainBase: 10, unitCost: 1000 }),
        batch({ batchId: 'CRIT', expiredDate: '2026-11-25', qtyRemainBase: 5, unitCost: 1000 }),
        batch({ batchId: 'WARN', expiredDate: '2027-01-15', qtyRemainBase: 7, unitCost: 1000 }),
        batch({ batchId: 'SAFE', expiredDate: '2028-01-15', qtyRemainBase: 3, unitCost: 1000 }),
      ],
      [item()],
      warehouses,
      factors,
      { today: TODAY }
    );
    const summary = summarizeExpiry(rows);
    expect(summary.batches).toBe(4);
    expect(summary.expired).toBe(1);
    expect(summary.critical).toBe(1);
    expect(summary.warning).toBe(1);
    expect(summary.safe).toBe(1);
    expect(summary.qtyBase).toBe(25);
    expect(summary.valueAtRisk).toBe(15000);
    expect(summary.valueTotal).toBe(25000);
  });
});

describe('filterExpiry', () => {
  const rows = buildExpiryMonitor(
    [
      batch({ batchId: 'A', itemName: 'CAT CHOIZE', expiredDate: '2026-11-01' }),
      batch({ batchId: 'B', itemId: 'ITM-2', itemName: 'GALAC ZOO', expiredDate: '2027-01-15' }),
    ],
    [item(), item({ itemId: 'ITM-2', itemName: 'GALAC ZOO' })],
    warehouses,
    {},
    { today: TODAY }
  );

  it('menyaring per status, teks, dan batas hari', () => {
    expect(filterExpiry(rows, { status: 'EXPIRED' }).map((r) => r.batchId)).toEqual(['A']);
    expect(filterExpiry(rows, { q: 'galac' }).map((r) => r.batchId)).toEqual(['B']);
    expect(filterExpiry(rows, { maxDays: 30 }).map((r) => r.batchId)).toEqual(['A']);
    expect(filterExpiry(rows, {})).toHaveLength(2);
  });

  it('menyaring per gudang', () => {
    expect(filterExpiry(rows, { warehouseId: 'wh-nag' })).toHaveLength(2);
    expect(filterExpiry(rows, { warehouseId: 'WH-CIR' })).toHaveLength(0);
  });
});
