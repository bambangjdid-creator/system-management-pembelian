import { beforeAll, describe, expect, it } from 'vitest';

// Menguji parsing CSV saldo awal. Ini titik paling rawan: satu kolom salah
// baca berarti ribuan baris stok masuk ke gudang yang salah.
type Helpers = {
  parseOpeningCsv: (csv: string) => {
    rows: any[];
    unknownHeaders: string[];
    missing: string[];
  };
};

let h: Helpers;

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

describe('parseOpeningCsv', () => {
  it('membaca header standar', () => {
    const out = h.parseOpeningCsv('ITEM_ID,QTY\nITM-004916,29\nITM-004945,20');
    expect(out.missing).toEqual([]);
    expect(out.rows).toHaveLength(2);
    expect(out.rows[0]).toEqual({ itemId: 'ITM-004916', qty: '29' });
  });

  it('menerima alias header bahasa Indonesia', () => {
    const out = h.parseOpeningCsv('KODE BARANG;NAMA BARANG;STOK;SATUAN\nITM-1;A591-K;20;DUS');
    expect(out.missing).toEqual([]);
    expect(out.rows[0]).toMatchObject({ itemId: 'ITM-1', itemName: 'A591-K', qty: '20', unit: 'DUS' });
  });

  it('menandai kolom wajib yang hilang', () => {
    const out = h.parseOpeningCsv('ITEM_NAME,UNIT\nA591-K,PCS');
    expect(out.missing).toContain('itemId');
    expect(out.missing).toContain('qty');
  });

  it('melaporkan header tak dikenal tanpa menggagalkan', () => {
    const out = h.parseOpeningCsv(["ITEM_ID,QTY,WARNA", "ITM-1,5,MERAH"].join("\n"));
    expect(out.unknownHeaders).toEqual(['WARNA']);
    expect(out.rows[0]).toMatchObject({ itemId: 'ITM-1', qty: '5' });
  });

  it('menangani nama barang berkoma di dalam tanda kutip', () => {
    const out = h.parseOpeningCsv('ITEM_ID,ITEM_NAME,QTY\nITM-1,"BOLT CAT 20KG, TUNA",7');
    expect(out.rows[0].itemName).toBe('BOLT CAT 20KG, TUNA');
    expect(out.rows[0].qty).toBe('7');
  });

  it('membuang baris kosong dan BOM', () => {
    const out = h.parseOpeningCsv('\uFEFFITEM_ID,QTY\n\nITM-1,5\n\n');
    expect(out.rows).toHaveLength(1);
  });

  it('mengembalikan penanda FILE_KOSONG bila hanya header', () => {
    const out = h.parseOpeningCsv('ITEM_ID,QTY\n');
    expect(out.missing).toContain('FILE_KOSONG');
  });
});

// ---------------------------------------------------------------------------
// Resolusi baris: ini bagian yang menentukan 29 "@25 Kg" jadi 725 KG atau tidak.
// ---------------------------------------------------------------------------
type Resolver = {
  resolveOpeningRows: (
    input: any[],
    items: any[],
    warehouses: any[],
    defaultWarehouseId: string
  ) => any[];
  setOpeningConversionLookup: (lookup: Map<string, any[]>) => void;
};

const items = [
  {
    itemId: 'ITM-004945',
    itemName: 'A591-K',
    category: 'PAKAN AYAM HOBI',
    supplier: 'CHAROEN POKPHAND',
    unitBase: 'PCS',
    buyUnitDefault: 'DUS',
    iposCode: 'A591-K',
    trackExpiry: true,
    shelfLifeDays: 365,
    isActive: true,
  },
  {
    itemId: 'ITM-004916',
    itemName: '511 BRAVO (25 KG)',
    category: 'PAKAN AYAM REPACK',
    supplier: 'CHAROEN POKPHAND',
    unitBase: 'KG',
    buyUnitDefault: 'KEMASAN',
    iposCode: '',
    trackExpiry: true,
    shelfLifeDays: 365,
    isActive: true,
  },
];

const warehouses = [
  { warehouseId: 'WH-NAG', warehouseName: 'GUDANG NAGOYA' },
  { warehouseId: 'WH-CIR', warehouseName: 'GUDANG CIRACAS' },
];

