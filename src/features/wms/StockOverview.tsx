import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, ArrowLeft, Package, Search } from '../../icons';

/**
 * Stok Gudang — saldo per item x gudang, dihitung langsung dari STOCK_LEDGER.
 *
 * Angka utama selalu satuan terkecil (PCS/KG) karena itulah yang tersimpan di
 * ledger. Satuan besar ditampilkan sebagai kemudahan membaca, bukan sumber angka.
 */

type StockRow = {
  itemId: string;
  itemName: string;
  category: string;
  iposCode: string;
  unitBase: string;
  trackExpiry: boolean;
  warehouseId: string;
  warehouseName: string;
  qtyBase: number;
  breakdown: { unit: string; qty: number }[];
  display: string;
  minStock: number;
  maxStock: number;
  status: 'EMPTY' | 'LOW' | 'OK' | 'OVER';
  lastTrxDate: string;
};

type Summary = {
  rows: number;
  items: number;
  warehouses: number;
  totalQtyBase: number;
  lowCount: number;
  emptyCount: number;
};

type StockResponse = {
  success: boolean;
  summary: Summary;
  filteredSummary: Summary;
  total: number;
  limit: number;
  offset: number;
  rows: StockRow[];
};

type Movement = {
  trxId: string;
  trxDate: string;
  trxType: string;
  refNo: string;
  warehouseName: string;
  qtyIn: number;
  qtyOut: number;
  unit: string;
  qtyBase: number;
  runningBase: number;
  notes: string;
};

type Warehouse = { warehouseId: string; warehouseName: string };

type Props = {
  apiFetch: (url: string, options?: any) => Promise<Response>;
};

const PAGE_SIZE = 100;

const fmt = (value: number) => {
  const n = Math.round((Number(value) || 0) * 1000) / 1000;
  return n.toLocaleString('id-ID');
};

