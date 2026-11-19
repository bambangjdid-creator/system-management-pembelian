import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, AlertTriangle, Clock, Package, Search } from '../../icons';

/**
 * Expiry Monitor — batch mana yang harus segera dijual / diretur.
 *
 * Hanya item ber-flag TRACK_EXPIRY=Y yang dipantau. Barang tanpa expired tetap
 * boleh ada di gudang; yang dipisahkan di sini adalah barang yang tanggalnya
 * HARUS diisi tapi kosong (NO_DATE), bukan barang yang memang tidak ber-expired.
 */

type ExpiryRow = {
  batchId: string;
  itemId: string;
  itemName: string;
  category: string;
  warehouseId: string;
  warehouseName: string;
  batchNo: string;
  expiredDate: string;
  daysLeft: number | null;
  status: 'EXPIRED' | 'CRITICAL' | 'WARNING' | 'SAFE' | 'NO_DATE';
  qtyRemainBase: number;
  unitBase: string;
  display: string;
  unitCost: number;
  value: number;
  grNo: string;
  supplier: string;
};

type Summary = {
  batches: number;
  items: number;
  expired: number;
  critical: number;
  warning: number;
  safe: number;
  noDate: number;
  qtyBase: number;
  valueAtRisk: number;
  valueTotal: number;
};

type ExpiryResponse = {
  success: boolean;
  today: string;
  summary: Summary;
  filteredSummary: Summary;
  total: number;
  rows: ExpiryRow[];
  message?: string;
};

type Warehouse = { warehouseId: string; warehouseName: string };

type Props = {
  apiFetch: (url: string, options?: any) => Promise<Response>;
};

const fmt = (value: number) =>
  (Math.round((Number(value) || 0) * 1000) / 1000).toLocaleString('id-ID');

const rupiah = (value: number) =>
  'Rp ' + (Math.round(Number(value) || 0)).toLocaleString('id-ID');

