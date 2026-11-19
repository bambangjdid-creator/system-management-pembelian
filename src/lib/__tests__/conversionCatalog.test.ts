/**
 * Verifikasi aturan konversi terhadap SELURUH isi Master Data Konversi.xlsx.
 *
 * Test unit biasa memakai beberapa contoh. File ini memakai 8.788 item dan
 * 23.661 baris asli supaya regresi sekecil apa pun langsung kelihatan:
 * satu item yang kehilangan konversi akan menggagalkan test.
 *
 * Sumber: templates/google-sheets/wms/source/Master Data Konversi.xlsx
 * (salinan yang diunduh dari Google Drive; hanya sheet "Sheet" yang dipakai).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildUnitFactors, buildUnitOptions, parseMultiPackLabel } from '../wms-stock';

const SOURCE = resolve(__dirname, '../../../templates/google-sheets/wms/source/Master Data Konversi.xlsx');

/**
 * Pembaca xlsx minimal tanpa dependency: xlsx adalah arsip zip berisi XML.
 * Node punya zlib, jadi cukup ekstrak sheet1.xml + sharedStrings.xml.
 */
function readXlsxRows(path: string): string[][] {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const zlib = require('node:zlib') as typeof import('node:zlib');

  const buf = readFileSync(path);
  // --- baca central directory zip ---
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('bukan file zip/xlsx');

  const entries = new Map<string, number>();
  const count = buf.readUInt16LE(eocd + 10);
  let ptr = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(ptr) !== 0x02014b50) break;
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const offset = buf.readUInt32LE(ptr + 42);
    const name = buf.toString('utf8', ptr + 46, ptr + 46 + nameLen);
    entries.set(name, offset);
    ptr += 46 + nameLen + extraLen + commentLen;
  }

  const readEntry = (name: string): string | null => {
    const offset = entries.get(name);
    if (offset === undefined) return null;
    const method = buf.readUInt16LE(offset + 8);
    const compSize = buf.readUInt32LE(offset + 18);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const start = offset + 30 + nameLen + extraLen;
    const data = buf.subarray(start, start + compSize);
    return (method === 0 ? data : zlib.inflateRawSync(data)).toString('utf8');
  };

  const sharedRaw = readEntry('xl/sharedStrings.xml') || '';
  const shared: string[] = [];
  for (const m of sharedRaw.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    const parts = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]);
    shared.push(parts.join('').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
  }

  const sheetRaw = readEntry('xl/worksheets/sheet1.xml') || '';
  const rows: string[][] = [];
  for (const rowMatch of sheetRaw.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    let col = 0;
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cellMatch[1];
      const body = cellMatch[2];
      const ref = /r="([A-Z]+)\d+"/.exec(attrs);
      if (ref) {
        let index = 0;
        for (const ch of ref[1]) index = index * 26 + (ch.charCodeAt(0) - 64);
        col = index - 1;
      }
      const type = /t="([^"]+)"/.exec(attrs);
      const valueMatch = /<v>([\s\S]*?)<\/v>/.exec(body);
      const inlineMatch = /<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>[\s\S]*?<\/is>/.exec(body);
      let value = '';
      if (type && type[1] === 's' && valueMatch) value = shared[Number(valueMatch[1])] ?? '';
      else if (inlineMatch) value = inlineMatch[1];
      else if (valueMatch) value = valueMatch[1];

      while (cells.length < col) cells.push('');
      cells[col] = value;
      col += 1;
    }
    rows.push(cells);
  }
  return rows;
}

type ItemRows = { name: string; rows: { fromUnit: string; toUnit: string; toUnitQty: number }[] };

function loadCatalog(): ItemRows[] {
  const raw = readXlsxRows(SOURCE);
  const byName = new Map<string, ItemRows>();

  for (let i = 1; i < raw.length; i++) {
    const r = raw[i];
    if (!r || !r[0]) continue;
    const name = String(r[0]).trim();
    const fromUnit = String(r[3] ?? '').trim();
    const qty = Number(String(r[4] ?? '').replace(/,/g, ''));
    const toUnit = String(r[5] ?? '').trim();
    if (!name || !fromUnit || !Number.isFinite(qty) || qty <= 0) continue;

    const entry = byName.get(name) || { name, rows: [] };
    entry.rows.push({ fromUnit, toUnit, toUnitQty: qty });
    byName.set(name, entry);
  }
  return [...byName.values()];
}

const factorsFor = (item: ItemRows): Record<string, number> =>
  buildUnitFactors(
    item.rows.map((row, index) => ({
      itemId: 'X',
      fromUnit: row.fromUnit,
      toUnit: row.toUnit,
      toUnitQty: row.toUnitQty,
      level: index + 1,
      isActive: true,
    }))
  ).X;

const available = existsSync(SOURCE);
const maybeDescribe = available ? describe : describe.skip;

maybeDescribe('Master Data Konversi.xlsx — seluruh katalog', () => {
  const catalog = loadCatalog();

  it('membaca 8.788 item dengan 23.661 baris', () => {
    expect(catalog.length).toBeGreaterThan(8700);
    const totalRows = catalog.reduce((sum, item) => sum + item.rows.length, 0);
    expect(totalRows).toBeGreaterThan(23000);
  });

  it('setiap label @N terbaca sebagai multipak', () => {
    let labels = 0;
    for (const item of catalog) {
      for (const row of item.rows) {
        if (!row.fromUnit.startsWith('@')) continue;
        labels += 1;
        expect(parseMultiPackLabel(row.fromUnit), `${item.name}: ${row.fromUnit}`).not.toBeNull();
      }
    }
    expect(labels).toBeGreaterThan(12000);
  });

  it('tidak ada item yang konversinya hilang seluruhnya', () => {
    const lost: string[] = [];
    for (const item of catalog) {
      const factors = factorsFor(item);

      // Baris 1:1 (mis. 'PCS | 1 | PCS') tidak membawa informasi konversi.
      // Yang dihitung hanya baris yang benar-benar menyatakan perbandingan.
      const hasRealRelation = item.rows.some(
        (row) => row.toUnitQty !== 1 || row.fromUnit !== row.toUnit
      );
      if (hasRealRelation && (!factors || Object.keys(factors).length === 0)) {
        lost.push(item.name);
      }
    }
    expect(lost.slice(0, 10)).toEqual([]);
    expect(lost.length).toBe(0);
  });

  it('varian multipak benar-benar menjadi pilihan satuan', () => {
    const item = catalog.find((entry) => entry.name === 'CAT CHOIZE KITTEN SALMON 20KG');
    expect(item, 'item contoh harus ada di workbook').toBeTruthy();
    const factors = factorsFor(item!);

    const units = buildUnitOptions('SAK', factors).map((option) => option.unit);
    expect(units).toContain('@3 SAK');
    expect(units).toContain('@5 SAK');
    expect(units).toContain('@20 SAK');
  });

  it('faktor selalu bilangan positif dan masuk akal', () => {
    for (const item of catalog) {
      const factors = factorsFor(item);
      if (!factors || Object.keys(factors).length === 0) continue;
      const values = Object.values(factors);
      // 'JERUJI FIBER HITAM 1 mm' hanya punya paket '@100' tanpa satuan fisik,
      // jadi tidak ada patokan 1 — yang wajib: semua faktor > 0 dan terbatas.
      for (const value of values) {
        expect(Number.isFinite(value), `${item.name}: ${value}`).toBe(true);
        expect(value, item.name).toBeGreaterThan(0);
        expect(value, item.name).toBeLessThanOrEqual(1_000_000);
      }
    }
  });
});
