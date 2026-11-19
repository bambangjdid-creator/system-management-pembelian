import { describe, expect, it } from 'vitest';
import { buildUnitOptions, resolveFactors, type ConversionRow } from '../wms-stock';

/**
 * Mengunci aturan master data konversi iPOSS:
 *
 *   Satuan | Qty/ | Paket
 *   BAL    | 1    | BAL   -> BAL satuan terkecil SEKALIGUS satuan transaksi
 *   SAK    | 3    | SAK   -> 1 transaksi SAK = 3 paket SAK
 *   Kg     | 25   | BAL   -> 1 BAL = 25 Kg, Kg lebih kecil dari BAL
 *
 * Inti aturan: satuan dasar TIDAK ditentukan namanya, tapi oleh arah relasi.
 * Satuan yang selalu jadi "Paket" dan tidak pernah jadi "Satuan" adalah
 * satuan terkecil.
 */

const c = (fromUnit: string, toUnit: string, toUnitQty: number, level = 1): ConversionRow => ({
  fromUnit,
  toUnit,
  toUnitQty,
  level,
  isActive: true,
});

describe('BAL sebagai satuan terkecil', () => {
  // BR11 CP (50 KG): iPOSS menulis Satuan=BAL, Qty/=1, Paket=BAL
  const rows = [c('BAL', 'BAL', 1)];

  it('tanpa relasi lain, tidak ada faktor yang bisa disusun', () => {
    expect(resolveFactors(rows)).toEqual({});
  });

  it('satuan dasar tetap BAL, bukan PCS', () => {
    const options = buildUnitOptions('BAL', resolveFactors(rows));
    expect(options.map((o) => o.unit)).toEqual(['BAL']);
  });

  it('faktor BAL adalah 1 karena ia satuan terkecil', () => {
    expect(buildUnitOptions('BAL', resolveFactors(rows))[0].toUnitQty).toBe(1);
  });
});

describe('SAK sebagai satuan terkecil', () => {
  // CANARY SEED TOYS 25 KG: Satuan=SAK, Qty/=1, Paket=SAK
  const rows = [c('SAK', 'SAK', 1)];

  it('tidak menawarkan PCS yang tidak ada di master', () => {
    const options = buildUnitOptions('SAK', resolveFactors(rows));
    expect(options.map((o) => o.unit)).toEqual(['SAK']);
  });
});

describe('BAL dengan KG di bawahnya', () => {
  // GALAC ZOO: Satuan=Kg Qty/=50 Paket=BAL  -> 1 BAL = 50 KG
  const rows = [c('BAL', 'KG', 50, 2)];

  it('KG jadi satuan dasar karena selalu jadi Paket', () => {
    const factors = resolveFactors(rows);
    expect(factors.KG).toBe(1);
    expect(factors.BAL).toBe(50);
  });

  it('menawarkan KG dan BAL, KG lebih dulu', () => {
    const options = buildUnitOptions('KG', resolveFactors(rows));
    expect(options.map((o) => o.unit)).toEqual(['KG', 'BAL']);
  });

  it('satuan dasar ditandai isBase', () => {
    const options = buildUnitOptions('KG', resolveFactors(rows));
    expect(options[0].isBase).toBe(true);
    expect(options[1].isBase).toBe(false);
  });
});

describe('SAK dengan PCS di bawahnya', () => {
  // CCKITTEN 20KG (@1 KG): Satuan=SAK Qty/=20 Paket=PCS
  const rows = [c('SAK', 'PCS', 20, 2)];

  it('SAK = 20 PCS', () => {
    expect(resolveFactors(rows)).toEqual({ PCS: 1, SAK: 20 });
  });

  it('menampilkan SAK sebagai satuan besar', () => {
    const options = buildUnitOptions('PCS', resolveFactors(rows));
    expect(options.find((o) => o.unit === 'SAK')?.toUnitQty).toBe(20);
  });
});

