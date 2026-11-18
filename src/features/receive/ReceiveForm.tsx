import React, { useEffect, useState } from 'react';
import Modal from '../../components/ui/Modal';
import { useAppContext } from '../../store/AppContext';
import type { ReceiveFormData, ReceiveItem } from '../../lib/types';

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
        const items: ReceiveItem[] = (result.items || []).map((it: any) => ({
          ...it,
          qtyTerima: it.qtyTerima === '' || it.qtyTerima == null ? it.qty : it.qtyTerima,
          keterangan: it.keterangan || '',
        }));
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
      onSuccess?.(result.grNo || '', result.grPdfLink || '');
    } catch (err: any) {
      setError(err.message || 'Gagal menyimpan data.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!pr) return null;

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
                  <th className="px-4 py-3 font-black uppercase text-slate-400">No.</th>
                  <th className="px-4 py-3 font-black uppercase text-slate-400">Nama Barang</th>
                  <th className="px-4 py-3 font-black uppercase text-slate-400 text-center">Satuan</th>
                  <th className="px-4 py-3 font-black uppercase text-slate-400 text-center">Qty Order</th>
                  <th className="px-4 py-3 font-black uppercase text-slate-400 text-center">Qty Terima</th>
                  <th className="px-4 py-3 font-black uppercase text-slate-400">Keterangan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {formData.items.map((item, idx) => (
                  <tr key={item.podId || idx}>
                    <td className="px-4 py-2.5 text-slate-500">{idx + 1}</td>
                    <td className="px-4 py-2.5 font-bold text-slate-800">{item.itemName}</td>
                    <td className="px-4 py-2.5 text-center text-slate-500">{item.unit}</td>
                    <td className="px-4 py-2.5 text-center font-bold text-slate-700">{item.qty}</td>
                    <td className="px-4 py-2.5">
                      <input
                        type="number"
                        min={0}
                        max={Number(item.qty) || 0}
                        required
                        value={item.qtyTerima ?? ''}
                        onChange={(e) => updateItem(idx, { qtyTerima: e.target.value })}
                        className="w-24 rounded-lg border border-slate-200 px-2.5 py-1.5 text-center font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <input
                        type="text"
                        value={item.keterangan || ''}
                        onChange={(e) => updateItem(idx, { keterangan: e.target.value })}
                        placeholder="Keterangan (wajib jika kurang)"
                        className="w-full min-w-[160px] rounded-lg border border-slate-200 px-2.5 py-1.5 focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

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
