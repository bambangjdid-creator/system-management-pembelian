import { describe, expect, it } from 'vitest';
import {
  aggregateLedger,
  breakdownBaseQty,
  buildMovements,
  buildUnitFactors,
  filterBalances,
  formatBreakdown,
  formatQty,
  formatStockDisplay,
  summarize,
  type ConversionRow,
  type ItemRow,
} from '../wms-stock';

// A591-K: 1 DUS = 20 PCS, 1 BAL = 12 DUS (= 240 PCS)
const conversions: ConversionRow[] = [
  { itemId: 'ITM-004945', fromUnit: 'DUS', toUnit: 'PCS', toUnitQty: 20, level: 1, isActive: true },
  { itemId: 'ITM-004945', fromUnit: 'BAL', toUnit: 'DUS', toUnitQty: 12, level: 2, isActive: true },
  { itemId: 'ITM-1', fromUnit: 'PCS', toUnit: 'PCS', toUnitQty: 1, level: 0, isActive: true },
  { itemId: 'ITM-OFF', fromUnit: 'DUS', toUnit: 'PCS', toUnitQty: 20, level: 1, isActive: false },
];

const items: ItemRow[] = [
  {
    itemId: 'ITM-004945',
    itemName: 'A591-K',
    category: 'MAKANAN KUCING',
    unitBase: 'PCS',
    buyUnitDefault: 'DUS',
    iposCode: 'A591-K',
    trackExpiry: true,
    minStock: 100,
    maxStock: 5000,
    isActive: true,
  },
  {
    itemId: 'ITM-004916',
    itemName: '511 BRAVO (25 KG)',
    category: 'MAKANAN ANJING',
    unitBase: 'KG',
    buyUnitDefault: 'SAK',
    iposCode: '',
    trackExpiry: false,
    minStock: 0,
    maxStock: 0,
    isActive: true,
  },
];

const warehouses = [
  { warehouseId: 'WH-NAG', warehouseName: 'Gudang Nagoya' },
  { warehouseId: 'WH-PON', warehouseName: 'Gudang Poncol' },
];

describe('buildUnitFactors', () => {
  it('membaca konversi langsung DUS -> PCS', () => {
    expect(buildUnitFactors(conversions)['ITM-004945'].DUS).toBe(20);
  });

  it('menyusun rantai bertingkat BAL -> DUS -> PCS', () => {
    expect(buildUnitFactors(conversions)['ITM-004945'].BAL).toBe(240);
  });

  it('satuan dasar selalu faktor 1', () => {
    expect(buildUnitFactors(conversions)['ITM-004945'].PCS).toBe(1);
  });

  it('konversi nonaktif diabaikan', () => {
    expect(buildUnitFactors(conversions)['ITM-OFF']).toBeUndefined();
  });

  it('tidak loop bila data saling menunjuk', () => {
    const circular: ConversionRow[] = [
      { itemId: 'X', fromUnit: 'A', toUnit: 'B', toUnitQty: 2, level: 1, isActive: true },
      { itemId: 'X', fromUnit: 'B', toUnit: 'A', toUnitQty: 2, level: 1, isActive: true },
    ];
    expect(() => buildUnitFactors(circular)).not.toThrow();
  });
});

