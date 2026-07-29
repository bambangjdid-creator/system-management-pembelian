import React, { useEffect, useState } from 'react';
import Modal from '../../components/ui/Modal';
import type { StockItem } from '../../lib/types';

type StockForm = {
  name: string;
  category: string;
  supplier: string;
  unit: string;
  price: string | number;
};

type Props = {
  open: boolean;
  mode: 'add' | 'edit';
  stock?: StockItem | null;
  isSubmitting?: boolean;
  onClose: () => void;
  onSubmit: (values: StockForm) => void;
};

const emptyForm: StockForm = { name: '', category: '', supplier: '', unit: '', price: '' };

export default function StockFormModal({ open, mode, stock, isSubmitting, onClose, onSubmit }: Props) {
  const [form, setForm] = useState<StockForm>(emptyForm);

  useEffect(() => {
    if (!open) return;
    setForm(mode === 'edit' && stock ? {
      name: stock.name || '',
      category: stock.category || '',
      supplier: stock.supplier || '',
      unit: stock.unit || '',
      price: stock.price || '',
    } : emptyForm);
  }, [open, mode, stock]);

  return (
    <Modal open={open} title={mode === 'add' ? 'Add New Item' : 'Edit Item'} onClose={onClose}>
      <form className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left" onSubmit={(e) => { e.preventDefault(); onSubmit(form); }}>
        <label className="space-y-1 md:col-span-2">
          <span className="text-[10px] font-black uppercase text-slate-400">Item Name</span>
          <input className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] font-black uppercase text-slate-400">Category</span>
          <input className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] font-black uppercase text-slate-400">Supplier</span>
          <input className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] font-black uppercase text-slate-400">Unit</span>
          <input className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] font-black uppercase text-slate-400">Initial Price</span>
          <input className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" type="number" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} />
        </label>
        <div className="md:col-span-2 flex justify-end gap-3 pt-4">
          <button type="button" onClick={onClose} className="rounded-xl bg-slate-100 px-5 py-2 text-sm font-bold text-slate-600">Cancel</button>
          <button disabled={isSubmitting} type="submit" className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-60">{isSubmitting ? 'Saving...' : 'Save Item'}</button>
        </div>
      </form>
    </Modal>
  );
}
