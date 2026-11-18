/**
 * Pembaca .xlsx di browser tanpa library pihak ketiga.
 *
 * .xlsx adalah arsip ZIP biasa. Kita hanya butuh dua entri:
 *   xl/sharedStrings.xml   -> tabel string
 *   xl/worksheets/sheet1.xml -> sel
 * Dekompresi memakai DecompressionStream("deflate-raw") yang tersedia native
 * di Chrome/Edge/Safari/Firefox modern (2023+). Dengan begitu tidak ada
 * dependency xlsx (yang ukurannya ~400 KB) yang masuk ke bundle produksi.
 */

// --- Pembacaan .xlsx di browser -------------------------------------------
// .xlsx = arsip ZIP. Kita hanya butuh xl/sharedStrings.xml dan
// xl/worksheets/sheet1.xml. Cukup untuk file ekspor sederhana.

export async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  // Jangan bergantung pada Blob.stream(): sebagian environment (dan jsdom)
  // tidak menyediakannya. Bangun ReadableStream sendiri supaya konsisten.
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });
  const decompressed = source.pipeThrough(new DecompressionStream("deflate-raw"));
  const reader = decompressed.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.length;
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

const readU16 = (d: Uint8Array, o: number) => d[o] | (d[o + 1] << 8);
const readU32 = (d: Uint8Array, o: number) =>
  (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0;

export async function unzip(archive: Uint8Array): Promise<Record<string, Uint8Array>> {
  const files: Record<string, Uint8Array> = {};
  // Cari End Of Central Directory
  let eocd = -1;
  for (let i = archive.length - 22; i >= 0 && i > archive.length - 66000; i -= 1) {
    if (readU32(archive, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('File bukan .xlsx yang valid (struktur ZIP tidak ditemukan).');

  const total = readU16(archive, eocd + 10);
  let offset = readU32(archive, eocd + 16);

  for (let n = 0; n < total; n += 1) {
    if (readU32(archive, offset) !== 0x02014b50) break;
    const method = readU16(archive, offset + 10);
    const compSize = readU32(archive, offset + 20);
    const nameLen = readU16(archive, offset + 28);
    const extraLen = readU16(archive, offset + 30);
    const commentLen = readU16(archive, offset + 32);
    const localOffset = readU32(archive, offset + 42);
    const name = new TextDecoder().decode(archive.subarray(offset + 46, offset + 46 + nameLen));

    // Baca local header untuk menemukan awal data
    const localNameLen = readU16(archive, localOffset + 26);
    const localExtraLen = readU16(archive, localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const raw = archive.subarray(dataStart, dataStart + compSize);

    if (method === 0) files[name] = raw;
    else if (method === 8) files[name] = await inflateRaw(raw);

    offset += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

export function xmlText(xml: string, tag: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}

export const decodeXml = (value: string) =>
  value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

export function columnIndex(ref: string): number {
  const letters = ref.replace(/[^A-Z]/g, '');
  let index = 0;
  for (const ch of letters) index = index * 26 + (ch.charCodeAt(0) - 64);
  return index - 1;
}

export function csvEscape(value: string): string {
  if (/[",\n;]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export async function xlsxToCsv(file: File): Promise<string> {
  const archive = new Uint8Array(await file.arrayBuffer());
  const files = await unzip(archive);

  const sharedXml = files['xl/sharedStrings.xml']
    ? new TextDecoder().decode(files['xl/sharedStrings.xml'])
    : '';
  const sharedStrings = xmlText(sharedXml, 'si').map((si) =>
    xmlText(si, 't').map(decodeXml).join('')
  );

  const sheetName =
    Object.keys(files).find((n) => /^xl\/worksheets\/sheet1\.xml$/.test(n)) ||
    Object.keys(files).find((n) => /^xl\/worksheets\/.*\.xml$/.test(n));
  if (!sheetName) throw new Error('Sheet pertama tidak ditemukan di dalam file Excel.');

  const sheetXml = new TextDecoder().decode(files[sheetName]);
  const rowsXml = xmlText(sheetXml, 'row');
  if (rowsXml.length === 0) throw new Error('File Excel kosong.');

  const lines: string[] = [];
  for (const rowXml of rowsXml) {
    const cells: string[] = [];
    const cellRe = /<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g;
    let cell: RegExpExecArray | null;
    while ((cell = cellRe.exec(rowXml))) {
      const attrs = cell[1] || cell[3] || '';
      const inner = cell[2] || '';
      const refMatch = /r="([A-Z]+\d+)"/.exec(attrs);
      const type = /t="([^"]+)"/.exec(attrs)?.[1];
      const idx = refMatch ? columnIndex(refMatch[1]) : cells.length;

      let value = '';
      if (type === 's') {
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
        value = v !== undefined ? sharedStrings[Number(v)] ?? '' : '';
      } else if (type === 'inlineStr') {
        value = xmlText(inner, 't').map(decodeXml).join('');
      } else {
        value = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? '';
      }
      while (cells.length < idx) cells.push('');
      cells[idx] = decodeXml(value).trim();
    }
    if (cells.some((c) => c !== '')) lines.push(cells.map(csvEscape).join(','));
  }

  if (lines.length === 0) throw new Error('Tidak ada data yang terbaca dari file Excel.');
  return lines.join('\n');
}