describe('breakdownBaseQty', () => {
  const factors = { PCS: 1, DUS: 20, BAL: 240 };

  it('260 PCS = 1 BAL + 1 DUS (240 + 20)', () => {
    expect(breakdownBaseQty(260, factors, 'PCS')).toEqual([
      { unit: 'BAL', qty: 1 },
      { unit: 'DUS', qty: 1 },
    ]);
  });

  it('memberi sisa yang tidak penuh: 265 PCS = 1 BAL + 1 DUS + 5 PCS', () => {
    expect(breakdownBaseQty(265, factors, 'PCS')).toEqual([
      { unit: 'BAL', qty: 1 },
      { unit: 'DUS', qty: 1 },
      { unit: 'PCS', qty: 5 },
    ]);
  });

  it('60 PCS = 3 DUS tanpa sisa', () => {
    expect(breakdownBaseQty(60, factors, 'PCS')).toEqual([{ unit: 'DUS', qty: 3 }]);
  });

  it('5 PCS tetap 5 PCS', () => {
    expect(breakdownBaseQty(5, factors, 'PCS')).toEqual([{ unit: 'PCS', qty: 5 }]);
  });

  it('nol menghasilkan satuan dasar 0', () => {
    expect(breakdownBaseQty(0, factors, 'PCS')).toEqual([{ unit: 'PCS', qty: 0 }]);
  });

  it('stok minus tetap terbaca', () => {
    expect(breakdownBaseQty(-25, factors, 'PCS')).toEqual([
      { unit: 'DUS', qty: -1 },
      { unit: 'PCS', qty: -5 },
    ]);
  });

  it('tanpa data konversi memakai satuan dasar saja', () => {
    expect(breakdownBaseQty(60, undefined, 'PCS')).toEqual([{ unit: 'PCS', qty: 60 }]);
  });
});

describe('formatBreakdown', () => {
  it('menggabungkan dengan tanda plus', () => {
    expect(formatBreakdown([
      { unit: 'BAL', qty: 1 },
      { unit: 'PCS', qty: 20 },
    ])).toBe('1 BAL + 20 PCS');
  });

  it('formatStockDisplay menambahkan total satuan dasar', () => {
    expect(formatStockDisplay([{ unit: 'DUS', qty: 3 }], 60, 'PCS')).toBe('3 DUS / 60 PCS');
  });

  it('formatStockDisplay tidak mengulang bila hanya satuan dasar', () => {
    expect(formatStockDisplay([{ unit: 'PCS', qty: 5 }], 5, 'PCS')).toBe('5 PCS');
  });

  it('kosong menghasilkan string kosong', () => {
    expect(formatBreakdown([])).toBe('');
  });
});

describe('formatQty', () => {
  it('memakai koma untuk desimal (gaya Indonesia)', () => {
    expect(formatQty(1.5)).toBe('1,5');
  });

  it('bilangan bulat apa adanya', () => {
    expect(formatQty(60)).toBe('60');
  });
});

