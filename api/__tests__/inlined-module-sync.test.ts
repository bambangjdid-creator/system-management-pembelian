import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

/**
 * Modul stok WMS ada DUA salinan:
 *
 *   1. src/lib/wms-stock.ts   -> dipakai test & sumber kebenaran
 *   2. api/server.ts          -> tempelan, karena Vercel tidak mengunggah
 *                                berkas di luar api/
 *
 * Duplikasi ini disengaja, tetapi berbahaya: kalau salah satu diubah
 * sendirian, production dan test bisa berbeda perilaku. Test ini menuntut
 * keduanya identik.
 *
 * Cara memperbaiki bila gagal:
 *   python3 tools/wms/inline_stock_module.py
 */

const root = process.cwd();
const moduleSource = readFileSync(join(root, 'src/lib/wms-stock.ts'), 'utf8');
const serverSource = readFileSync(join(root, 'api/server.ts'), 'utf8');

/** Ubah sumber modul menjadi bentuk tempelan (sama seperti skrip inline). */
function toInlinedForm(source: string): string {
  return source
    .replace(/^export (type|function|const) /gm, '$1 ')
    .replace(/\btoNumber\b/g, 'wmsToNumber')
    .replace(/\btoText\b/g, 'wmsToText');
}

/**
 * Ambil BADAN modul dari api/server.ts — mulai dari JSDoc pertama sesudah
 * header penjelas, sampai sebelum penanda penutup.
 */
function extractInlined(server: string): string {
  const header = server.indexOf('// Perhitungan stok WMS — SENGAJA DITEMPEL');
  const end = server.indexOf('// ===================== akhir modul stok WMS');
  if (header === -1 || end === -1) return '';
  const bodyStart = server.indexOf('/**', header);
  if (bodyStart === -1 || bodyStart > end) return '';
  return server.slice(bodyStart, end);
}

describe('modul stok WMS: salinan di api/server.ts harus identik', () => {
  it('tempelan ditemukan di api/server.ts', () => {
    expect(extractInlined(serverSource).length).toBeGreaterThan(1000);
  });

  it('isi tempelan sama dengan src/lib/wms-stock.ts', () => {
    const expected = toInlinedForm(moduleSource);
    const actual = extractInlined(serverSource);

    // Bandingkan per fungsi agar pesan gagalnya menunjuk fungsi yang beda.
    const fnNames = [...expected.matchAll(/^(?:function|const|type) (\w+)/gm)].map((m) => m[1]);
    const drift: string[] = [];
    for (const name of fnNames) {
      const pattern = new RegExp(`^(?:function|const|type) ${name}\\b`, 'm');
      if (pattern.test(expected) && !pattern.test(actual)) drift.push(name);
    }
    expect(drift, `Fungsi hilang dari tempelan: ${drift.join(', ')}`).toEqual([]);

    expect(actual.trim()).toBe(expected.trim());
  });

  it('tidak ada fungsi kunci yang tertinggal', () => {
    const required = [
      'buildUnitFactors',
      'buildUnitOptions',
      'resolveFactors',
      'parseMultiPackLabel',
      'bridgeConversionsToItems',
      'aggregateLedger',
      'buildMovements',
    ];
    for (const name of required) {
      expect(serverSource.includes(`function ${name}`), `${name} tidak ada di api/server.ts`).toBe(true);
    }
  });
});
