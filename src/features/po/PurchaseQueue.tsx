import React from 'react';
import { motion } from 'framer-motion';
import { Plus, ShoppingBag } from '../../icons';

import { useAppContext } from '../../store/AppContext';


export default function PurchaseQueue() {
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
{activeTab === 'purchase-queue' && canSee('PURCHASE') && (
   <motion.div key="pq" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      {(() => {
        const waitingPRs = prList.filter(p => String(p.status || '').trim().toUpperCase() === 'WAITING CREATED PO');
        const groupedResults = {};
        waitingPRs.forEach(item => {
          if (!groupedResults[item.id]) groupedResults[item.id] = [];
          groupedResults[item.id].push(item);
        });

        const prIds = Object.keys(groupedResults).sort((a, b) => b.localeCompare(a));

        if (prIds.length === 0) {
          return (
            <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-200">
              <ShoppingBag className="w-12 h-12 text-slate-200 mx-auto mb-4" />
              <p className="text-slate-400 font-bold">No purchase requests waiting for PO.</p>
            </div>
          );
        }

        return prIds.map(prId => {
          const items = groupedResults[prId];
          const info = items[0];
          return (
            <div key={prId} className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                  <div>
                    <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">PR NUMBER</span>
                    <h4 className="font-bold text-lg text-slate-800">{prId}</h4>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right hidden sm:block">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Division & Supplier</p>
                      <p className="text-sm font-bold text-slate-700">{info.division} • <span className="text-indigo-600">{info.supplier}</span></p>
                    </div>
                    <button 
                      onClick={() => openPOForm(items)} 
                      className="px-6 py-2.5 bg-indigo-600 text-white text-[10px] font-black uppercase rounded-xl shadow-lg shadow-indigo-100 hover:translate-y-[-2px] transition-all"
                    >
                      Process PO
                    </button>
                  </div>
                </div>
                <div className="p-0">
                  <table className="w-full text-left">
                    <thead className="bg-white border-b border-slate-50">
                      <tr>
                        <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase">Item Name</th>
                        <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase text-center">Qty</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {items.map(item => (
                        <tr key={`${item.id}-${item.rowIndex}`} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4">
                            <p className="font-bold text-slate-800 text-sm">{item.itemName}</p>
                            <p className="text-[10px] text-slate-400">Stock: {item.stockOnhand} | Avg: {Number(item.avgSales).toFixed(1)}</p>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="font-bold text-slate-700 text-sm">{item.qty}</span>
                            <span className="ml-1 text-[10px] font-bold text-slate-400 uppercase">{item.unit}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              <div className="p-4 bg-slate-50/50 flex justify-between items-center px-6">
                 <p className="text-[10px] text-slate-400 font-bold uppercase">Requested by {info.requester}</p>
                 <button onClick={() => openPRDetail(info)} className="text-[10px] text-indigo-600 font-black hover:underline uppercase">View Full PR</button>
              </div>
            </div>
          );
        });
      })()}
   </motion.div>
)}
    </>
  );
}
