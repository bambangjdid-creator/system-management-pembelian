import React from 'react';
import { motion } from 'framer-motion';
import { ShoppingBag, X } from '../../icons';
import { WAREHOUSE_ADDRESS_INFO } from '../../lib/types';

import { useAppContext } from '../../store/AppContext';


export default function PoForm() {
  const ctx = useAppContext();
  const {
    activeTab,
    setActiveTab,
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
{activeTab === 'po-form' && (
  <motion.div key="poform" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white p-8 rounded-3xl border border-slate-100 shadow-xl max-w-3xl mx-auto">
      <div className="mb-8 flex justify-between items-start pb-6 border-b border-slate-100">
          <div>
              <div className="flex items-center gap-2 mb-1">
                 <ShoppingBag className="w-5 h-5 text-indigo-600" />
                 <h3 className="text-xl font-bold text-slate-900 uppercase">Create Purchase Order</h3>
              </div>
              <p className="text-xs text-slate-400 font-bold">Linking to PR: <span className="text-indigo-600">{poForm.prId}</span></p>
          </div>
          <div className="flex items-center gap-4">
              <div className="text-right">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Authorized By</p>
                  <p className="text-sm font-bold text-slate-900">{user.displayName}</p>
              </div>
              <button onClick={() => setActiveTab('purchase-queue')} className="p-2 transition-colors bg-slate-50 text-slate-400 rounded-xl hover:text-slate-600">
                  <X className="w-6 h-6" />
              </button>
          </div>
      </div>

      <form onSubmit={handleSubmitPO} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Supplier</label>
                  <div className="px-4 py-3 rounded-xl border border-slate-100 bg-slate-50 text-indigo-600 font-bold text-sm">
                     {poForm.supplier}
                  </div>
              </div>
              <div className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Target Delivery Date</label>
                  <input 
                      type="date" 
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
                      value={poForm.deliveryDate} 
                      onChange={e => setPoForm({...poForm, deliveryDate: e.target.value})} 
                      required 
                  />
              </div>
          </div>

          <div className="space-y-2 bg-slate-50/50 p-4 rounded-2xl border border-slate-100/80">
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest">Alamat Kirim (Gudang)</label>
              <select 
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none transition-all shadow-sm"
                  value={poForm.division}
                  onChange={e => setPoForm({...poForm, division: e.target.value})}
                  required
              >
                  {Object.keys(WAREHOUSE_ADDRESS_INFO).map(key => (
                      <option key={key} value={key}>{key} - {WAREHOUSE_ADDRESS_INFO[key].name}</option>
                  ))}
              </select>
              <div className="mt-2 p-4 bg-white border border-slate-100 rounded-xl shadow-inner">
                  <p className="text-[9px] font-black text-indigo-500 uppercase tracking-widest mb-1.5">Alamat Terisi Otomatis</p>
                  <p className="text-xs font-bold text-slate-700 leading-relaxed">
                      {WAREHOUSE_ADDRESS_INFO[poForm.division]?.address || '-'}
                  </p>
              </div>
          </div>

          <div className="space-y-4">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Item Details</label>
              <div className="space-y-3 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                {poForm.items.map((item, idx) => (
                  <div key={idx} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                     <div className="md:col-span-6">
                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">Item Name</p>
                        <p className="font-bold text-slate-700 text-sm truncate">{item.itemName}</p>
                     </div>
                     <div className="md:col-span-3">
                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">Satuan</p>
                        <p className="font-bold text-slate-700 text-sm">{item.unit || '-'}</p>
                     </div>
                     <div className="md:col-span-3">
                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">Quantity</p>
                        <p className="font-bold text-slate-700 text-sm">{item.qty}</p>
                     </div>
                  </div>
                ))}
              </div>
          </div>

          <div className="space-y-2 pt-4">
             <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Internal Notes for PO</label>
             <textarea 
                 className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium" 
                 rows={4} 
                 placeholder="Notes for vendor or logistics..."
                 value={poForm.notes} 
                 onChange={e => setPoForm({...poForm, notes: e.target.value})}
             ></textarea>
          </div>

          <div className="pt-4 flex gap-4">
              <button type="submit" disabled={isLoading} className="flex-1 bg-indigo-600 text-white font-black uppercase text-sm py-4 rounded-xl shadow-lg shadow-indigo-100 hover:translate-y-[-2px] hover:bg-indigo-700 transition-all disabled:opacity-50">
                  {isLoading ? 'GENERATING PO...' : 'GENERATE PURCHASE ORDERS'}
              </button>
          </div>
      </form>
  </motion.div>
)}
    </>
  );
}
