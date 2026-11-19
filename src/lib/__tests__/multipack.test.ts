import { describe, expect, it } from 'vitest';
import {
  breakdownBaseQty,
  buildUnitFactors,
  buildUnitOptions,
  parseMultiPackLabel,
} from '../wms-stock';

/**
 * Data nyata dari Master Data Konversi.xlsx, sheet "Sheet".
 *
 * ATURAN TUNGGAL:  1 [Satuan] = [Qty/] [Paket]
 *
 * Kolom Qty/ SUDAH berisi jumlah satuan tujuan per satu satuan transaksi.
 * Jangan dikalikan lagi dengan angka pada label '@N' — itu bug lama yang
 * membuat '@5 PAK' dihitung 25 dan seluruh konversi item hilang.
 *
 * Label '@N' adalah satuan transaksi tersendiri (dipakai iPOSS), jadi harus
 * tetap muncul sebagai pilihan saat menerima barang.
 */

const row = (fromUnit: string, toUnit: string, toUnitQty: number) => ({
  itemId: 'ITM-005300',
  fromUnit,
  toUnit,
  toUnitQty,
  level: 1,
  isActive: true,
});

/**
 * CAT CHOIZE KITTEN SALMON 20KG
 *   SAK      1    SAK
 *   @3 SAK   3    SAK
 *   @5 SAK   5    SAK
 *   @20 SAK  20   SAK
 *
 * Keempat baris BUKAN duplikat: satuannya berbeda. Satuan terkecil SAK.
 */
const catChoize = [
  row('SAK', 'SAK', 1),
  row('@3 SAK', 'SAK', 3),
  row('@5 SAK', 'SAK', 5),
  row('@20 SAK', 'SAK', 20),
];

/** (DC) 220 VOLT ON FIRE LB (48): PCS 1 PCS, @6, @12, DUS 48 PCS */
const volt220 = [
  row('PCS', 'PCS', 1),
  row('@6', 'PCS', 6),
  row('@12', 'PCS', 12),
  row('DUS', 'PCS', 48),
];

/** (DC) CCKITTEN 20KG (@1 KG): PCS 1, @5, SAK 20, @3 SAK 60, @5 SAK 100 */
const cckitten = [
  row('PCS', 'PCS', 1),
  row('@5', 'PCS', 5),
  row('@10', 'PCS', 10),
  row('SAK', 'PCS', 20),
  row('@3 SAK', 'PCS', 60),
  row('@5 SAK', 'PCS', 100),
];

describe('parseMultiPackLabel', () => {
  it('membaca angka dan satuan', () => {
    expect(parseMultiPackLabel('@5 SAK')).toEqual({ qty: 5, unit: 'SAK' });
    expect(parseMultiPackLabel('@20 SAK')).toEqual({ qty: 20, unit: 'SAK' });
    expect(parseMultiPackLabel('@3')).toEqual({ qty: 3, unit: '' });
    expect(parseMultiPackLabel('@25 Kg')).toEqual({ qty: 25, unit: 'KG' });
  });

  it('membaca angka desimal (mis. timah @0.5 Kg)', () => {
    expect(parseMultiPackLabel('@0.5 Kg')).toEqual({ qty: 0.5, unit: 'KG' });
    expect(parseMultiPackLabel('@0,5 Kg')).toEqual({ qty: 0.5, unit: 'KG' });
  });

  it('label biasa dan @ tanpa angka bukan multipak', () => {
    expect(parseMultiPackLabel('SAK')).toBeNull();
    expect(parseMultiPackLabel('BAL')).toBeNull();
    expect(parseMultiPackLabel('@SAK')).toBeNull();
  });
});

describe('CAT CHOIZE KITTEN SALMON 20KG', () => {
  const factors = buildUnitFactors(catChoize)['ITM-005300'];
  const options = buildUnitOptions('SAK', factors);

  it('satuan dasar SAK, faktor 1', () => {
    expect(factors.SAK).toBe(1);
  });

  it('faktor multipak = Qty/ apa adanya, BUKAN Qty/ x N', () => {
    expect(factors['@3 SAK']).toBe(3);
    expect(factors['@5 SAK']).toBe(5);
    expect(factors['@20 SAK']).toBe(20);
  });

  it('varian multipak muncul sebagai pilihan satuan', () => {
    expect(options.map((o) => o.unit)).toEqual(['SAK', '@3 SAK', '@5 SAK', '@20 SAK']);
  });

  it('1 SAK tetap 1 SAK', () => {
    expect(options[0]).toEqual({ unit: 'SAK', toUnitQty: 1, isBase: true });
  });
});

