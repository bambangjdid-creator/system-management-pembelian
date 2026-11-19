import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, AlertTriangle, Check, Edit, RefreshCw, Save, Search, X } from '../../icons';

/**
 * Master Konversi — layar admin untuk memeriksa dan memperbaiki UNIT_CONVERSION.
 *
 * Satu baris = satu relasi `1 FROM_UNIT = TO_UNIT_QTY TO_UNIT`.
 * Baris ber-`@N` BUKAN duplikat: itu satuan multipak (mis. `@5 SAK` = 5 x 3 SAK
 * bila Qty/ = 3). Karena itu kolom "Satuan efektif" dan "Faktor" ditampilkan
 * supaya salah tafsir langsung kelihatan.
 */

type Conversion = {
  convId: string;
  itemId: string;
  itemName: string;
  level: number;
  fromUnit: string;
  toUnit: string;
  toUnitQty: number;
  isActive: boolean;
  notes: string;
  isMultiPack: boolean;
  multiPackQty: number;
  effectiveFromUnit: string;
  effectiveToUnitQty: number;
  /** Barang berlabel (DC) = sudah discontinued di iPOSS. */
  itemDiscontinued: boolean;
  /** Aktif secara efektif: barisnya aktif DAN barangnya bukan (DC). */
  effectiveActive: boolean;
  problems: string[];
  factors: Record<string, number>;
};

type Stats = {
  total: number;
  active: number;
  multiPack: number;
  problems: number;
  itemsWithConversion: number;
  duplicateRawNames: number;
  discontinued: number;
  discontinuedItems: number;
  activeAfterDiscontinued: number;
};

type ConversionResponse = {
  success: boolean;
  stats: Stats;
  total: number;
  conversions: Conversion[];
  message?: string;
};

type Props = {
  apiFetch: (url: string, options?: any) => Promise<Response>;
};

const fmt = (value: number) =>
  (Math.round((Number(value) || 0) * 1000) / 1000).toLocaleString('id-ID');

const PAGE_SIZE = 200;

