import React, { useEffect, useMemo, useState } from 'react';
import Modal from '../../components/ui/Modal';
import { AlertCircle } from '../../icons';
import { useAppContext } from '../../store/AppContext';
import type { ReceiveFormData, ReceiveItem } from '../../lib/types';
import ReceiveItemRow from './ReceiveItemRow';

type Props = {
  pr: any | null;
  onClose: () => void;
  onSuccess?: (grNo: string, grPdfLink?: string) => void;
};

function todayIso() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function ReceiveForm({ pr, onClose, onSuccess }: Props) {
  const ctx = useAppContext();
  const [formData, setFormData] = useState<ReceiveFormData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [doNo, setDoNo] = useState('');
  const [driverName, setDriverName] = useState('');
  const [licensePlate, setLicensePlate] = useState('');
  const [checkerBy, setCheckerBy] = useState('');
  const [receivedDate, setReceivedDate] = useState(todayIso());
  const [submitting, setSubmitting] = useState(false);
  const [successGrNo, setSuccessGrNo] = useState('');
  const [successGrPdfLink, setSuccessGrPdfLink] = useState('');
  const [wmsInfo, setWmsInfo] = useState<{ written: number; batches: number; notes: string[] } | null>(null);
  const [wmsEnabled, setWmsEnabled] = useState(false);

  const poNo = pr?.poNumber || pr?.poNo || '';

  useEffect(() => {
    if (!pr || !poNo) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    setSuccessGrNo('');
    setSuccessGrPdfLink('');
    setCheckerBy(ctx.user?.fullName || ctx.user?.displayName || ctx.user?.username || '');
    setReceivedDate(todayIso());
    setDoNo('');
    setDriverName('');
    setLicensePlate('');

    ctx.apiFetch(`/api/po/receive/${encodeURIComponent(poNo)}`)
      .then(async (res) => {
        const result = await res.json();
        if (!res.ok || !result.success) throw new Error(result.message || 'Gagal memuat data PO.');
        if (cancelled) return;
        const items: ReceiveItem[] = (result.items || []).map((it: any) => {
          // Satuan default: satuan PO bila punya konversi, kalau tidak satuan dasar.
          const allowed = it.wms?.allowedUnits || [];
          const poUnit = String(it.unit || '').toUpperCase();
          const hasPoUnit = allowed.some((u: any) => u.unit.toUpperCase() === poUnit);
          const defaultUnit = hasPoUnit ? poUnit : (allowed[0]?.unit || it.unit || '');
          const qty = it.qtyTerima === '' || it.qtyTerima == null ? it.qty : it.qtyTerima;
          return {
            ...it,
            qtyTerima: qty,
            keterangan: it.keterangan || '',
            unitTerima: defaultUnit,
            batches: [{ batchNo: '', expiredDate: '', qty }],
          };
        });
        setWmsEnabled(Boolean(result.wmsEnabled));
        setFormData({ ...result.po, items });
      })
      .catch((err: any) => {
        if (!cancelled) setError(err.message || 'Gagal memuat data PO.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pr, poNo]);

  const updateItem = (index: number, patch: Partial<ReceiveItem>) => {
    setFormData((prev) => {
      if (!prev) return prev;
      const items = prev.items.map((it, i) => (i === index ? { ...it, ...patch } : it));
      return { ...prev, items };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData) return;

    // Validasi sisi klien: mencegah round-trip untuk kesalahan yang jelas.
    for (const item of formData.items) {
      const qty = Number(item.qtyTerima) || 0;
      if (qty <= 0) continue;
      if (item.wms?.trackExpiry) {
        const batches = item.batches && item.batches.length
          ? item.batches
          : [{ batchNo: '', expiredDate: '', qty }];
        if (batches.some((b: any) => !b.expiredDate)) {
          setError(`Tanggal expired wajib diisi untuk "${item.itemName}".`);
          return;
        }
        const total = batches.reduce((sum: number, b: any) => sum + (Number(b.qty) || 0), 0);
        if (Math.abs(total - qty) > 0.0001) {
          setError(`Total qty batch "${item.itemName}" (${total}) harus sama dengan Qty Terima (${qty}).`);
          return;
        }
      }
    }

    setSubmitting(true);
    setError('');
    try {
      const res = await ctx.apiFetch('/api/po/receive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prId: pr.id,
          poNo,
          doNo,
          driverName,
          licensePlate,
          checkerBy,
          receivedDate,
          items: formData.items.map((it) => ({
            podId: it.podId,
            qtyTerima: Number(it.qtyTerima) || 0,
            keterangan: it.keterangan || '',
            unitTerima: it.unitTerima || it.unit || '',
            batches: (it.batches || []).map((b) => ({
              batchNo: b.batchNo || '',
              expiredDate: b.expiredDate || '',
              qty: Number(b.qty) || 0,
            })),
          })),
        }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.message || 'Gagal menyimpan data.');

      await ctx.fetchPRs();
      await ctx.fetchPOs();
      await ctx.fetchStats();

      setSuccessGrNo(result.grNo || '');
      setSuccessGrPdfLink(result.grPdfLink || '');
      setWmsInfo(result.wms || null);
      onSuccess?.(result.grNo || '', result.grPdfLink || '');
    } catch (err: any) {
      setError(err.message || 'Gagal menyimpan data.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!pr) return null;

  const needsAttention = (formData?.items || []).flatMap((item) => {
    const notes: string[] = [];
    const qty = Number(item.qtyTerima) || 0;
    if (qty > 0 && item.wms?.trackExpiry) {
      const batches = item.batches || [];
      if (batches.some((b) => !b.expiredDate)) notes.push(`${item.itemName}: expired belum diisi`);
      const total = batches.reduce((sum, b) => sum + (Number(b.qty) || 0), 0);
      if (batches.length && Math.abs(total - qty) > 0.0001) {
        notes.push(`${item.itemName}: total batch (${total}) ≠ qty terima (${qty})`);
      }
    }
    if (qty > 0 && wmsEnabled && !item.wms?.matched) {
      notes.push(`${item.itemName}: belum ada di Master Data WMS`);
    }
    return notes;
  });

  const grPdfUrl = !successGrNo
    ? ''
    : successGrPdfLink.startsWith('http')
      ? successGrPdfLink
      : `/api/pdf/gr/${encodeURIComponent(String(successGrNo).replace(/\//g, '_'))}.pdf`;

  return (
    <Modal open={Boolean(pr)} title="Penerimaan Barang (Receive PO)" widthClassName="max-w-4xl" onClose={onClose}>
      {successGrNo ? (
        <div className="text-center py-8">
          <p className="text-emerald-600 font-black text-lg uppercase">Berhasil!</p>
          <p className="text-sm text-slate-500 mt-2">Barang berhasil diterima.</p>
          <p className="mt-4 text-xs font-bold text-slate-400 uppercase">Nomor GR</p>
          <p className="text-xl font-black text-indigo-600 font-mono">{successGrNo}</p>
          {grPdfUrl && (
            <a
              href={grPdfUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-block mt-4 px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all"
            >
              Buka Berita Acara GR (PDF)
            </a>
          )}
          {wmsInfo && (wmsInfo.written > 0 || wmsInfo.notes.length > 0) && (
            <div className="mt-5 mx-auto max-w-md text-left rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                Stok Gudang (WMS)
              </p>
              <p className="text-[11px] text-slate-600">
                {wmsInfo.written} item tercatat ke ledger
                {wmsInfo.batches > 0 && ` · ${wmsInfo.batches} batch expired`}
              </p>
              {wmsInfo.notes.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {wmsInfo.notes.map((note, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-[11px] text-amber-700">
                      <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                      {note}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="mt-6">
            <button onClick={onClose} className="px-6 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200 transition-all">
              Tutup
            </button>
          </div>
        </div>
      ) : loading ? (
        <p className="text-center text-sm text-slate-400 py-10">Memuat data PO...</p>
      ) : error && !formData ? (
        <div className="text-center py-8">
          <p className="text-red-500 text-sm font-bold">{error}</p>
          <button onClick={onClose} className="mt-4 px-6 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200 transition-all">
            Tutup
          </button>
        </div>
      ) : formData ? (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-[9px] font-black uppercase text-slate-400">No. PR</p>
              <p className="font-bold text-indigo-600">{pr.id}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-[9px] font-black uppercase text-slate-400">No. PO</p>
              <p className="font-bold text-indigo-600">{poNo}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-[9px] font-black uppercase text-slate-400">Supplier</p>
              <p className="font-bold text-slate-800">{formData.supplier || '-'}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-[9px] font-black uppercase text-slate-400">Gudang</p>
              <p className="font-bold text-slate-800">{formData.division || '-'}</p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-100">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-3 font-black uppercase text-slate-400">No.</th>
                  <th className="px-3 py-3 font-black uppercase text-slate-400">Nama Barang</th>
                  <th className="px-3 py-3 font-black uppercase text-slate-400 text-center">Satuan</th>
                  <th className="px-3 py-3 font-black uppercase text-slate-400 text-center">Qty Order</th>
                  <th className="px-3 py-3 font-black uppercase text-slate-400 text-center">Qty Terima</th>
                  <th className="px-3 py-3 font-black uppercase text-slate-400">Keterangan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {formData.items.map((item, idx) => (
                  <ReceiveItemRow
                    key={item.podId || idx}
                    item={item}
                    index={idx}
                    onChange={(patch) => updateItem(idx, patch)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {needsAttention.length > 0 && (
            <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 p-3 text-[11px] text-amber-800">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <b>{needsAttention.length} item</b> perlu perhatian sebelum disimpan:
                <ul className="mt-1 list-disc list-inside space-y-0.5">
                  {needsAttention.slice(0, 5).map((note, i) => (
                    <li key={i}>{note}</li>
                  ))}
                  {needsAttention.length > 5 && <li>…dan {needsAttention.length - 5} lainnya</li>}
                </ul>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block space-y-1">
              <span className="text-[10px] font-black uppercase text-slate-400">Nomor GR (otomatis)</span>
              <input
                readOnly
                value={formData.suggestedGrNo || formData.grNo || 'GR akan dibuat otomatis'}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-mono font-bold text-indigo-600 outline-none"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] font-black uppercase text-slate-400">Tanggal Terima</span>
              <input
                type="date"
                required
                value={receivedDate}
                onChange={(e) => setReceivedDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] font-black uppercase text-slate-400">No. DO / Surat Jalan</span>
              <input
                required
                value={doNo}
                onChange={(e) => setDoNo(e.target.value)}
                placeholder="Masukkan Nomor DO/Surat Jalan"
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] font-black uppercase text-slate-400">Nama Supir</span>
              <input
                required
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
                placeholder="Masukkan Nama Supir"
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] font-black uppercase text-slate-400">No. Polisi Kendaraan</span>
              <input
                required
                value={licensePlate}
                onChange={(e) => setLicensePlate(e.target.value)}
                placeholder="e.g. B 1234 ABC"
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] font-black uppercase text-slate-400">Checker By</span>
              <input
                required
                value={checkerBy}
                onChange={(e) => setCheckerBy(e.target.value)}
                placeholder="Nama Penerima/Pemeriksa"
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </label>
          </div>

          {error && <p className="text-xs font-bold text-red-500">{error}</p>}

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200 transition-all">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all disabled:opacity-60">
              {submitting ? 'Menyimpan...' : 'Simpan Penerimaan'}
            </button>
          </div>
        </form>
      ) : null}
    </Modal>
  );
}