describe('resolveOpeningRows', () => {
  let r: Resolver;

  beforeAll(async () => {
    r = (await import('../server')) as unknown as Resolver;
    r.setOpeningConversionLookup(
      new Map([
        ['ITM-004945', [{ fromUnit: 'DUS', toUnit: 'PCS', toUnitQty: 20 }]],
        ['ITM-004916', [{ fromUnit: 'KEMASAN', toUnit: 'KG', toUnitQty: 25 }]],
      ])
    );
  });

  it('mengkonversi DUS ke PCS (1 DUS = 20 PCS)', () => {
    const out = r.resolveOpeningRows(
      [{ itemId: 'ITM-004945', qty: '20', unit: 'DUS' }],
      items,
      warehouses,
      'WH-NAG'
    );
    expect(out[0].status).toBe('OK');
    expect(out[0].toUnitQty).toBe(20);
    expect(out[0].qtyBase).toBe(400);
  });

  it('mengkonversi kemasan 25 KG menjadi 725 KG untuk 29 kemasan', () => {
    const out = r.resolveOpeningRows(
      [{ itemId: 'ITM-004916', qty: '29', unit: 'KEMASAN' }],
      items,
      warehouses,
      'WH-NAG'
    );
    expect(out[0].status).toBe('OK');
    expect(out[0].qtyBase).toBe(725);
  });

  it('memakai satuan dasar bila kolom satuan kosong (dengan peringatan)', () => {
    const out = r.resolveOpeningRows(
      [{ itemId: 'ITM-004916', qty: '10' }],
      items,
      warehouses,
      'WH-NAG'
    );
    expect(out[0].status).toBe('WARNING');
    expect(out[0].qtyBase).toBe(10);
  });

  it('menolak satuan yang tidak punya konversi', () => {
    const out = r.resolveOpeningRows(
      [{ itemId: 'ITM-004945', qty: '5', unit: 'SAK' }],
      items,
      warehouses,
      'WH-NAG'
    );
    expect(out[0].status).toBe('ERROR');
    expect(out[0].messages.join(' ')).toMatch(/tidak punya konversi/);
  });

  it('mencocokkan item lewat nama bila ITEM_ID kosong', () => {
    const out = r.resolveOpeningRows(
      [{ itemName: 'a591-k', qty: '3', unit: 'DUS' }],
      items,
      warehouses,
      'WH-NAG'
    );
    expect(out[0].itemId).toBe('ITM-004945');
    expect(out[0].qtyBase).toBe(60);
  });

  it('menolak gudang yang tidak dikenal', () => {
    const out = r.resolveOpeningRows(
      [{ itemId: 'ITM-004945', qty: '1', unit: 'DUS', warehouse: 'WH-XXX' }],
      items,
      warehouses,
      'WH-NAG'
    );
    expect(out[0].status).toBe('ERROR');
    expect(out[0].messages.join(' ')).toMatch(/tidak dikenal/);
  });

  it('menerima nama gudang selain kode', () => {
    const out = r.resolveOpeningRows(
      [{ itemId: 'ITM-004945', qty: '1', unit: 'DUS', warehouse: 'GUDANG CIRACAS' }],
      items,
      warehouses,
      'WH-NAG'
    );
    expect(out[0].warehouseId).toBe('WH-CIR');
    expect(out[0].status).toBe('OK');
  });

  it('menolak item yang tidak ada', () => {
    const out = r.resolveOpeningRows(
      [{ itemId: 'ITM-999999', qty: '5' }],
      items,
      warehouses,
      'WH-NAG'
    );
    expect(out[0].status).toBe('ERROR');
    expect(out[0].messages.join(' ')).toMatch(/tidak ditemukan/);
  });

  it('menolak qty negatif pada saldo awal', () => {
    const out = r.resolveOpeningRows(
      [{ itemId: 'ITM-004945', qty: '-5', unit: 'DUS' }],
      items,
      warehouses,
      'WH-NAG'
    );
    expect(out[0].status).toBe('ERROR');
    expect(out[0].messages.join(' ')).toMatch(/negatif/);
  });

  it('baris error tidak menghasilkan qtyBase yang bisa masuk ledger', () => {
    const out = r.resolveOpeningRows(
      [{ itemId: 'ITM-999999', qty: '5' }],
      items,
      warehouses,
      'WH-NAG'
    );
    expect(out[0].qtyBase).toBe(0);
  });
});
