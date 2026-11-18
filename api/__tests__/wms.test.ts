import { beforeAll, describe, expect, it } from 'vitest';

// Menguji pemetaan data WMS. Logika ini yang menentukan apakah 8.789 baris
// ITEM_MASTER terbaca benar — terutama konversi satuan dan flag expired.
type WmsHelpers = {
  rowsToObjects: (rows: any[][]) => Record<string, string>[];
  mapWmsItem: (row: Record<string, string>) => {
    itemId: string;
    itemName: string;
    category: string;
    supplier: string;
    unitBase: string;
    buyUnitDefault: string;
    iposCode: string;
    trackExpiry: boolean;
    shelfLifeDays: number;
    isActive: boolean;
  };
};

let wms: WmsHelpers;

beforeAll(async () => {
  process.env.VERCEL = '1';
  process.env.SPREADSHEET_ID = 'test-sheet';
  process.env.GOOGLE_DRIVE_FOLDER_ID = 'test-folder';
  process.env.GOOGLE_DRIVE_PO_FOLDER_ID = 'test-po-folder';
  process.env.TEMPLATE_PR_ID = 'test-pr-template';
  process.env.TEMPLATE_PO_ID = 'test-po-template';
  process.env.JWT_SECRET = 'test-secret-value-that-is-long-enough-1234';
  process.env.NODE_ENV = 'test';
  wms = (await import('../server')) as unknown as WmsHelpers;
}, 60000);

describe('WMS rowsToObjects', () => {
  it('memetakan header baris pertama ke setiap baris data', () => {
    const rows = [
      ['ITEM_ID', 'ITEM_NAME', 'UNIT_BASE'],
      ['ITM-000001', 'A591-K', 'PCS'],
      ['ITM-000002', 'BEAUTY CAT 20KG', 'SAK'],
    ];
    expect(wms.rowsToObjects(rows)).toEqual([
      { ITEM_ID: 'ITM-000001', ITEM_NAME: 'A591-K', UNIT_BASE: 'PCS' },
      { ITEM_ID: 'ITM-000002', ITEM_NAME: 'BEAUTY CAT 20KG', UNIT_BASE: 'SAK' },
    ]);
  });

  it('tahan terhadap sel kosong dan baris tanpa data', () => {
    const rows = [
      ['ITEM_ID', 'ITEM_NAME', 'SUPPLIER'],
      ['ITM-000003', 'BR2 (1 KG)', ''],
      [],
    ];
    const result = wms.rowsToObjects(rows);
    // Baris kosong (sisa grid Google Sheets) harus dibuang, bukan jadi objek kosong.
    expect(result).toHaveLength(1);
    expect(result[0].SUPPLIER).toBe('');
  });

  it('mengembalikan array kosong bila tidak ada baris', () => {
    expect(wms.rowsToObjects([])).toEqual([]);
  });
});

describe('WMS mapWmsItem', () => {
  it('membaca item A591-K dengan konversi DUS ke PCS', () => {
    const item = wms.mapWmsItem({
      ITEM_ID: 'ITM-004945',
      ITEM_NAME: 'A591-K',
      CATEGORY: 'PAKAN AYAM HOBI',
      SUPPLIER: 'CHAROEN POKPHAND',
      UNIT_BASE: 'PCS',
      BUY_UNIT_DEFAULT: 'DUS',
      IPOS_CODE: 'A591-K',
      TRACK_EXPIRY: 'Y',
      SHELF_LIFE_DAYS: '365',
      IS_ACTIVE: 'Y',
    });
    expect(item.itemId).toBe('ITM-004945');
    expect(item.unitBase).toBe('PCS');
    expect(item.buyUnitDefault).toBe('DUS');
    expect(item.trackExpiry).toBe(true);
    expect(item.shelfLifeDays).toBe(365);
    expect(item.isActive).toBe(true);
  });

  it('default aman bila kolom kosong', () => {
    const item = wms.mapWmsItem({ ITEM_ID: 'ITM-000001', ITEM_NAME: 'X' });
    expect(item.unitBase).toBe('PCS');
    expect(item.buyUnitDefault).toBe('PCS');
    expect(item.trackExpiry).toBe(false);
    expect(item.isActive).toBe(true);
    expect(item.shelfLifeDays).toBe(0);
  });

  it('menandai item nonaktif (Discontinue di iPOSS)', () => {
    const item = wms.mapWmsItem({
      ITEM_ID: 'ITM-000001',
      ITEM_NAME: 'X',
      IS_ACTIVE: 'N',
      TRACK_EXPIRY: 'N',
    });
    expect(item.isActive).toBe(false);
    expect(item.trackExpiry).toBe(false);
  });
});
