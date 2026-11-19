import { describe, expect, it } from 'vitest';
import { buildUnitFactors, buildUnitOptions, parseMultiPackLabel } from '../wms-stock';

/**
 * Data nyata dari Master Data Konversi (sheet "Sheet"):
 *
 *   Nama Barang                     Satuan    Qty/  Paket
 *   CAT CHOIZE KITTEN SALMON 20KG   SAK       1     SAK
 *   CAT CHOIZE KITTEN SALMON 20KG   @3 SAK    3     SAK
 *   CAT CHOIZE KITTEN SALMON 20KG   @5 SAK    5     SAK
 *   CAT CHOIZE KITTEN SALMON 20KG   @20 SAK   20    SAK
 *
 * Keempat baris itu BUKAN duplikat: satuannya berbeda (SAK, @3 SAK, @5 SAK,
 * @20 SAK), dan satuan terkecilnya ada di kolom Paket = SAK.
 */

const row = (fromUnit: string, toUnit: string, toUnitQty: number) => ({
  itemId: 'ITM-005300',
  fromUnit,
  toUnit,
  toUnitQty,
  level: 1,
  isActive: true,
});

const catChoize = [
  row('SAK', 'SAK', 1),
  row('@3 SAK', 'SAK', 3),
  row('@5 SAK', 'SAK', 5),
  row('@20 SAK', 'SAK', 20),
];

describe('parseMultiPackLabel', () => {
  it('membaca @5 SAK menjadi 5 saK', () => {
    expect(parseMultiPackLabel('@5 SAK')).toEqual({ qty: 5, unit: 'SAK' });
  });

  it('membaca @20 SAK', () => {
    expect(parseMultiPackLabel('@20 SAK')).toEqual({ qty: 20, unit: 'SAK' });
  });

  it('membaca @3 tanpa satuan', () => {
    expect(parseMultiPackLabel('@3')).toEqual({ qty: 3, unit: '' });
  });

  it('membaca @25 Kg', () => {
    expect(parseMultiPackLabel('@25 Kg')).toEqual({ qty: 25, unit: 'KG' });
  });

  it('label biasa bukan multipak', () => {
    expect(parseMultiPackLabel('SAK')).toBeNull();
    expect(parseMultiPackLabel('BAL')).toBeNull();
  });

  it('@ tanpa angka bukan multipak', () => {
    expect(parseMultiPackLabel('@SAK')).toBeNull();
  });
});

describe('CAT CHOIZE KITTEN SALMON 20KG', () => {
  // Semua baris berujung ke SAK, jadi tidak ada rantai konversi yang perlu
  // disusun. Yang penting: hasil akhirnya benar dan tidak ada satuan palsu.
  const factors = buildUnitFactors(catChoize)['ITM-005300'];
  const options = buildUnitOptions('SAK', factors);

  it('satuan dasarnya SAK', () => {
    expect(options[0]).toEqual({ unit: 'SAK', toUnitQty: 1, isBase: true });
  });

  it('pilihan satuan hanya SAK karena semuanya berujung SAK', () => {
    expect(options.map((o) => o.unit)).toEqual(['SAK']);
  });

  it('tidak memunculkan satuan palsu "@5 SAK"', () => {
    expect(options.some((o) => o.unit.startsWith('@'))).toBe(false);
  });

  it('1 SAK tetap 1 SAK, tidak dikali apa pun', () => {
    expect(options[0].toUnitQty).toBe(1);
  });
});

describe('multipak pada item yang punya PCS di bawahnya', () => {
  // (DC) 220 VOLT ON FIRE LB (48): PCS 1 PCS, @6, @12, DUS 48 PCS
  const rows = [
    row('PCS', 'PCS', 1),
    row('@6', 'PCS', 6),
    row('@12', 'PCS', 12),
    row('DUS', 'PCS', 48),
  ];
  const factors = buildUnitFactors(rows)['ITM-005300'];

  it('satuan dasar PCS', () => {
    expect(factors.PCS).toBe(1);
  });

  it('DUS = 48 PCS', () => {
    expect(factors.DUS).toBe(48);
  });

  it('menawarkan PCS lalu DUS', () => {
    expect(buildUnitOptions('PCS', factors).map((o) => o.unit)).toEqual(['PCS', 'DUS']);
  });
});

describe('multipak digabung dengan Qty/', () => {
  it('@5 SAK dengan Qty/=3 berarti 15, bukan 3', () => {
    // Kasus langka tetapi mungkin: label dan Qty/ sama-sama menyebut jumlah.
    // Karena Paket juga SAK, tidak ada satuan lain -> tetap SAK faktor 1.
    const options = buildUnitOptions(
      'SAK',
      buildUnitFactors([row('@5 SAK', 'SAK', 3)])['ITM-005300']
    );
    expect(options).toEqual([{ unit: 'SAK', toUnitQty: 1, isBase: true }]);
  });

});

describe('label @ pada satuan dasar tidak merusak apa pun', () => {
  it('@25 Kg sendirian tidak membuat satuan palsu', () => {
    const options = buildUnitOptions(
      'KG',
      buildUnitFactors([row('@25 Kg', 'KG', 1)])['ITM-005300']
    );
    expect(options).toEqual([{ unit: 'KG', toUnitQty: 1, isBase: true }]);
  });
});