function StatusBadge({ status }: { status: StockRow['status'] }) {
  const map = {
    EMPTY: { label: 'Habis', cls: 'bg-slate-100 text-slate-500' },
    LOW: { label: 'Di bawah min.', cls: 'bg-amber-100 text-amber-700' },
    OK: { label: 'Aman', cls: 'bg-emerald-50 text-emerald-600' },
    OVER: { label: 'Berlebih', cls: 'bg-blue-50 text-blue-600' },
  } as const;
  const item = map[status];
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${item.cls}`}>{item.label}</span>
  );
}

export default function StockOverview({ apiFetch }: Props) {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [rows, setRows] = useState<StockRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [filteredSummary, setFilteredSummary] = useState<Summary | null>(null);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [belowMin, setBelowMin] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Kartu stok
  const [selected, setSelected] = useState<StockRow | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loadingMovements, setLoadingMovements] = useState(false);

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
      if (warehouseId) params.set('warehouseId', warehouseId);
      if (belowMin) params.set('belowMin', '1');
      params.set('limit', String(showAll ? 2000 : PAGE_SIZE));

      const response = await apiFetch(`/api/wms/stock?${params.toString()}`);
      const data: StockResponse = await response.json();
      if (!response.ok || !data.success) {
        throw new Error((data as any).message || 'Gagal memuat stok.');
      }
      setRows(data.rows || []);
      setSummary(data.summary || null);
      setFilteredSummary(data.filteredSummary || null);
      setTotal(data.total || 0);
    } catch (err: any) {
      setError(err?.message || 'Gagal memuat stok gudang.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, search, warehouseId, belowMin, showAll]);

  useEffect(() => {
    const timer = setTimeout(load, search ? 350 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  const openMovements = async (row: StockRow) => {
    setSelected(row);
    setLoadingMovements(true);
    setMovements([]);
    try {
      const params = new URLSearchParams();
      if (row.warehouseId) params.set('warehouseId', row.warehouseId);
      const response = await apiFetch(
        `/api/wms/stock/${encodeURIComponent(row.itemId)}/movements?${params.toString()}`
      );
      const data = await response.json();
      setMovements(response.ok && data.success ? data.movements || [] : []);
    } catch {
      setMovements([]);
    } finally {
      setLoadingMovements(false);
    }
  };

  const cards = useMemo(() => {
    const source = filteredSummary || summary;
    if (!source) return [];
    return [
      { label: 'Item × Gudang', value: fmt(source.rows), tone: 'text-slate-900 dark:text-slate-100' },
      { label: 'Item Unik', value: fmt(source.items), tone: 'text-slate-900 dark:text-slate-100' },
      { label: 'Gudang', value: fmt(source.warehouses), tone: 'text-slate-900 dark:text-slate-100' },
      { label: 'Di Bawah Minimum', value: fmt(source.lowCount), tone: 'text-amber-600' },
      { label: 'Stok Habis', value: fmt(source.emptyCount), tone: 'text-slate-500' },
    ];
  }, [summary, filteredSummary]);

  if (selected) {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
        <button
          onClick={() => setSelected(null)}
          className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-blue-600 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Kembali ke daftar stok
        </button>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Kartu Stok</p>
          <h2 className="text-lg font-black text-slate-900 dark:text-slate-100 mt-1">{selected.itemName}</h2>
          <p className="text-xs text-slate-500 mt-1">
            {selected.warehouseName} · {selected.itemId}
            {selected.iposCode && ` · iPOSS ${selected.iposCode}`}
          </p>
          <div className="mt-4 flex flex-wrap items-baseline gap-2">
            <span className="text-2xl font-black text-blue-600">
              {fmt(selected.qtyBase)} {selected.unitBase}
            </span>
            {selected.breakdown.length > 1 && (
              <span className="text-xs font-bold text-slate-400">
                setara {selected.display}
              </span>
            )}
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-100 dark:border-slate-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                <th className="px-3 py-3 font-black uppercase text-slate-400">Tanggal</th>
                <th className="px-3 py-3 font-black uppercase text-slate-400">Tipe</th>
                <th className="px-3 py-3 font-black uppercase text-slate-400">Referensi</th>
                <th className="px-3 py-3 font-black uppercase text-slate-400 text-right">Masuk</th>
                <th className="px-3 py-3 font-black uppercase text-slate-400 text-right">Keluar</th>
                <th className="px-3 py-3 font-black uppercase text-slate-400 text-right">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loadingMovements && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-slate-400">Memuat riwayat…</td>
                </tr>
              )}
              {!loadingMovements && movements.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-slate-400">
                    Belum ada mutasi untuk item ini di gudang tersebut.
                  </td>
                </tr>
              )}
              {movements.map((row) => (
                <tr key={row.trxId} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                  <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300 whitespace-nowrap">{row.trxDate || '-'}</td>
                  <td className="px-3 py-2.5">
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-500">
                      {row.trxType || '-'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-slate-500 max-w-[220px] truncate" title={row.notes}>
                    {row.refNo || row.notes || '-'}
                  </td>
                  <td className="px-3 py-2.5 text-right font-bold text-emerald-600">
                    {row.qtyBase > 0 ? `+${fmt(row.qtyBase)}` : ''}
                  </td>
                  <td className="px-3 py-2.5 text-right font-bold text-red-500">
                    {row.qtyBase < 0 ? fmt(row.qtyBase) : ''}
                  </td>
                  <td className="px-3 py-2.5 text-right font-black text-slate-900 dark:text-slate-100">
                    {fmt(row.runningBase)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-slate-100">Stok Gudang</h1>
          <p className="text-xs text-slate-500 mt-1">
            Saldo dihitung ulang dari buku besar mutasi setiap kali halaman dibuka.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama atau kode barang…"
              className="pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs w-full md:w-64 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
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
          <button
            onClick={() => setBelowMin((v) => !v)}
            className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${
              belowMin
                ? 'bg-amber-500 border-amber-500 text-white'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
            }`}
          >
            Di bawah minimum
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {cards.map((card) => (
          <div
            key={card.label}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4"
          >
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{card.label}</p>
            <p className={`text-xl font-black mt-1 ${card.tone}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-100 dark:border-slate-800">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 dark:bg-slate-800/50">
            <tr>
              <th className="px-3 py-3 font-black uppercase text-slate-400">Nama Barang</th>
              <th className="px-3 py-3 font-black uppercase text-slate-400">Kategori</th>
              <th className="px-3 py-3 font-black uppercase text-slate-400">Gudang</th>
              <th className="px-3 py-3 font-black uppercase text-slate-400 text-right">Saldo</th>
              <th className="px-3 py-3 font-black uppercase text-slate-400 text-center">Status</th>
              <th className="px-3 py-3 font-black uppercase text-slate-400">Mutasi Terakhir</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-slate-400">
                  <Package className="w-5 h-5 mx-auto mb-2 opacity-40" />
                  Menghitung saldo dari buku besar…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-slate-400">
                  {search || warehouseId || belowMin
                    ? 'Tidak ada barang yang cocok dengan filter ini.'
                    : 'Belum ada stok tercatat. Mulai dengan menu Stok Awal Gudang.'}
                </td>
              </tr>
            )}
            {!loading && rows.map((row) => (
              <tr
                key={`${row.itemId}-${row.warehouseId}`}
                onClick={() => openMovements(row)}
                className="hover:bg-blue-50/50 dark:hover:bg-slate-800/30 cursor-pointer transition-colors"
              >
                <td className="px-3 py-2.5">
                  <p className="font-bold text-slate-800 dark:text-slate-200">{row.itemName}</p>
                  <p className="text-[10px] text-slate-400">
                    {row.itemId}
                    {row.iposCode && ` · ${row.iposCode}`}
                    {row.trackExpiry && ' · ber-expired'}
                  </p>
                </td>
                <td className="px-3 py-2.5 text-slate-500">{row.category || '-'}</td>
                <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{row.warehouseName}</td>
                <td className="px-3 py-2.5 text-right">
                  <p className="font-black text-slate-900 dark:text-slate-100 whitespace-nowrap">
                    {fmt(row.qtyBase)} {row.unitBase}
                  </p>
                  {row.breakdown.length > 1 && (
                    <p className="text-[10px] text-slate-400 whitespace-nowrap">{row.display}</p>
                  )}
                </td>
                <td className="px-3 py-2.5 text-center"><StatusBadge status={row.status} /></td>
                <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">{row.lastTrxDate || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!loading && total > rows.length && (
        <button
          onClick={() => setShowAll(true)}
          className="w-full py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          Tampilkan semua {fmt(total)} baris (sekarang {fmt(rows.length)})
        </button>
      )}
    </motion.div>
  );
}
