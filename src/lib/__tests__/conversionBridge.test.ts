import { describe, expect, it } from 'vitest';
import { bridgeConversionsToItems, buildUnitFactors, normalizeNameKey } from '../wms-stock';

/**
 * Master data nyata:
 *   UNIT_CONVERSION.ITEM_ID = SPS000023 (kode iPOSS)
 *   ITEM_MASTER.ITEM_ID     = ITM-000001
 *   ITEM_MASTER.IPOS_CODE   = kosong di SELURUH 8.789 baris
 *
 * Tanpa jembatan lewat nama, 0 dari 2.634 item punya konversi.
 */

const items = [
  { itemId: 'ITM-005230', itemName: 'BR11 CP (50 KG)' },
  { itemId: 'ITM-004945', itemName: '511 BRAVO (25 KG)' },
  { itemId: 'ITM-000100', itemName: 'A591-K' },
];

describe('normalizeNameKey', () => {
  it('membuang spasi dan tanda baca', () => {
    expect(normalizeNameKey('511 BRAVO (25 KG)')).toBe('511BRAVO25KG');
  });

  it('tidak peka huruf besar', () => {
    expect(normalizeNameKey('br11 cp')).toBe(normalizeNameKey('BR11 CP'));
  });

  it('string kosong tetap kosong', () => {
    expect(normalizeNameKey('')).toBe('');
    expect(normalizeNameKey(null)).toBe('');
  });
});

describe('bridgeConversionsToItems', () => {
  it('menjembatani kode SPS ke ITEM_ID lewat nama', () => {
    const { byItem, stats } = bridgeConversionsToItems(
      [{
        itemId: 'SPS005230',
        itemName: 'BR11 CP (50 KG)',
        fromUnit: 'BAL',
        toUnit: 'BAL',
        toUnitQty: 1,
        level: 1,
      }],
      items
    );
    expect(byItem.has('ITM-005230')).toBe(true);
    expect(stats.bridged).toBe(1);
    expect(stats.unresolved).toBe(0);
  });

  it('kode yang sudah ITM dipakai langsung tanpa jembatan', () => {
    const { byItem, stats } = bridgeConversionsToItems(
      [{ itemId: 'ITM-004945', itemName: 'Nama apa saja', fromUnit: 'DUS', toUnit: 'PCS', toUnitQty: 20 }],
      items
    );
    expect(stats.direct).toBe(1);
    expect(stats.bridged).toBe(0);
    expect(byItem.get('ITM-004945')?.[0].toUnitQty).toBe(20);
  });

  it('mencocokkan walau spasi dan tanda baca berbeda', () => {
    const { byItem } = bridgeConversionsToItems(
      [{ itemId: 'SPS000999', itemName: '511  bravo 25kg', fromUnit: 'DUS', toUnit: 'PCS', toUnitQty: 20 }],
      items
    );
    expect(byItem.has('ITM-004945')).toBe(true);
  });

  it('nama yang dipakai dua item dibuang, bukan ditebak', () => {
    const duplikat = [
      ...items,
      { itemId: 'ITM-999999', itemName: 'A591-K' },
    ];
    const { byItem, stats } = bridgeConversionsToItems(
      [{ itemId: 'SPS000100', itemName: 'A591-K', fromUnit: 'DUS', toUnit: 'PCS', toUnitQty: 20 }],
      duplikat
    );
    expect(byItem.size).toBe(0);
    expect(stats.unresolved).toBe(1);
  });

  it('nama yang tidak ada di master dihitung unresolved', () => {
    const { stats } = bridgeConversionsToItems(
      [{ itemId: 'SPS000777', itemName: 'BARANG HILANG', fromUnit: 'DUS', toUnit: 'PCS', toUnitQty: 20 }],
      items
    );
    expect(stats.unresolved).toBe(1);
  });

  it('baris tanpa ITEM_ID dilewati', () => {
    const { byItem } = bridgeConversionsToItems(
      [{ itemId: '', itemName: 'BR11 CP (50 KG)', fromUnit: 'BAL', toUnit: 'KG', toUnitQty: 50 }],
      items
    );
    expect(byItem.size).toBe(0);
  });

  it('IS_ACTIVE=N terbaca sebagai nonaktif', () => {
    const { byItem } = bridgeConversionsToItems(
      [{ itemId: 'ITM-004945', itemName: 'x', fromUnit: 'DUS', toUnit: 'PCS', toUnitQty: 20, isActive: 'N' }],
      items
    );
    expect(byItem.get('ITM-004945')?.[0].isActive).toBe(false);
  });

  it('IS_ACTIVE kosong dianggap aktif', () => {
    const { byItem } = bridgeConversionsToItems(
      [{ itemId: 'ITM-004945', itemName: 'x', fromUnit: 'DUS', toUnit: 'PCS', toUnitQty: 20 }],
      items
    );
    expect(byItem.get('ITM-004945')?.[0].isActive).toBe(true);
  });
});

describe('rantai penuh: konversi mentah -> faktor', () => {
  it('BR11 CP (50 KG) tetap BAL tanpa konversi palsu', () => {
    const { byItem } = bridgeConversionsToItems(
      [{ itemId: 'SPS005230', itemName: 'BR11 CP (50 KG)', fromUnit: 'BAL', toUnit: 'BAL', toUnitQty: 1 }],
      items
    );
    const factors = buildUnitFactors(byItem.get('ITM-005230') || []);
    // Relasi BAL->BAL diabaikan; tidak ada faktor lain, jadi tidak ada entri.
    expect(factors['ITM-005230']).toBeUndefined();
  });

  it('GALAC ZOO: BAL=50 KG terbentuk dari data nyata', () => {
    const { byItem } = bridgeConversionsToItems(
      [
        { itemId: 'SPS005678', itemName: 'GALAC ZOO', fromUnit: 'BAL', toUnit: 'KG', toUnitQty: 50, level: 2 },
        { itemId: 'SPS005678', itemName: 'GALAC ZOO', fromUnit: 'SAK', toUnit: 'KG', toUnitQty: 50, level: 3 },
      ],
      [{ itemId: 'ITM-009900', itemName: 'GALAC ZOO' }]
    );
    const factors = buildUnitFactors(byItem.get('ITM-009900') || []);
    expect(factors['ITM-009900'].KG).toBe(1);
    expect(factors['ITM-009900'].BAL).toBe(50);
    expect(factors['ITM-009900'].SAK).toBe(50);
  });
});