describe('rantai bertingkat', () => {
  const rows = [c('DUS', 'PCS', 20, 1), c('BAL', 'DUS', 12, 2)];

  it('BAL = 240 PCS lewat DUS', () => {
    const factors = resolveFactors(rows);
    expect(factors.BAL).toBe(240);
    expect(factors.DUS).toBe(20);
    expect(factors.PCS).toBe(1);
  });

  it('satuan dasar adalah PCS', () => {
    const options = buildUnitOptions('PCS', resolveFactors(rows));
    expect(options[0].unit).toBe('PCS');
    expect(options[0].isBase).toBe(true);
  });
});

describe('aturan BAL/SAK tidak boleh ditebak dari nama', () => {
  it('BAL bisa jadi satuan terkecil pada satu item...', () => {
    expect(buildUnitOptions('BAL', resolveFactors([c('BAL', 'BAL', 1)]))[0])
      .toMatchObject({ unit: 'BAL', toUnitQty: 1 });
  });

  it('...dan satuan besar pada item lain', () => {
    const options = buildUnitOptions('KG', resolveFactors([c('BAL', 'KG', 50)]));
    expect(options.find((o) => o.unit === 'BAL')?.toUnitQty).toBe(50);
  });

  it('SAK bisa jadi satuan terkecil maupun satuan besar', () => {
    expect(buildUnitOptions('SAK', resolveFactors([c('SAK', 'SAK', 1)])))
      .toEqual([{ unit: 'SAK', toUnitQty: 1, isBase: true }]);
    expect(buildUnitOptions('PCS', resolveFactors([c('SAK', 'PCS', 25)]))
      .find((o) => o.unit === 'SAK')?.toUnitQty).toBe(25);
  });
});

describe('buildUnitOptions', () => {
  it('mengurutkan dari satuan terkecil ke terbesar', () => {
    const options = buildUnitOptions('PCS', { PCS: 1, DUS: 20, BAL: 240 });
    expect(options.map((o) => o.unit)).toEqual(['PCS', 'DUS', 'BAL']);
  });

  it('menaikkan satuan dari PO ke urutan pertama', () => {
    const options = buildUnitOptions('PCS', { PCS: 1, DUS: 20, BAL: 240 }, 'DUS');
    expect(options[0].unit).toBe('DUS');
  });

  it('membuang faktor di bawah 1', () => {
    const options = buildUnitOptions('PCS', { PCS: 1, DUS: 0.5 });
    expect(options.map((o) => o.unit)).toEqual(['PCS']);
  });

  it('tetap menyertakan satuan dasar walau tidak disebut konversi', () => {
    const options = buildUnitOptions('BAL', { DUS: 20 });
    expect(options.some((o) => o.unit === 'BAL' && o.isBase)).toBe(true);
  });

  it('tanpa konversi sama sekali hanya ada satuan dasar', () => {
    expect(buildUnitOptions('SAK', undefined)).toEqual([
      { unit: 'SAK', toUnitQty: 1, isBase: true },
    ]);
  });

  it('tidak menghasilkan satuan ganda', () => {
    const options = buildUnitOptions('PCS', { PCS: 1, DUS: 20 });
    expect(new Set(options.map((o) => o.unit)).size).toBe(options.length);
  });
});

describe('data rusak tidak merusak perhitungan', () => {
  it('konversi nonaktif diabaikan', () => {
    const rows = [{ ...c('DUS', 'PCS', 20), isActive: false }];
    expect(resolveFactors(rows)).toEqual({});
  });

  it('qty 0 diabaikan', () => {
    expect(resolveFactors([c('DUS', 'PCS', 0)])).toEqual({});
  });

  it('relasi ke diri sendiri diabaikan', () => {
    expect(resolveFactors([c('PCS', 'PCS', 5)])).toEqual({});
  });

  it('data saling menunjuk tidak membuat loop', () => {
    expect(() => resolveFactors([c('A', 'B', 2), c('B', 'A', 2)])).not.toThrow();
  });
});
