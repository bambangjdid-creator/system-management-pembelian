import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { columnIndex, csvEscape, xlsxToCsv } from '../xlsx';

// Fixture dibuat dengan openpyxl (struktur identik dengan file Excel sungguhan).
const fixture = path.join(__dirname, 'fixtures', 'stok-nagoya.xlsx');

function makeFile(): File {
  const buf = readFileSync(fixture);
  return new File([new Uint8Array(buf)], 'stok-nagoya.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

describe('xlsxToCsv', () => {
  it('membaca .xlsx sungguhan menjadi CSV', async () => {
    const csv = await xlsxToCsv(makeFile());
    const lines = csv.split('\n');
    expect(lines[0]).toBe('ITEM_ID,ITEM_NAME,QTY,UNIT,BATCH_NO,EXPIRED');
    expect(csv).toContain('ITM-004916');
    expect(csv).toContain('@25 Kg');
    expect(lines).toHaveLength(4);
  }, 30000);

  it('mengutip nama barang yang mengandung koma', async () => {
    const csv = await xlsxToCsv(makeFile());
    expect(csv).toContain('"BEAUTY CAT 20KG, CHICKEN"');
  }, 30000);

  it('membaca tanggal expired dari sel Excel', async () => {
    const csv = await xlsxToCsv(makeFile());
    expect(csv).toMatch(/2027-05-31/);
  }, 30000);

  it('menolak file yang bukan ZIP', async () => {
    const bogus = new File([new Uint8Array([1, 2, 3, 4, 5])], 'salah.xlsx');
    await expect(xlsxToCsv(bogus)).rejects.toThrow(/ZIP/i);
  }, 30000);
});

describe('kolom Excel', () => {
  it('menghitung indeks kolom dari referensi sel', () => {
    expect(columnIndex('A1')).toBe(0);
    expect(columnIndex('B2')).toBe(1);
    expect(columnIndex('Z9')).toBe(25);
    expect(columnIndex('AA1')).toBe(26);
    expect(columnIndex('AB10')).toBe(27);
  });
});

describe('csvEscape', () => {
  it('mengutip hanya bila perlu', () => {
    expect(csvEscape('plain')).toBe('plain');
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('a;b')).toBe('"a;b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
  });
});