const STATUS_META = {
  NO_DATE: { label: 'Tanpa tanggal', cls: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
  EXPIRED: { label: 'Kedaluwarsa', cls: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
  CRITICAL: { label: '≤ 30 hari', cls: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500' },
  WARNING: { label: '≤ 90 hari', cls: 'bg-amber-100 text-amber-700', dot: 'bg-amber-400' },
  SAFE: { label: 'Aman', cls: 'bg-emerald-50 text-emerald-600', dot: 'bg-emerald-500' },
} as const;

const FILTERS = [
  { id: '', label: 'Semua' },
  { id: 'EXPIRED', label: 'Kedaluwarsa' },
  { id: 'CRITICAL', label: '≤ 30 hari' },
  { id: 'WARNING', label: '≤ 90 hari' },
  { id: 'NO_DATE', label: 'Tanpa tanggal' },
  { id: 'SAFE', label: 'Aman' },
] as const;

function daysText(row: ExpiryRow) {
  if (row.daysLeft === null) return 'tidak ada tanggal';
  if (row.daysLeft === 0) return 'habis hari ini';
  if (row.daysLeft < 0) return `lewat ${Math.abs(row.daysLeft)} hari`;
  return `${row.daysLeft} hari lagi`;
}

export default function ExpiryMonitor({ apiFetch }: Props) {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [rows, setRows] = useState<ExpiryRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [filteredSummary, setFilteredSummary] = useState<Summary | null>(null);
  const [today, setToday] = useState('');
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('');
  const [warehouseId, setWarehouseId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/api/wms/warehouses')
      .then((r) => r.json())
      .then((data) => setWarehouses(Array.isArray(data) ? data : []))
      .catch(() => setWarehouses([]));
  }, [apiFetch]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('q', search.trim());
      if (status) params.set('status', status);
      if (warehouseId) params.set('warehouseId', warehouseId);
      params.set('limit', '2000');

      const response = await apiFetch(`/api/wms/expiry?${params.toString()}`);
      const data: ExpiryResponse = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Gagal memuat data kedaluwarsa.');
      }
      setRows(data.rows || []);
      setSummary(data.summary || null);
      setFilteredSummary(data.filteredSummary || null);
      setToday(data.today || '');
      setTotal(data.total || 0);
    } catch (err: any) {
      setError(err?.message || 'Gagal memuat data kedaluwarsa.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, search, status, warehouseId]);

  useEffect(() => {
    const timer = setTimeout(load, search ? 350 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  const source = filteredSummary || summary;

  const cards = useMemo(() => {
    if (!source) return [];
    return [
      { label: 'Batch dipantau', value: fmt(source.batches), tone: 'text-slate-900 dark:text-slate-100' },
      { label: 'Kedaluwarsa', value: fmt(source.expired), tone: 'text-red-600' },
      { label: '≤ 30 hari', value: fmt(source.critical), tone: 'text-orange-600' },
      { label: '≤ 90 hari', value: fmt(source.warning), tone: 'text-amber-600' },
      { label: 'Tanpa tanggal', value: fmt(source.noDate), tone: 'text-red-600' },
      { label: 'Nilai berisiko', value: rupiah(source.valueAtRisk), tone: 'text-slate-900 dark:text-slate-100' },
    ];
  }, [source]);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-slate-100">Expiry Monitor</h1>
          <p className="text-xs text-slate-500 mt-1">
            Batch ber-expired yang perlu dijual atau diretur lebih dulu
            {today && ` · acuan tanggal ${today}`}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari barang, batch, atau nomor terima…"
              className="pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs w-full md:w-72 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
          </div>
          <select
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          >
            <option value="">Semua gudang</option>
            {warehouses.map((wh) => (
              <option key={wh.warehouseId} value={wh.warehouseId}>{wh.warehouseName}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <button
            key={item.id || 'all'}
            onClick={() => setStatus(item.id)}
            className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-colors ${
              status === item.id
                ? 'bg-slate-900 border-slate-900 text-white dark:bg-slate-100 dark:border-slate-100 dark:text-slate-900'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {cards.map((card) => (
          <div
            key={card.label}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4"
          >
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{card.label}</p>
            <p className={`text-lg font-black mt-1 ${card.tone}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && total === 0 && (
        <div className="flex items-start gap-2 rounded-xl bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Belum ada batch yang dipantau. Data masuk otomatis saat barang diterima lewat
            menu Terima Barang dengan tanggal expired. Barang yang tidak ber-expired tidak
            akan muncul di sini.
          </span>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-100 dark:border-slate-800">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 dark:bg-slate-800/50">
            <tr>
              <th className="px-3 py-3 font-black uppercase text-slate-400">Barang</th>
              <th className="px-3 py-3 font-black uppercase text-slate-400">Gudang</th>
              <th className="px-3 py-3 font-black uppercase text-slate-400">Batch</th>
              <th className="px-3 py-3 font-black uppercase text-slate-400">Expired</th>
              <th className="px-3 py-3 font-black uppercase text-slate-400 text-right">Sisa</th>
              <th className="px-3 py-3 font-black uppercase text-slate-400 text-right">Nilai</th>
              <th className="px-3 py-3 font-black uppercase text-slate-400 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading && (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-slate-400">
                  <Package className="w-5 h-5 mx-auto mb-2 opacity-40" />
                  Menghitung sisa umur simpan…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-slate-400">
                  Tidak ada batch yang cocok dengan filter ini.
                </td>
              </tr>
            )}
            {!loading && rows.map((row) => {
              const meta = STATUS_META[row.status];
              return (
                <tr key={row.batchId} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                  <td className="px-3 py-2.5">
                    <p className="font-bold text-slate-800 dark:text-slate-200">{row.itemName}</p>
                    <p className="text-[10px] text-slate-400">
                      {row.itemId}
                      {row.category && ` · ${row.category}`}
                    </p>
                  </td>
                  <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{row.warehouseName}</td>
                  <td className="px-3 py-2.5 text-slate-500">
                    <p>{row.batchNo || '-'}</p>
                    <p className="text-[10px] text-slate-400">{row.grNo || row.batchId}</p>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <p className="font-bold text-slate-700 dark:text-slate-200">{row.expiredDate || '—'}</p>
                    <p className="text-[10px] text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {daysText(row)}
                    </p>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <p className="font-black text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {fmt(row.qtyRemainBase)} {row.unitBase}
                    </p>
                    {row.display && row.display !== `${fmt(row.qtyRemainBase)} ${row.unitBase}` && (
                      <p className="text-[10px] text-slate-400 whitespace-nowrap">{row.display}</p>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-500 whitespace-nowrap">{rupiah(row.value)}</td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${meta.cls}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                      {meta.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
