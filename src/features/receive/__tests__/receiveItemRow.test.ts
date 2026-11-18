import { describe, expect, it } from 'vitest';
import { qtyBaseOf, unitFactor } from '../ReceiveItemRow';
import type { ReceiveItem } from '../../../lib/types';

const wms = {
  matched: true,
  confidence: 'EXACT_NAME' as const,
  itemId: 'ITM-004945',
  itemName: 'A591-K',
  unitBase: 'PCS',
  buyUnitDefault: 'DUS',
  trackExpiry: true,
  shelfLifeDays: 365,
  allowedUnits: [
    { unit: 'PCS', toUnitQty: 1, isBase: true },
    { unit: 'DUS', toUnitQty: 20, isBase: false },
  ],
};

const base: ReceiveItem = {
  podId: 'POD-1',
  itemName: 'A591-K',
  unit: 'PCS',
  qty: 100,
  qtyTerima: 3,
  wms,
  unitTerima: 'DUS',
};

describe('unitFactor', () => {
  it('memakai faktor konversi satuan terpilih', () => {
    expect(unitFactor(base)).toBe(20);
  });

  it('satuan dasar selalu faktor 1', () => {
    expect(unitFactor({ ...base, unitTerima: 'PCS' })).toBe(1);
  });

  it('tanpa info WMS tidak mengubah angka', () => {
    expect(unitFactor({ ...base, wms: null })).toBe(1);
  });

  it('satuan tak dikenal tidak mengubah angka', () => {
    expect(unitFactor({ ...base, unitTerima: 'SAK' })).toBe(1);
  });
});

describe('qtyBaseOf', () => {
  it('3 DUS = 60 PCS', () => {
    expect(qtyBaseOf(base)).toBe(60);
  });

  it('5 PCS tetap 5 PCS', () => {
    expect(qtyBaseOf({ ...base, unitTerima: 'PCS', qtyTerima: 5 })).toBe(5);
  });

  it('qty kosong dihitung 0', () => {
    expect(qtyBaseOf({ ...base, qtyTerima: '' })).toBe(0);
  });

  it('qty bukan angka dihitung 0', () => {
    expect(qtyBaseOf({ ...base, qtyTerima: 'abc' })).toBe(0);
  });

  it('mendukung qty desimal', () => {
    expect(qtyBaseOf({ ...base, unitTerima: 'DUS', qtyTerima: 1.5 })).toBe(30);
  });
});
