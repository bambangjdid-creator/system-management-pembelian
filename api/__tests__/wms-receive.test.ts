import { beforeAll, describe, expect, it } from 'vitest';

// Menguji bagian penerimaan yang paling berisiko: konversi satuan saat terima,
// pemetaan divisi ke gudang, dan normalisasi tanggal expired.
type Helpers = {
  resolveWarehouseId: (division: unknown) => string;
  normalizeDateInput: (value: unknown) => string;
  isValidIsoDate: (value: string) => boolean;
  matchWmsItem: (
    nameOrCode: string,
    items: any[],
    index: Map<string, any[]>
  ) => { item: any | null; confidence: string };
  buildAllowedUnits: (
    item: any | null,
    conversions: { fromUnit: string; toUnit: string; toUnitQty: number }[]
  ) => { unit: string; toUnitQty: number; isBase: boolean }[];
};

let h: Helpers;

const items = [
  { itemId: 'ITM-004945', itemName: 'A591-K', iposCode: 'A591-K', unitBase: 'PCS' },
  { itemId: 'ITM-004916', itemName: '511 BRAVO (25 KG)', iposCode: '', unitBase: 'KG' },
];

function indexOf(list: any[]) {
  const map = new Map<string, any[]>();
  const norm = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, '');
  for (const item of list) {
    for (const key of [item.itemName, item.iposCode]) {
      const k = norm(key);
      if (!k) continue;
      const arr = map.get(k) || [];
      arr.push(item);
      map.set(k, arr);
    }
  }
  return map;
}

beforeAll(async () => {
  process.env.VERCEL = '1';
  process.env.SPREADSHEET_ID = 'test-sheet';
  process.env.GOOGLE_DRIVE_FOLDER_ID = 'test-folder';
  process.env.GOOGLE_DRIVE_PO_FOLDER_ID = 'test-po-folder';
  process.env.TEMPLATE_PR_ID = 'test-pr-template';
  process.env.TEMPLATE_PO_ID = 'test-po-template';
  process.env.JWT_SECRET = 'test-secret-value-that-is-long-enough-1234';
  process.env.NODE_ENV = 'test';
  h = (await import('../server')) as unknown as Helpers;
}, 60000);

describe('resolveWarehouseId', () => {
  it('memetakan nama gudang ke WAREHOUSE_ID', () => {
    expect(h.resolveWarehouseId('GD NAGOYA')).toBe('WH-NAG');
    expect(h.resolveWarehouseId('GUDANG PONCOL')).toBe('WH-PON');
    expect(h.resolveWarehouseId('GD CIRACAS')).toBe('WH-CIR');
  });

  it('menerima singkatan kode gudang', () => {
    expect(h.resolveWarehouseId('NGY')).toBe('WH-NAG');
    expect(h.resolveWarehouseId('PCL')).toBe('WH-PON');
  });

  it('tidak menebak untuk divisi yang tidak dikenal', () => {
    expect(h.resolveWarehouseId('DIVISI LAIN')).toBe('DIVISILAIN');
    expect(h.resolveWarehouseId('')).toBe('');
  });
});

describe('normalizeDateInput', () => {
  it('meloloskan format ISO', () => {
    expect(h.normalizeDateInput('2027-05-31')).toBe('2027-05-31');
  });

  it('mengubah DD/MM/YYYY dan DD-MM-YYYY', () => {
    expect(h.normalizeDateInput('31/05/2027')).toBe('2027-05-31');
    expect(h.normalizeDateInput('1-6-2027')).toBe('2027-06-01');
  });

  it('mengembalikan string kosong untuk input kosong', () => {
    expect(h.normalizeDateInput('')).toBe('');
    expect(h.normalizeDateInput(null)).toBe('');
  });
});

describe('isValidIsoDate', () => {
  it('menerima tanggal nyata', () => {
    expect(h.isValidIsoDate('2027-05-31')).toBe(true);
    expect(h.isValidIsoDate('2028-02-29')).toBe(true);
  });

  it('menolak tanggal yang tidak ada', () => {
    expect(h.isValidIsoDate('2027-02-30')).toBe(false);
    expect(h.isValidIsoDate('2027-13-01')).toBe(false);
    expect(h.isValidIsoDate('2027-5-31')).toBe(false);
    expect(h.isValidIsoDate('31/05/2027')).toBe(false);
  });
});

describe('matchWmsItem', () => {
  const index = indexOf(items);

  it('cocok lewat ITEM_ID', () => {
    expect(h.matchWmsItem('ITM-004945', items, index).confidence).toBe('ID');
  });

  it('cocok lewat kode iPOSS', () => {
    const out = h.matchWmsItem('A591-K', items, index);
    expect(out.item?.itemId).toBe('ITM-004945');
    expect(['ID', 'IPOS_CODE', 'EXACT_NAME']).toContain(out.confidence);
  });

  it('cocok lewat nama walau beda spasi & tanda baca', () => {
    const out = h.matchWmsItem('511  bravo (25 kg)', items, index);
    expect(out.item?.itemId).toBe('ITM-004916');
  });

  it('tidak cocok untuk nama yang tidak ada', () => {
    expect(h.matchWmsItem('BARANG ANTah', items, index).confidence).toBe('NONE');
  });

  it('mengembalikan NONE untuk input kosong', () => {
    expect(h.matchWmsItem('', items, index).confidence).toBe('NONE');
  });
});

describe('buildAllowedUnits', () => {
  const item = items[0];

  it('satuan dasar selalu faktor 1', () => {
    const out = h.buildAllowedUnits(item, []);
    expect(out).toEqual([{ unit: 'PCS', toUnitQty: 1, isBase: true }]);
  });

  it('menambahkan konversi DUS = 20 PCS', () => {
    const out = h.buildAllowedUnits(item, [
      { fromUnit: 'DUS', toUnit: 'PCS', toUnitQty: 20 },
    ]);
    expect(out).toHaveLength(2);
    expect(out[1]).toEqual({ unit: 'DUS', toUnitQty: 20, isBase: false });
  });

  it('tidak menduplikasi satuan dasar', () => {
    const out = h.buildAllowedUnits(item, [
      { fromUnit: 'PCS', toUnit: 'PCS', toUnitQty: 1 },
      { fromUnit: 'DUS', toUnit: 'PCS', toUnitQty: 20 },
    ]);
    expect(out.map((u) => u.unit)).toEqual(['PCS', 'DUS']);
  });

  it('mengembalikan kosong bila item tidak dikenal', () => {
    expect(h.buildAllowedUnits(null, [])).toEqual([]);
  });

  it('melewati konversi tanpa qty', () => {
    const out = h.buildAllowedUnits(item, [
      { fromUnit: 'SAK', toUnit: 'PCS', toUnitQty: 0 },
    ]);
    expect(out.map((u) => u.unit)).toEqual(['PCS']);
  });
});