export default function ConversionMaster({ apiFetch }: Props) {
  const [rows, setRows] = useState<Conversion[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState<'all' | 'Y' | 'N'>('Y');
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Baris yang sedang disunting
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ fromUnit: string; toUnit: string; toUnitQty: string; isActive: boolean; notes: string }>({
    fromUnit: '',
    toUnit: '',
    toUnitQty: '',
    isActive: true,
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [saveError, setSaveError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('q', search.trim());
      if (active !== 'all') params.set('active', active);
      if (onlyProblems) params.set('problems', '1');
      params.set('limit', String(showAll ? 2000 : PAGE_SIZE));

      const response = await apiFetch(`/api/wms/conversions?${params.toString()}`);
      const data: ConversionResponse = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Gagal memuat master konversi.');
      }
      setRows(data.conversions || []);
      setStats(data.stats || null);
      setTotal(data.total || 0);
    } catch (err: any) {
      setError(err?.message || 'Gagal memuat master konversi.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, search, active, onlyProblems, showAll]);

  useEffect(() => {
    const timer = setTimeout(load, search ? 350 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  const startEdit = (row: Conversion) => {
    setEditing(row.convId);
    setDraft({
      fromUnit: row.fromUnit,
      toUnit: row.toUnit,
      toUnitQty: String(row.toUnitQty),
      isActive: row.isActive,
      notes: row.notes,
    });
    setNotice('');
    setSaveError('');
  };

  const cancelEdit = () => {
    setEditing(null);
    setSaveError('');
  };

  const save = async (row: Conversion) => {
    setSaving(true);
    setSaveError('');
    try {
      const response = await apiFetch(`/api/wms/conversions/${encodeURIComponent(row.convId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromUnit: draft.fromUnit,
          toUnit: draft.toUnit,
          toUnitQty: Number(draft.toUnitQty.replace(',', '.')),
          isActive: draft.isActive,
          notes: draft.notes,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Gagal menyimpan konversi.');
      }
      setEditing(null);
      setNotice(data.message || 'Konversi disimpan.');
      await load();
    } catch (err: any) {
      setSaveError(err?.message || 'Gagal menyimpan konversi.');
    } finally {
      setSaving(false);
    }
  };

  const cards = useMemo(() => {
    if (!stats) return [];
    return [
      { label: 'Baris konversi', value: fmt(stats.total), tone: 'text-slate-900 dark:text-slate-100' },
      { label: 'Aktif', value: fmt(stats.active), tone: 'text-emerald-600' },
      {
        label: 'Baris barang (DC)',
        value: fmt(stats.discontinued),
        tone: stats.discontinued ? 'text-amber-600' : 'text-slate-500',
        hint: `${fmt(stats.discontinuedItems)} barang discontinued`,
      },
      { label: 'Item terkonversi', value: fmt(stats.itemsWithConversion), tone: 'text-slate-900 dark:text-slate-100' },
      { label: 'Baris multipak @N', value: fmt(stats.multiPack), tone: 'text-blue-600' },
      { label: 'Baris bermasalah', value: fmt(stats.problems), tone: stats.problems ? 'text-red-600' : 'text-slate-500' },
      { label: 'Nama ganda', value: fmt(stats.duplicateRawNames), tone: stats.duplicateRawNames ? 'text-amber-600' : 'text-slate-500' },
    ];
  }, [stats]);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-slate-100">Master Konversi</h1>
          <p className="text-xs text-slate-500 mt-1">
            Satu baris = <span className="font-bold">1 satuan asal = qty satuan tujuan</span>. Baris{' '}
            <span className="font-mono">@N</span> adalah satuan multipak, bukan duplikat.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama barang atau satuan…"
              className="pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs w-full md:w-72 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
          </div>
          <select
            value={active}
            onChange={(e) => setActive(e.target.value as 'all' | 'Y' | 'N')}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          >
            <option value="Y">Hanya aktif (tanpa barang DC)</option>
            <option value="N">Hanya non-aktif (termasuk barang DC)</option>
            <option value="all">Semua</option>
          </select>
          <button
            onClick={() => setOnlyProblems((v) => !v)}
            className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${
              onlyProblems
                ? 'bg-red-500 border-red-500 text-white'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
            }`}
          >
            Perlu perbaikan
          </button>
          <button
            onClick={load}
            className="px-3 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5 inline mr-1" /> Muat ulang
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        {cards.map((card) => (
          <div
            key={card.label}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4"
          >
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{card.label}</p>
            <p className={`text-lg font-black mt-1 ${card.tone}`}>{card.value}</p>
            {card.hint && <p className="mt-0.5 text-[10px] text-slate-400">{card.hint}</p>}
          </div>
        ))}
      </div>

      {notice && (
        <div className="flex items-start gap-2 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-700">
          <Check className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{notice}</span>
        </div>
      )}

      {(error || saveError) && (
        <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{saveError || error}</span>
        </div>
      )}

      {stats && stats.multiPack === 0 && (
        <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Belum ada baris multipak <span className="font-mono">@N</span> di{' '}
            <span className="font-mono">UNIT_CONVERSION</span>. Artinya varian seperti{' '}
            <span className="font-mono">@3 SAK</span> / <span className="font-mono">@5 SAK</span> belum bisa
            dipilih saat menerima barang. Sumbernya adalah workbook{' '}
            <span className="font-mono">Master Data Konversi.xlsx</span> yang perlu dibangun ulang — mengisi
            manual di tab hanya menambal sebagian item.
          </span>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-100 dark:border-slate-800">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 dark:bg-slate-800/50">
            <tr>
              <th className="px-3 py-3 font-black uppercase text-slate-400">Barang</th>
              <th className="px-3 py-3 font-black uppercase text-slate-400">Relasi</th>
              <th className="px-3 py-3 font-black uppercase text-slate-400">Satuan efektif</th>
              <th className="px-3 py-3 font-black uppercase text-slate-400 text-right">Faktor</th>
              <th className="px-3 py-3 font-black uppercase text-slate-400">Catatan</th>
              <th className="px-3 py-3 font-black uppercase text-slate-400 text-center">Status</th>
              <th className="px-3 py-3 font-black uppercase text-slate-400 text-center">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading && (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-slate-400">Memuat master konversi…</td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-slate-400">
                  Tidak ada baris konversi yang cocok dengan filter ini.
                </td>
              </tr>
            )}
            {!loading && rows.map((row) => {
              const isEditing = editing === row.convId;
              const baseUnit = Object.entries(row.factors)
                .filter(([, factor]) => factor === 1)
                .map(([unit]) => unit)[0] || '';
              const totalToBase = row.isMultiPack
                ? row.factors[row.effectiveFromUnit]
                : row.factors[row.fromUnit];

              return (
                <tr key={row.convId} className={row.problems.length ? 'bg-red-50/40 dark:bg-red-950/10' : ''}>
                  <td className="px-3 py-2.5 max-w-[240px]">
                    <p className="font-bold text-slate-800 dark:text-slate-200 truncate" title={row.itemName}>
                      {row.itemName || '(nama kosong)'}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {row.itemId} · {row.convId}
                      {row.level ? ` · level ${row.level}` : ''}
                    </p>
                  </td>
                  <td className="px-3 py-2.5">
                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <input
                          value={draft.fromUnit}
                          onChange={(e) => setDraft({ ...draft, fromUnit: e.target.value })}
                          className="w-20 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] uppercase"
                        />
                        <span className="text-slate-400">=</span>
                        <input
                          value={draft.toUnitQty}
                          onChange={(e) => setDraft({ ...draft, toUnitQty: e.target.value })}
                          className="w-16 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] text-right"
                        />
                        <input
                          value={draft.toUnit}
                          onChange={(e) => setDraft({ ...draft, toUnit: e.target.value })}
                          className="w-20 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] uppercase"
                        />
                      </div>
                    ) : (
                      <p className="font-mono text-slate-700 dark:text-slate-200 whitespace-nowrap">
                        1 {row.fromUnit} = {fmt(row.toUnitQty)} {row.toUnit}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">
                    {row.isMultiPack ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-bold">
                        @{row.multiPackQty} → {fmt(row.effectiveToUnitQty)} {row.effectiveFromUnit}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    {totalToBase ? (
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        1 {row.fromUnit} = {fmt(totalToBase)} {baseUnit}
                      </span>
                    ) : (
                      <span className="text-slate-400">tidak terhubung</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 max-w-[220px]">
                    {isEditing ? (
                      <input
                        value={draft.notes}
                        onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                        className="w-full px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px]"
                      />
                    ) : (
                      <>
                        {row.problems.length > 0 && (
                          <p className="text-[10px] font-bold text-red-600">{row.problems.join(' · ')}</p>
                        )}
                        {row.notes && (
                          <p className="text-[10px] text-slate-400 truncate" title={row.notes}>{row.notes}</p>
                        )}
                        {!row.problems.length && !row.notes && <span className="text-slate-300">—</span>}
                      </>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {isEditing ? (
                      <button
                        onClick={() => setDraft({ ...draft, isActive: !draft.isActive })}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          draft.isActive ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {draft.isActive ? 'AKTIF' : 'NON-AKTIF'}
                      </button>
                    ) : (
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          row.isActive ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {row.isActive ? 'AKTIF' : 'NON-AKTIF'}
                      </span>
                    )}
                    {row.itemDiscontinued && (
                      <span
                        title="Barang ini sudah discontinued (nama berlabel (DC)). Baris konversinya tetap disimpan sebagai riwayat."
                        className="ml-1 inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-dashed border-slate-300"
                      >
                        BARANG (DC)
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-center whitespace-nowrap">
                    {isEditing ? (
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => save(row)}
                          disabled={saving}
                          className="p-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                          title="Simpan"
                        >
                          <Save className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"
                          title="Batal"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEdit(row)}
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"
                        title="Ubah konversi"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
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
