import React, { useEffect, useState } from 'react';
import Modal from '../../components/ui/Modal';
import type { PurchaseRequest } from '../../lib/types';

type Props = {
  open: boolean;
  pr?: PurchaseRequest | null;
  isSubmitting?: boolean;
  onClose: () => void;
  onSubmit: (values: PurchaseRequest) => void;
};

const statuses = [
  'WAITING MANAGER APPROVAL',
  'WAITING DIREKTUR APPROVAL',
  'WAITING CREATED PO',
  'WAITING RECEIVE',
  'FINISH',
  'Rejected',
];

export default function EditPrModal({ open, pr, isSubmitting, onClose, onSubmit }: Props) {
  const [form, setForm] = useState<PurchaseRequest | null>(null);

  useEffect(() => {
    if (open && pr) setForm({ ...pr });
  }, [open, pr]);

  if (!form) return null;

  const setField = (field: keyof PurchaseRequest, value: string) => setForm({ ...form, [field]: value });

  return (
    <Modal open={open} title={`Edit PR ${form.id || ''}`} widthClassName="max-w-3xl" onClose={onClose}>
      <form className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left" onSubmit={(e) => { e.preventDefault(); onSubmit(form); }}>
        <label className="space-y-1">
          <span className="text-[10px] font-black uppercase text-slate-400">Date</span>
          <input className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" type="date" value={form.date || ''} onChange={e => setField('date', e.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] font-black uppercase text-slate-400">Requester</span>
          <input className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" value={form.requester || ''} onChange={e => setField('requester', e.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] font-black uppercase text-slate-400">Division</span>
          <input className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" value={form.division || ''} onChange={e => setField('division', e.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] font-black uppercase text-slate-400">Supplier</span>
          <input className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" value={form.supplier || ''} onChange={e => setField('supplier', e.target.value)} />
        </label>
        <label className="space-y-1 md:col-span-2">
          <span className="text-[10px] font-black uppercase text-slate-400">Item Name</span>
          <input className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" value={form.itemName || ''} onChange={e => setField('itemName', e.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] font-black uppercase text-slate-400">Qty</span>
          <input className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" type="number" value={form.qty || ''} onChange={e => setField('qty', e.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] font-black uppercase text-slate-400">Unit</span>
          <input className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" value={form.unit || ''} onChange={e => setField('unit', e.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] font-black uppercase text-slate-400">Stock Onhand</span>
          <input className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" type="number" value={form.stockOnhand || ''} onChange={e => setField('stockOnhand', e.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] font-black uppercase text-slate-400">Avg Sales</span>
          <input className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" type="number" value={form.avgSales || ''} onChange={e => setField('avgSales', e.target.value)} />
        </label>
        <label className="space-y-1 md:col-span-2">
          <span className="text-[10px] font-black uppercase text-slate-400">PDF Link</span>
          <input className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" value={form.pdfLink || ''} onChange={e => setField('pdfLink', e.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] font-black uppercase text-slate-400">Status</span>
          <select className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" value={form.status || ''} onChange={e => setField('status', e.target.value)}>
            {statuses.map(status => <option key={status} value={status}>{status}</option>)}
          </select>
        </label>
        <label className="space-y-1 md:col-span-2">
          <span className="text-[10px] font-black uppercase text-slate-400">Notes</span>
          <textarea className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" rows={3} value={form.notes || ''} onChange={e => setField('notes', e.target.value)} />
        </label>
        <div className="md:col-span-2 flex justify-end gap-3 pt-4">
          <button type="button" onClick={onClose} className="rounded-xl bg-slate-100 px-5 py-2 text-sm font-bold text-slate-600">Cancel</button>
          <button disabled={isSubmitting} type="submit" className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-60">{isSubmitting ? 'Saving...' : 'Save PR'}</button>
        </div>
      </form>
    </Modal>
  );
}