describe('multipak pada item yang punya PCS di bawahnya', () => {
  const factors = buildUnitFactors(volt220)['ITM-005300'];

  it('DUS = 48 PCS walau label @12 juga ada', () => {
    expect(factors.PCS).toBe(1);
    expect(factors.DUS).toBe(48);
  });

  it('@6 dan @12 jadi satuan tersendiri dengan faktor 6 dan 12', () => {
    expect(factors['@6']).toBe(6);
    expect(factors['@12']).toBe(12);
  });

  it('urutan pilihan: satuan dasar, lalu multipak, lalu DUS', () => {
    expect(buildUnitOptions('PCS', factors).map((o) => o.unit)).toEqual([
      'PCS',
      '@6',
      '@12',
      'DUS',
    ]);
  });
});

describe('multipak bertingkat (SAK di atas PCS)', () => {
  const factors = buildUnitFactors(cckitten)['ITM-005300'];

  it('SAK = 20 PCS', () => {
    expect(factors.SAK).toBe(20);
  });

  it('@3 SAK = 60 PCS dan @5 SAK = 100 PCS', () => {
    expect(factors['@3 SAK']).toBe(60);
    expect(factors['@5 SAK']).toBe(100);
  });

  it('@5 telanjang = 5 PCS', () => {
    expect(factors['@5']).toBe(5);
  });

  it('semua pilihan berurutan menurut faktor', () => {
    expect(buildUnitOptions('PCS', factors).map((o) => o.toUnitQty)).toEqual([1, 5, 10, 20, 60, 100]);
  });
});

describe('paket berlabel: @25 Kg | 1 | @25 Kg', () => {
  // Satu-satunya baris item seperti 201M (25 KG), BURAS BMS (25 KG).
  const rows = [{ ...row('@25 Kg', '@25 Kg', 1), itemId: 'ITM-000201' }];

  it('1 @25 Kg = 25 KG, bukan hilang', () => {
    const factors = buildUnitFactors(rows)['ITM-000201'];
    expect(factors.KG).toBe(1);
    expect(factors['@25 KG']).toBe(25);
  });

  it('KG tetap bisa dipilih, @25 KG jadi pilihan kedua', () => {
    const factors = buildUnitFactors(rows)['ITM-000201'];
    expect(buildUnitOptions('KG', factors).map((o) => o.unit)).toEqual(['KG', '@25 KG']);
  });
});

describe('(DC) PAKAN MERAK: @1 Kg dan @25 Kg dengan Paket @1 Kg', () => {
  //   @1 Kg    1   @1 Kg
  //   @25 Kg   25  @1 Kg
  const rows = [
    { ...row('@1 Kg', '@1 Kg', 1), itemId: 'ITM-000901' },
    { ...row('@25 Kg', '@1 Kg', 25), itemId: 'ITM-000901' },
  ];

  it('faktor dihitung dari Qty/ x ukuran paket', () => {
    const factors = buildUnitFactors(rows)['ITM-000901'];
    expect(factors.KG).toBe(1);
    expect(factors['@25 KG']).toBe(25);
  });
});

describe('item tanpa relasi nyata', () => {
  it('relasi 1:1 saja tidak menghasilkan faktor', () => {
    expect(buildUnitFactors([row('BAL', 'BAL', 1)])['ITM-005300']).toEqual({});
  });

  it('pilihan tetap berisi satuan dasar dari ITEM_MASTER', () => {
    const options = buildUnitOptions('BAL', buildUnitFactors([row('BAL', 'BAL', 1)])['ITM-005300']);
    expect(options).toEqual([{ unit: 'BAL', toUnitQty: 1, isBase: true }]);
  });

  it('konversi nonaktif diabaikan', () => {
    const rows = [{ ...row('@5 SAK', 'SAK', 5), isActive: false }];
    expect(buildUnitFactors(rows)).toEqual({});
  });
});

describe('pecahan saldo stok tidak memakai label multipak', () => {
  it('3 @5 SAK + 2 SAK tetap ditampilkan sebagai satuan fisik', () => {
    const factors = buildUnitFactors(catChoize)['ITM-005300'];
    // 17 SAK tidak boleh tampil sebagai "3 @5 SAK + 2 SAK".
    const parts = breakdownBaseQty(17, factors, 'SAK');
    expect(parts.some((part) => part.unit.startsWith('@'))).toBe(false);
    expect(parts).toEqual([{ unit: 'SAK', qty: 17 }]);
  });
});
