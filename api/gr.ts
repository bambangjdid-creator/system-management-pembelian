// Pure helpers for Goods Receipt (GR) numbering.
// Kept dependency-free so they can be unit-tested without loading the server.

export const DIVISION_CODE_MAP: Record<string, string> = {
  "GD NAGOYA": "NGY",
  "GD PONCOL": "PCL",
  "GD CIRACAS": "CRS",
  "NAGOYA": "NGY",
  "PONCOL": "PCL",
  "CIRACAS": "CRS",
};

export function resolveDivisionCode(division: unknown, fallbackCode?: unknown): string {
  const div = String(division || "").toUpperCase().trim();
  if (div && DIVISION_CODE_MAP[div]) return DIVISION_CODE_MAP[div];
  if (div) {
    const matched = Object.keys(DIVISION_CODE_MAP).find((k) => div.includes(k) || k.includes(div));
    if (matched) return DIVISION_CODE_MAP[matched];
  }
  const fallback = String(fallbackCode || "").toUpperCase().trim();
  if (/^[A-Z0-9]{2,5}$/.test(fallback)) return fallback;
  const cleaned = div.replace(/[^A-Z0-9]/g, "").slice(0, 5);
  return cleaned || "GEN";
}

// Format: GR-[DIV_KODE]000000001-26
export function formatGrNumber(divCode: string, num: number, yearSuffix: string): string {
  return `GR-${divCode}${String(num).padStart(9, "0")}-${yearSuffix}`;
}

export function parseGrNumber(value: unknown): { divCode: string; num: number; yearSuffix: string } | null {
  const match = String(value || "").match(/^GR-([A-Z0-9]+)(\d{9})-(\d{2})$/);
  if (!match) return null;
  return { divCode: match[1], num: parseInt(match[2], 10), yearSuffix: match[3] };
}

export function nextGrNumberFromExisting(existing: unknown[], divCode: string, yearSuffix: string): string {
  const nums = existing.map((v) => {
    const parsed = parseGrNumber(v);
    if (!parsed) return 0;
    if (parsed.divCode !== divCode || parsed.yearSuffix !== yearSuffix) return 0;
    return parsed.num;
  });
  return formatGrNumber(divCode, Math.max(...nums, 0) + 1, yearSuffix);
}