describe('aggregateLedger', () => {
  const factors = buildUnitFactors(conversions);

  it('menjumlahkan QTY_BASE per item per gudang', () => {
    const out = aggregateLedger(
      [
        { ITEM_ID: 'ITM-004945', ITEM_NAME: 'A591-K', WAREHOUSE_ID: 'WH-NAG', QTY_BASE: '60', TRX_DATE: '2027-01-05' },
        { ITEM_ID: 'ITM-004945', ITEM_NAME: 'A591-K', WAREHOUSE_ID: 'WH-NAG', QTY_BASE: '20', TRX_DATE: '2027-01-10' },
      ],
      items,
      warehouses,
      factors
    );
    expect(out).toHaveLength(1);
    expect(out[0].qtyBase).toBe(80);
  });

  it('memisahkan saldo per gudang', () => {
    const out = aggregateLedger(
      [
        { ITEM_ID: 'ITM-004945', WAREHOUSE_ID: 'WH-NAG', QTY_BASE: '60' },
        { ITEM_ID: 'ITM-004945', WAREHOUSE_ID: 'WH-PON', QTY_BASE: '40' },
      ],
      items,
      warehouses,
      factors
    );
    expect(out).toHaveLength(2);
    expect(out.find((r) => r.warehouseId === 'WH-PON')?.qtyBase).toBe(40);
  });

  it('menghitung QTY_BASE dari QTY_IN bila kolom kosong', () => {
    const out = aggregateLedger(
      [{ ITEM_ID: 'ITM-004945', WAREHOUSE_ID: 'WH-NAG', QTY_IN: '3', QTY_OUT: '0', TO_UNIT_QTY: '20' }],
      items,
      warehouses,
      factors
    );
    expect(out[0].qtyBase).toBe(60);
  });

  it('QTY_OUT mengurangi saldo', () => {
    const out = aggregateLedger(
      [
        { ITEM_ID: 'ITM-004945', WAREHOUSE_ID: 'WH-NAG', QTY_BASE: '60' },
        { ITEM_ID: 'ITM-004945', WAREHOUSE_ID: 'WH-NAG', QTY_BASE: '-20' },
      ],
      items,
      warehouses,
      factors
    );
    expect(out[0].qtyBase).toBe(40);
  });

  it('menyertakan tampilan bertingkat', () => {
    const out = aggregateLedger(
      [{ ITEM_ID: 'ITM-004945', WAREHOUSE_ID: 'WH-NAG', QTY_BASE: '260' }],
      items,
      warehouses,
      factors
    );
    expect(out[0].display).toBe('1 BAL + 1 DUS / 260 PCS');
  });

  it('memakai nama gudang dari tab WAREHOUSE', () => {
    const out = aggregateLedger(
      [{ ITEM_ID: 'ITM-004945', WAREHOUSE_ID: 'WH-NAG', QTY_BASE: '60' }],
      items,
      warehouses,
      factors
    );
    expect(out[0].warehouseName).toBe('Gudang Nagoya');
  });

  it('melewati baris tanpa ITEM_ID', () => {
    const out = aggregateLedger(
      [
        { ITEM_ID: '', QTY_BASE: '999' },
        { ITEM_ID: 'ITM-004945', WAREHOUSE_ID: 'WH-NAG', QTY_BASE: '60' },
      ],
      items,
      warehouses,
      factors
    );
    expect(out).toHaveLength(1);
  });

  it('item di luar master tetap tampil dengan nama dari ledger', () => {
    const out = aggregateLedger(
      [{ ITEM_ID: 'ITM-BARU', ITEM_NAME: 'Barang Baru', WAREHOUSE_ID: 'WH-NAG', QTY_BASE: '5' }],
      items,
      warehouses,
      factors
    );
    expect(out[0].itemName).toBe('Barang Baru');
    expect(out[0].unitBase).toBe('PCS');
  });

  it('menandai stok di bawah minimum sebagai LOW', () => {
    const out = aggregateLedger(
      [{ ITEM_ID: 'ITM-004945', WAREHOUSE_ID: 'WH-NAG', QTY_BASE: '60' }],
      items,
      warehouses,
      factors
    );
    expect(out[0].status).toBe('LOW');
  });

  it('menandai stok nol sebagai EMPTY', () => {
    const out = aggregateLedger(
      [
        { ITEM_ID: 'ITM-004945', WAREHOUSE_ID: 'WH-NAG', QTY_BASE: '60' },
        { ITEM_ID: 'ITM-004945', WAREHOUSE_ID: 'WH-NAG', QTY_BASE: '-60' },
      ],
      items,
      warehouses,
      factors
    );
    expect(out[0].status).toBe('EMPTY');
  });

  it('mencatat tanggal transaksi terakhir', () => {
    const out = aggregateLedger(
      [
        { ITEM_ID: 'ITM-004945', WAREHOUSE_ID: 'WH-NAG', QTY_BASE: '10', TRX_DATE: '2027-01-05' },
        { ITEM_ID: 'ITM-004945', WAREHOUSE_ID: 'WH-NAG', QTY_BASE: '10', TRX_DATE: '2027-03-01' },
      ],
      items,
      warehouses,
      factors
    );
    expect(out[0].lastTrxDate).toBe('2027-03-01');
  });
});

