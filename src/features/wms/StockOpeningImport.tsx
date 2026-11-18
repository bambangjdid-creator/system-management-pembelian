import React, { useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import Swal from 'sweetalert2';
import { AlertCircle, CheckCircle2, Clock, FileText, Plus, Search, X } from '../../icons';
import { xlsxToCsv } from '../../lib/xlsx';

/**
 * Upload saldo awal stok per gudang.
 *
 * File Excel (.xlsx) dibaca di browser memakai DecompressionStream native —
 * tanpa library pihak ketiga, supaya bundle tidak membengkak. Bila browser
 * belum mendukung, pengguna memakai template CSV (Excel tetap bisa membukanya).
 */

type Warehouse = { warehouseId: string; warehouseName: string; address?: string; pic?: string };

type PreviewRow = {
  lineNo: number;
  warehouseId: string;
  warehouseName: string;
  itemId: string;
  itemName: string;
  unit: string;
  unitBase: string;
  qty: number;
  toUnitQty: number;
  qtyBase: number;
  status: 'OK' | 'WARNING' | 'ERROR';
  messages: string[];
};

type PreviewResponse = {
  success: boolean;
  totalRows: number;
  counts: { ok: number; warning: number; error: number };
  unknownHeaders: string[];
  preview: PreviewRow[];
  readyToCommit: boolean;
  message?: string;
};

const TEMPLATE_HEADER = 'ITEM_ID,ITEM_NAME,QTY,UNIT,BATCH_NO,EXPIRED';

type Props = {
  apiFetch: (url: string, options?: any) => Promise<Response>;
};

// ---------------------------------------------------------------------------

export default function StockOpeningImport({ apiFetch }: Props) {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [fileName, setFileName] = useState('');
  const [csv, setCsv] = useState('');
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [committing, setCommitting] = useState(false);
  const [trxDate, setTrxDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [refNo, setRefNo] = useState('');
  const [status, setStatus] = useState<any>(null);
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'ERROR' | 'WARNING'>('ERROR');
  const [search, setSearch] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const loadWarehouses = React.useCallback(async () => {
    try {
      const res = await apiFetch('/api/wms/warehouses');
      if (!res.ok) throw new Error(`Gagal memuat gudang (${res.status})`);
      const data = await res.json();
      setWarehouses(Array.isArray(data) ? data : []);
      if (!warehouseId && Array.isArray(data) && data[0]) setWarehouseId(data[0].warehouseId);
    } catch (error: any) {
      Swal.fire('Gagal', error?.message || 'Tidak bisa memuat daftar gudang.', 'error');
    }
  }, [apiFetch, warehouseId]);

  const loadStatus = React.useCallback(async () => {
    try {
      const res = await apiFetch('/api/wms/import/opening/status');
      if (!res.ok) return;
      setStatus(await res.json());
    } catch {
      /* status hanya informasi, gagal memuat tidak menghentikan kerja */
    }
  }, [apiFetch]);

  React.useEffect(() => {
    loadWarehouses();
    loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFile = async (file: File) => {
    setParsing(true);
    setPreview(null);
    setFileName(file.name);
    try {
      const isExcel = /\.xlsx?$/i.test(file.name);
      if (isExcel && /\.xls$/i.test(file.name)) {
        throw new Error('Format .xls lama belum didukung. Simpan ulang sebagai .xlsx atau .csv.');
      }
      const text = isExcel ? await xlsxToCsv(file) : await file.text();
      setCsv(text);
      await runPreview(text);
    } catch (error: any) {
      setCsv('');
      Swal.fire('File tidak terbaca', error?.message || 'Coba simpan ulang sebagai CSV.', 'error');
    } finally {
      setParsing(false);
    }
  };

  const runPreview = async (text: string) => {
    const res = await apiFetch('/api/wms/import/opening/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv: text, warehouseId }),
    });
    const data = await res.json();
    if (!res.ok || data.success === false) {
      throw new Error(data.message || `Gagal memproses file (${res.status})`);
    }
    setPreview(data as PreviewResponse);
    const errors = data.counts?.error || 0;
    setFilterStatus(errors > 0 ? 'ERROR' : 'ALL');
  };

  const commit = async () => {
    if (!preview || preview.counts.error > 0) return;
    const confirm = await Swal.fire({
      title: 'Simpan saldo awal?',
      html: `<div style="text-align:left;font-size:14px;line-height:1.7">
        <div><b>${preview.counts.ok + preview.counts.warning}</b> baris akan masuk ke STOCK_LEDGER.</div>
        <div>Gudang default: <b>${warehouseId || '-'}</b></div>
        <div>Tanggal: <b>${trxDate}</b></div>
        <div style="margin-top:8px;color:#b45309">Setelah tersimpan, koreksi hanya bisa lewat entri lawan (tidak bisa dihapus).</div>
      </div>`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Ya, simpan',
      cancelButtonText: 'Batal',
    });
    if (!confirm.isConfirmed) return;

    setCommitting(true);
    try {
      const res = await apiFetch('/api/wms/import/opening/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv, warehouseId, trxDate, refNo }),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        throw new Error(data.message || `Gagal menyimpan (${res.status})`);
      }
      await Swal.fire(
        'Tersimpan',
        `${data.written} baris masuk ke STOCK_LEDGER dengan referensi ${data.refNo}.`,
        'success'
      );
      setPreview(null);
      setCsv('');
      setFileName('');
      if (fileInput.current) fileInput.current.value = '';
      await loadStatus();
    } catch (error: any) {
      Swal.fire('Gagal menyimpan', error?.message || 'Terjadi kesalahan.', 'error');
    } finally {
      setCommitting(false);
    }
  };

  const downloadTemplate = () => {
    const rows = [
      TEMPLATE_HEADER,
      'ITM-004916,511 BRAVO (25 KG),29,@25 Kg,,',
      'ITM-004916,511 BRAVO (25 KG),8,@25 Kg,,',
      'ITM-004945,A591-K,20,DUS,,',
      'ITM-005054,BEAUTY CAT 20KG - CHICKEN & SALMON,12,SAK,BT-2026-11,2027-05-31',
    ];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template-saldo-awal.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const filtered = useMemo(() => {
    if (!preview) return [];
    let rows = preview.preview;
    if (filterStatus === 'ERROR') rows = rows.filter((r) => r.status === 'ERROR');
    if (filterStatus === 'WARNING') rows = rows.filter((r) => r.status === 'WARNING');
    const q = search.trim().toUpperCase();
    if (q) {
      rows = rows.filter(
        (r) =>
          r.itemId.toUpperCase().includes(q) ||
          r.itemName.toUpperCase().includes(q) ||
          r.warehouseId.toUpperCase().includes(q)
      );
    }
    return rows;
  }, [preview, filterStatus, search]);

  const totalBase = useMemo(
    () => (preview ? preview.preview.reduce((sum, r) => sum + (r.status === 'ERROR' ? 0 : r.qtyBase), 0) : 0),
    [preview]
  );

  return (
    <motion.div key="wms-opening" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      {/* Status saldo awal yang sudah masuk */}
      {status && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-blue-600" />
            <h3 className="font-bold text-slate-800 dark:text-slate-100">Saldo Awal Tersimpan</h3>
          </div>
          {Object.keys(status.perWarehouse || {}).length === 0 ? (
            <p className="text-sm text-slate-500">
              Belum ada saldo awal. Unggah file per gudang di bawah untuk memulai.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              {Object.entries(status.perWarehouse).map(([wh, info]: [string, any]) => (
                <div key={wh} className="rounded-2xl border border-slate-100 dark:border-slate-800 p-4">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{wh}</p>
                  <p className="text-2xl font-black text-slate-800 dark:text-slate-100">
                    {Number(info.itemCount).toLocaleString('id-ID')}
                  </p>
                  <p className="text-xs text-slate-500">baris item</p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Total qty dasar: {Number(info.totalBase).toLocaleString('id-ID')}
                  </p>
                </div>
              ))}
            </div>
          )}
          {status.lastWrite && (
            <p className="mt-4 text-[11px] text-slate-400">
              Terakhir menulis: {new Date(status.lastWrite).toLocaleString('id-ID')}
            </p>
          )}
        </div>
      )}

      {/* Form upload */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-slate-800 dark:text-slate-100">Upload Stok Awal per Gudang</h2>
            <p className="text-sm text-slate-500 mt-1">
              File Excel atau CSV berisi kolom <b>ITEM_ID</b> dan <b>QTY</b>. Satuan boleh DUS/BAL/SAK —
              otomatis dikonversi ke satuan terkecil.
            </p>
          </div>
          <button
            onClick={downloadTemplate}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <FileText className="w-4 h-4" /> Unduh Template
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Gudang default (dipakai bila kolom gudang kosong)
            </span>
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-sm font-semibold"
            >
              {warehouses.length === 0 && <option value="">(gudang belum termuat)</option>}
              {warehouses.map((w) => (
                <option key={w.warehouseId} value={w.warehouseId}>
                  {w.warehouseId} — {w.warehouseName}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Tanggal saldo awal
            </span>
            <input
              type="date"
              value={trxDate}
              onChange={(e) => setTrxDate(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-sm font-semibold"
            />
          </label>

          <label className="block sm:col-span-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Nomor referensi (opsional)
            </span>
            <input
              type="text"
              value={refNo}
              onChange={(e) => setRefNo(e.target.value)}
              placeholder="otomatis: SALDO-AWAL-YYYYMMDD"
              className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-sm font-semibold"
            />
          </label>
        </div>

        {/* Dropzone */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file) handleFile(file);
          }}
          className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-8 text-center"
        >
          <input
            ref={fileInput}
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
          {parsing ? (
            <p className="text-sm font-bold text-slate-500">Membaca file…</p>
          ) : (
            <>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {fileName ? (
                  <>
                    File terpilih: <b>{fileName}</b>
                  </>
                ) : (
                  'Tarik file ke sini, atau'
                )}
              </p>
              <button
                onClick={() => fileInput.current?.click()}
                className="mt-3 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700"
              >
                <Plus className="w-4 h-4" /> Pilih File
              </button>
              <p className="mt-3 text-[11px] text-slate-400">
                Format didukung: .xlsx dan .csv (maksimal 10 MB). File .xls lama harap disimpan ulang.
              </p>
            </>
          )}
        </div>
      </div>

      {/* Pratinjau */}
      {preview && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 overflow-hidden">
          <div className="p-6 border-b border-slate-100 dark:border-slate-800 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-bold text-slate-800 dark:text-slate-100">
                Pratinjau — {preview.totalRows.toLocaleString('id-ID')} baris
              </h3>
              <button
                onClick={() => {
                  setPreview(null);
                  setCsv('');
                  setFileName('');
                  if (fileInput.current) fileInput.current.value = '';
                }}
                className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-700"
              >
                <X className="w-4 h-4" /> Tutup
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/20 p-4">
                <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600">Siap</p>
                <p className="text-2xl font-black text-emerald-700">{preview.counts.ok.toLocaleString('id-ID')}</p>
              </div>
              <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/20 p-4">
                <p className="text-[10px] font-black uppercase tracking-wider text-amber-600">Perhatian</p>
                <p className="text-2xl font-black text-amber-700">{preview.counts.warning.toLocaleString('id-ID')}</p>
              </div>
              <div className="rounded-2xl bg-red-50 dark:bg-red-950/20 p-4">
                <p className="text-[10px] font-black uppercase tracking-wider text-red-600">Error</p>
                <p className="text-2xl font-black text-red-700">{preview.counts.error.toLocaleString('id-ID')}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 dark:bg-slate-800 p-4">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Total qty dasar</p>
                <p className="text-2xl font-black text-slate-800 dark:text-slate-100">
                  {totalBase.toLocaleString('id-ID')}
                </p>
              </div>
            </div>

            {preview.unknownHeaders.length > 0 && (
              <div className="flex items-start gap-2 rounded-xl bg-amber-50 dark:bg-amber-950/20 p-3 text-xs text-amber-700">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Kolom tidak dikenal dan diabaikan: <b>{preview.unknownHeaders.join(', ')}</b>
                </span>
              </div>
            )}

            {preview.counts.error > 0 ? (
              <div className="flex items-start gap-2 rounded-xl bg-red-50 dark:bg-red-950/20 p-3 text-xs text-red-700">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Ada <b>{preview.counts.error}</b> baris error. Perbaiki dulu di file — penyimpanan
                  dikunci sampai semuanya bersih, supaya tidak ada stok yang masuk setengah.
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 p-3 text-xs text-emerald-700">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                Semua baris bisa disimpan.
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {(['ERROR', 'WARNING', 'ALL'] as const).map((key) => (
                <button
                  key={key}
                  onClick={() => setFilterStatus(key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                    filterStatus === key
                      ? 'bg-slate-800 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {key === 'ERROR' ? 'Hanya Error' : key === 'WARNING' ? 'Hanya Perhatian' : 'Semua'}
                </button>
              ))}
              <div className="relative ml-auto">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari item…"
                  className="pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs w-56"
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0">
                <tr>
                  {['Baris', 'Gudang', 'Item', 'Qty', 'Satuan', 'Qty Dasar', 'Status', 'Catatan'].map((h) => (
                    <th key={h} className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-500">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-400 text-xs">
                      Tidak ada baris pada filter ini.
                      {preview.totalRows > preview.preview.length && (
                        <> Pratinjau dibatasi {preview.preview.length} baris pertama.</>
                      )}
                    </td>
                  </tr>
                )}
                {filtered.map((row) => (
                  <tr key={`${row.lineNo}-${row.itemId}`} className={row.status === 'ERROR' ? 'bg-red-50/40 dark:bg-red-950/10' : ''}>
                    <td className="px-4 py-2 text-xs text-slate-400">{row.lineNo}</td>
                    <td className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300">{row.warehouseId}</td>
                    <td className="px-4 py-2">
                      <p className="font-bold text-slate-800 dark:text-slate-100 text-xs">{row.itemName || '-'}</p>
                      <p className="text-[10px] text-slate-400 font-mono">{row.itemId || '-'}</p>
                    </td>
                    <td className="px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-200">{row.qty}</td>
                    <td className="px-4 py-2 text-xs text-slate-600 dark:text-slate-300">{row.unit}</td>
                    <td className="px-4 py-2 text-xs font-bold text-indigo-600">
                      {row.qtyBase.toLocaleString('id-ID')}
                      <span className="text-[10px] font-normal text-slate-400"> {row.unitBase}</span>
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`px-2 py-1 rounded-md text-[10px] font-black ${
                          row.status === 'ERROR'
                            ? 'bg-red-100 text-red-700'
                            : row.status === 'WARNING'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-[11px] text-slate-500 max-w-xs">
                      {row.messages.length === 0 ? '—' : row.messages.join(' · ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="p-6 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[11px] text-slate-400 max-w-md">
              Baris tersimpan sebagai <b>OPNAME_IN</b> di STOCK_LEDGER. Tidak ada angka stok yang
              ditimpa — koreksi dilakukan dengan entri lawan.
            </p>
            <button
              onClick={commit}
              disabled={!preview.readyToCommit || committing}
              className={`px-6 py-3 rounded-xl font-bold text-sm flex items-center gap-2 ${
                preview.readyToCommit && !committing
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              {committing ? 'Menyimpan…' : `Simpan ${preview.counts.ok + preview.counts.warning} Baris`}
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
