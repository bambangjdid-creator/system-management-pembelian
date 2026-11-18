import { describe, expect, it } from 'vitest';
import { formatGrNumber, nextGrNumberFromExisting, parseGrNumber, resolveDivisionCode } from '../gr';

describe('GR numbering', () => {
  it('formats GR number as GR-[DIV]000000001-YY', () => {
    expect(formatGrNumber('NGY', 1, '26')).toBe('GR-NGY000000001-26');
    expect(formatGrNumber('PCL', 42, '26')).toBe('GR-PCL000000042-26');
  });

  it('parses GR number back', () => {
    expect(parseGrNumber('GR-NGY000000001-26')).toEqual({ divCode: 'NGY', num: 1, yearSuffix: '26' });
    expect(parseGrNumber('PO/SAU/05/2026/0001')).toBeNull();
    expect(parseGrNumber('')).toBeNull();
  });

  it('resolves division code from warehouse name', () => {
    expect(resolveDivisionCode('GD NAGOYA')).toBe('NGY');
    expect(resolveDivisionCode('GD PONCOL')).toBe('PCL');
    expect(resolveDivisionCode('GD CIRACAS')).toBe('CRS');
    expect(resolveDivisionCode('GD NAGOYA', 'PCL')).toBe('NGY');
    expect(resolveDivisionCode('', 'CRS')).toBe('CRS');
    expect(resolveDivisionCode('')).toBe('GEN');
  });

  it('generates next number per division and year', () => {
    expect(nextGrNumberFromExisting([], 'NGY', '26')).toBe('GR-NGY000000001-26');
    expect(
      nextGrNumberFromExisting(['GR-NGY000000001-26', 'GR-NGY000000005-26', 'GR-PCL000000009-26', 'GR-NGY000000003-25'], 'NGY', '26')
    ).toBe('GR-NGY000000006-26');
    expect(nextGrNumberFromExisting(['GR-PCL000000009-26'], 'NGY', '26')).toBe('GR-NGY000000001-26');
  });
});
