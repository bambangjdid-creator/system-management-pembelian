import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

/**
 * PENJAGA PRODUCTION.
 *
 * Vercel meng-compile setiap berkas di api/ menjadi serverless function
 * TERSENDIRI dan hanya mengunggah berkas itu ke /var/task. Import relatif
 * seperti "../src/lib/x" lolos di build lokal (esbuild --bundle) tetapi
 * meledak di production:
 *
 *   ERR_MODULE_NOT_FOUND: Cannot find module '/var/task/src/lib/wms-stock'
 *
 * Test ini menggagalkan build bila ada import relatif di api/.
 */

const API_DIR = join(process.cwd(), 'api');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === '__tests__' || entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (/\.(ts|js|mts|cts)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const IMPORT_PATTERNS = [
  /^\s*import\s+[^;]*?from\s+["'](\.[^"']*)["']/gm,
  /^\s*import\s+["'](\.[^"']*)["']/gm,
  /require\(\s*["'](\.[^"']*)["']\s*\)/g,
  /^\s*export\s+[^;]*?from\s+["'](\.[^"']*)["']/gm,
];

describe('api/ tidak boleh punya import relatif', () => {
  const files = walk(API_DIR).filter((file) => !file.endsWith('.test.ts'));

  it('menemukan berkas di api/', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('setiap berkas di api/ bebas import relatif', () => {
    const offenders: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const pattern of IMPORT_PATTERNS) {
        pattern.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(source))) {
          const line = source.slice(0, match.index).split('\n').length;
          offenders.push(`${file.replace(process.cwd() + '/', '')}:${line} -> ${match[1]}`);
        }
      }
    }

    expect(
      offenders,
      `Import relatif di api/ akan membuat production 500 (ERR_MODULE_NOT_FOUND).\n` +
      `Vercel tidak mengunggah berkas di luar api/. Tempel kodenya ke api/server.ts.\n\n` +
      offenders.join('\n')
    ).toEqual([]);
  });

  it('api/ hanya berisi server.ts sebagai entrypoint', () => {
    const names = files.map((file) => file.replace(API_DIR + '/', ''));
    expect(names).toEqual(['server.ts']);
  });
});
