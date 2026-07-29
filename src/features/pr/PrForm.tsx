import React from 'react';
import { motion } from 'framer-motion';
import { Plus, X } from '../../icons';

import { useAppContext } from '../../store/AppContext';


export default function PrForm() {
  const ctx = useAppContext();
  const {
    activeTab,
    canSee,
    user,
    statsLoading,
    stats,
    fetchStats,
    prForm,
    setPrForm,
    suppliers,
    stockMaster,
    calculateAvg,
    calculateEstimasi,
    addItem,
    removeItem,
    updateItem,
    handleSubmitPR,
    isLoading,
    prList,
    poList,
    searchStatus,
    setSearchStatus,
    searchDivision,
    setSearchDivision,
    searchSupplierPR,
    setSearchSupplierPR,
    suppliersFromPR,
    searchDivisionPO,
    setSearchDivisionPO,
    searchSupplierPO,
    setSearchSupplierPO,
    searchDivisionApproval,
    setSearchDivisionApproval,
    openPRDetail,
    openPODetail,
    handleEditPR,
    handleFinishPR,
    handleDeletePR,
    handleAction,
    openPOForm,
    poForm,
    setPoForm,
    handleSubmitPO,
  } = ctx;

  return (
    <>
{activeTab === 'create-pr' && canSee('CREATE PR') && (
  <motion.div key="form" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm max-w-2xl mx-auto">
    <div className="mb-8 flex justify-between items-start">
      <div>
        <h3 className="text-xl font-bold text-slate-900 uppercase">NEW PURCHASE REQUEST</h3>
        <p className="text-xs text-slate-500 font-bold mt-1">NO PR: <span className="text-indigo-600">AUTO-GENERATED</span></p>
      </div>
      <div className="text-right">
        <p className="text-xs font-black text-slate-400 uppercase">Requester</p>
        <p className="text-sm font-bold text-slate-800">{user.displayName}</p>
        <p className="text-[10px] font-bold text-indigo-500">{user.division}</p>
      </div>
    </div>
    
    <form onSubmit={handleSubmitPR} className="space-y-6">
      <div>
        <label className="block text-sm font-bold text-slate-700 mb-2">Supplier</label>
        <select className="w-full px-4 py-3 rounded-xl border border-slate-200" value={prForm.supplier} onChange={e => setPrForm({...prForm, supplier: e.target.value})} required>
          <option value="">Select Supplier</option>
          {suppliers.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="space-y-6 max-h-[500px] overflow-y-auto pr-2 pb-4">
        {prForm.items.map((item, index) => (
          <div key={index} className="p-6 bg-slate-50 rounded-2xl border border-slate-200 relative group">
            {prForm.items.length > 1 && (
              <button type="button" onClick={() => removeItem(index)} className="absolute -top-3 -right-3 w-8 h-8 bg-red-100 text-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <X className="w-4 h-4" />
              </button>
            )}
            
            <div className="mb-4">
              <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-wider">Item #{index + 1}</label>
              <select className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white" value={item.itemName} onChange={e => updateItem(index, 'itemName', e.target.value)} required disabled={!prForm.supplier}>
                <option value="">Select Item</option>
                {stockMaster.filter(s => s.supplier === prForm.supplier).map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-wider">Qty Requested</label>
                <div className="relative">
                  <input type="number" className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white" value={item.qty} onChange={e => updateItem(index, 'qty', e.target.value)} required />
                  <span className="absolute right-4 top-3 text-xs font-bold text-slate-400">{item.unit}</span>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-wider">Stock Onhand</label>
                <input type="number" className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white" value={item.stockOnhand} onChange={e => updateItem(index, 'stockOnhand', e.target.value)} required />
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-100 mb-4">
              <div className="flex justify-between items-center mb-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sales History (B1-B3)</label>
                <div className="text-right">
                   <p className="text-[9px] font-bold text-slate-400 uppercase">Avg</p>
                   <p className="text-xs font-black text-indigo-600">{calculateAvg(item).toFixed(1)}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <input type="number" placeholder="B1" className="w-full px-3 py-2 rounded-lg border border-slate-100 bg-slate-50 text-xs" value={item.b1} onChange={e => updateItem(index, 'b1', e.target.value)} />
                <input type="number" placeholder="B2" className="w-full px-3 py-2 rounded-lg border border-slate-100 bg-slate-50 text-xs" value={item.b2} onChange={e => updateItem(index, 'b2', e.target.value)} />
                <input type="number" placeholder="B3" className="w-full px-3 py-2 rounded-lg border border-slate-100 bg-slate-50 text-xs" value={item.b3} onChange={e => updateItem(index, 'b3', e.target.value)} />
              </div>
              <div className="pt-2 border-t border-slate-50">
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Estimasi</p>
                 <p className="text-xs font-bold text-indigo-600">
                   Estimasi stock untuk penjualan {Math.round(calculateEstimasi(item))} hari
                 </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <button type="button" onClick={addItem} className="w-full py-3 border-2 border-dashed border-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center gap-2 font-bold hover:bg-indigo-50 transition-all mb-4">
        <Plus className="w-4 h-4" /> Add Item
      </button>

      <div className="mb-8">
        <label className="block text-sm font-bold text-slate-700 mb-2">Overall Notes (Optional)</label>
        <textarea 
          className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all outline-none" 
          rows={3} 
          value={prForm.notes || ''} 
          onChange={e => setPrForm({...prForm, notes: e.target.value})} 
          placeholder="Masukkan catatan tambahan di sini..."
        ></textarea>
      </div>

      <button type="submit" disabled={isLoading} className="w-full bg-indigo-600 text-white font-bold py-4 rounded-xl shadow-lg hover:translate-y-[-2px] transition-all">
        {isLoading ? 'SUBMITTING...' : 'SUBMIT PURCHASE REQUEST'}
      </button>
    </form>
  </motion.div>
)}
    </>
  );
}
