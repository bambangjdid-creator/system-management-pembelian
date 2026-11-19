import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

/**
 * Regresi: tab WMS tampil 0 baris padahal isinya ribuan.
 *
 * Penyebabnya dulu: `wmsValues()` membaca rentang `A2:Z`, sehingga baris 1
 * (header asli: CONV_ID, ITEM_ID, FROM_UNIT, ...) tidak ikut terbaca.
 * `rowsToObjects()` lalu memakai BARIS DATA PERTAMA sebagai header, jadi
 * `row.FROM_UNIT` selalu undefined dan semua baris tersaring habis.
 *
 * Akibatnya bukan cuma multipak yang hilang: BARIS KONVERSI, AKTIF,
 * ITEM TERKONVERSI, semuanya 0 — dan Expiry Monitor serta Stok Gudang
 * ikut kosong karena memakai jalur yang sama.
 */

const serverSource = readFileSync(join(process.cwd(), 'api', 'server.ts'), 'utf8');

/** Tiruan rowsToObjects di api/server.ts — harus berperilaku sama. */
const safeText = (value: any) => (value === null || value === undefined ? '' : String(value).trim());

function rowsToObjects(rows: any[][]): Record<string, string>[] {
  if (rows.length === 0) return [];
  const headers = rows[0].map((h: any) => safeText(h).toUpperCase());
  return rows
    .slice(1)
    .filter((row) => Array.isArray(row) && row.some((cell: any) => safeText(cell) !== ''))
    .map((row) => {
      const obj: Record<string, string> = {};
      headers.forEach((head, i) => {
        if (head) obj[head] = safeText(row[i]);
      });
      return obj;
    });
}

const HEADER = ['CONV_ID', 'ITEM_ID', 'ITEM_NAME', 'LEVEL', 'FROM_UNIT', 'TO_UNIT', 'TO_UNIT_QTY', 'IS_ACTIVE', 'NOTES'];
const DATA = [
  ['CNV-000001', 'SPS000001', '(DC) FURKIDO FLEA & TICK COLLAR FOR DOG', '2', '@3', 'PCS', '3', 'Y', ''],
  ['CNV-000002', 'SPS000001', '(DC) FURKIDO FLEA & TICK COLLAR FOR DOG', '3', '@6', 'PCS', '6', 'Y', ''],
];

describe('wmsValues harus menyertakan baris header', () => {
  it('default range dimulai dari baris 1, bukan baris 2', () => {
    const match = /function wmsValues\([^)]*range\s*=\s*"([^"]+)"/.exec(serverSource);
    expect(match, 'deklarasi wmsValues tidak ditemukan').toBeTruthy();
    expect(match![1]).toBe('A1:Z');
  });

  it('tidak ada lagi pemanggilan dengan default baris 2', () => {
    expect(serverSource).not.toContain('range = "A2:Z"');
  });

  it('A1:Z membuat kolom terbaca benar', () => {
    const rows = [HEADER, ...DATA];
    const objects = rowsToObjects(rows);
    expect(objects).toHaveLength(2);
    expect(objects[0].FROM_UNIT).toBe('@3');
    expect(objects[1].FROM_UNIT).toBe('@6');
    expect(objects[0].ITEM_ID).toBe('SPS000001');
    expect(objects[0].TO_UNIT_QTY).toBe('3');
  });

  it('A2:Z (bug lama) membuat semua kolom hilang — bukti regresi', () => {
    // Tanpa baris header, baris data pertama dipakai sebagai header.
    const objects = rowsToObjects(DATA);
    expect(objects).toHaveLength(1);
    expect(objects[0].FROM_UNIT).toBeUndefined();
    expect(objects[0].ITEM_ID).toBeUndefined();
  });
});