describe('filterBalances', () => {
  const factors = buildUnitFactors(conversions);
  const balances = aggregateLedger(
    [
      { ITEM_ID: 'ITM-004945', ITEM_NAME: 'A591-K', WAREHOUSE_ID: 'WH-NAG', QTY_BASE: '60' },
      { ITEM_ID: 'ITM-004945', ITEM_NAME: 'A591-K', WAREHOUSE_ID: 'WH-PON', QTY_BASE: '400' },
      { ITEM_ID: 'ITM-004916', ITEM_NAME: '511 BRAVO (25 KG)', WAREHOUSE_ID: 'WH-NAG', QTY_BASE: '50' },
    ],
    items,
    warehouses,
    factors
  );

  it('menyaring per gudang', () => {
    expect(filterBalances(balances, { warehouseId: 'WH-PON' })).toHaveLength(1);
  });

  it('mencari nama tanpa peduli huruf besar', () => {
    expect(filterBalances(balances, { q: 'bravo' })).toHaveLength(1);
  });

  it('mencari lewat kode iPOSS', () => {
    expect(filterBalances(balances, { q: 'A591' })).toHaveLength(2);
  });

  it('menyaring item di bawah minimum', () => {
    const out = filterBalances(balances, { belowMin: true });
    expect(out.every((row) => row.qtyBase < row.minStock)).toBe(true);
  });

  it('tanpa filter mengembalikan semua', () => {
    expect(filterBalances(balances, {})).toHaveLength(3);
  });
});

describe('buildMovements', () => {
  const ledger = [
    { ITEM_ID: 'ITM-004945', TRX_ID: 'A', TRX_DATE: '2027-01-10', TRX_TYPE: 'RECEIVE', QTY_BASE: '60', WAREHOUSE_ID: 'WH-NAG', CREATED_AT: '2027-01-10T01:00:00Z' },
    { ITEM_ID: 'ITM-004945', TRX_ID: 'B', TRX_DATE: '2027-01-05', TRX_TYPE: 'OPNAME_IN', QTY_BASE: '100', WAREHOUSE_ID: 'WH-NAG', CREATED_AT: '2027-01-05T01:00:00Z' },
    { ITEM_ID: 'ITM-004945', TRX_ID: 'C', TRX_DATE: '2027-01-15', TRX_TYPE: 'RECEIVE', QTY_BASE: '-20', WAREHOUSE_ID: 'WH-NAG', CREATED_AT: '2027-01-15T01:00:00Z' },
    { ITEM_ID: 'ITM-004916', TRX_ID: 'D', TRX_DATE: '2027-01-01', QTY_BASE: '50', WAREHOUSE_ID: 'WH-NAG' },
  ];

  it('hanya mengambil item yang diminta', () => {
    const out = buildMovements(ledger, 'ITM-004945', warehouses);
    expect(out).toHaveLength(3);
  });

  it('mengurutkan kronologis, bukan urutan baris sheet', () => {
    const out = buildMovements(ledger, 'ITM-004945', warehouses);
    expect(out.map((m) => m.trxId)).toEqual(['B', 'A', 'C']);
  });

  it('menghitung saldo berjalan', () => {
    const out = buildMovements(ledger, 'ITM-004945', warehouses);
    expect(out.map((m) => m.runningBase)).toEqual([100, 160, 140]);
  });

  it('menyaring per gudang', () => {
    const out = buildMovements(ledger, 'ITM-004945', warehouses, { warehouseId: 'WH-PON' });
    expect(out).toHaveLength(0);
  });

  it('mengisi nama gudang', () => {
    const out = buildMovements(ledger, 'ITM-004945', warehouses);
    expect(out[0].warehouseName).toBe('Gudang Nagoya');
  });
});

describe('summarize', () => {
  it('menghitung jumlah baris, item, dan gudang unik', () => {
    const factors = buildUnitFactors(conversions);
    const balances = aggregateLedger(
      [
        { ITEM_ID: 'ITM-004945', WAREHOUSE_ID: 'WH-NAG', QTY_BASE: '60' },
        { ITEM_ID: 'ITM-004945', WAREHOUSE_ID: 'WH-PON', QTY_BASE: '40' },
        { ITEM_ID: 'ITM-004916', WAREHOUSE_ID: 'WH-NAG', QTY_BASE: '10' },
      ],
      items,
      warehouses,
      factors
    );
    const out = summarize(balances);
    expect(out.rows).toBe(3);
    expect(out.items).toBe(2);
    expect(out.warehouses).toBe(2);
    expect(out.totalQtyBase).toBe(110);
  });
});
