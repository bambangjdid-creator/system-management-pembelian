import { beforeAll, describe, expect, it } from 'vitest';

// Helper GR sengaja di-inline di api/server.ts (lihat komentar di sana): Vercel
// mengompilasi tiap file di folder api/ sebagai serverless function tersendiri,
// sehingga import ke file .ts saudara menyebabkan ERR_MODULE_NOT_FOUND saat runtime.
// Test ini mengimpor server.ts secara dinamis setelah env wajib di-stub, supaya
// yang diuji benar-benar kode yang dikirim ke production.
type GrHelpers = {
  resolveDivisionCode: (division: unknown, fallbackCode?: unknown) => string;
  formatGrNumber: (divCode: string, num: number, yearSuffix: string) => string;
  parseGrNumber: (value: unknown) => { divCode: string; num: number; yearSuffix: string } | null;
  nextGrNumberFromExisting: (existing: unknown[], divCode: string, yearSuffix: string) => string;
};

let gr: GrHelpers;

beforeAll(async () => {
  process.env.VERCEL = '1'; // jangan start HTTP server saat modul dimuat
  process.env.SPREADSHEET_ID = 'test-sheet';
  process.env.GOOGLE_DRIVE_FOLDER_ID = 'test-folder';
  process.env.GOOGLE_DRIVE_PO_FOLDER_ID = 'test-po-folder';
  process.env.TEMPLATE_PR_ID = 'test-pr-template';
  process.env.TEMPLATE_PO_ID = 'test-po-template';
  process.env.JWT_SECRET = 'test-secret-value-that-is-long-enough-1234';
  process.env.NODE_ENV = 'test';
  gr = (await import('../server')) as unknown as GrHelpers;
}, 60000);

describe('GR numbering', () => {
  it('formats GR number as GR-[DIV]000000001-YY', () => {
    expect(gr.formatGrNumber('NGY', 1, '26')).toBe('GR-NGY000000001-26');
    expect(gr.formatGrNumber('PCL', 42, '26')).toBe('GR-PCL000000042-26');
  });

  it('parses GR number back', () => {
    expect(gr.parseGrNumber('GR-NGY000000001-26')).toEqual({ divCode: 'NGY', num: 1, yearSuffix: '26' });
    expect(gr.parseGrNumber('PO/SAU/05/2026/0001')).toBeNull();
    expect(gr.parseGrNumber('')).toBeNull();
  });

  it('resolves division code from warehouse name', () => {
    expect(gr.resolveDivisionCode('GD NAGOYA')).toBe('NGY');
    expect(gr.resolveDivisionCode('GD PONCOL')).toBe('PCL');
    expect(gr.resolveDivisionCode('GD CIRACAS')).toBe('CRS');
    expect(gr.resolveDivisionCode('GD NAGOYA', 'PCL')).toBe('NGY');
    expect(gr.resolveDivisionCode('', 'CRS')).toBe('CRS');
    expect(gr.resolveDivisionCode('')).toBe('GEN');
  });

  it('generates next number per division and year', () => {
    expect(gr.nextGrNumberFromExisting([], 'NGY', '26')).toBe('GR-NGY000000001-26');
    expect(
      gr.nextGrNumberFromExisting(
        ['GR-NGY000000001-26', 'GR-NGY000000005-26', 'GR-PCL000000009-26', 'GR-NGY000000003-25'],
        'NGY',
        '26'
      )
    ).toBe('GR-NGY000000006-26');
    expect(gr.nextGrNumberFromExisting(['GR-PCL000000009-26'], 'NGY', '26')).toBe('GR-NGY000000001-26');
  });
});
