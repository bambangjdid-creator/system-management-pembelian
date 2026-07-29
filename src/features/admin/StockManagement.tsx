import React from 'react';
import { Edit, Plus, Trash2 } from '../../icons';

type Props = {
  stock: any[];
  onAddStock: () => void;
  onEditStock: (stock: any) => void;
  onDeleteStock: (id: number) => void;
};

export default function StockManagement({ stock, onAddStock, onEditStock, onDeleteStock }: Props) {
  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-slate-100 flex justify-between items-center">
        <h3 className="font-bold text-slate-800">Master Stock</h3>
        <button onClick={onAddStock} className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2"><Plus className="w-4 h-4" /> Add Item</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Item Name</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Supplier</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Unit</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Category</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {stock.map((s) => (
              <tr key={s.id || s.name}>
                <td className="px-6 py-4 font-bold text-slate-800">{s.name}</td>
                <td className="px-6 py-4 text-slate-600">{s.supplier}</td>
                <td className="px-6 py-4 text-slate-600">{s.unit}</td>
                <td className="px-6 py-4 font-bold text-indigo-600">{s.category}</td>
                <td className="px-6 py-4 flex gap-1">
                  <button onClick={() => onEditStock(s)} className="p-2 text-indigo-500 hover:bg-indigo-50 rounded-lg"><Edit className="w-4 h-4" /></button>
                  <button onClick={() => onDeleteStock(s.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
