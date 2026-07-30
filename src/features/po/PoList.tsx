import React from 'react';
import { motion } from 'framer-motion';
import { FileText } from '../../icons';

import { useAppContext } from '../../store/AppContext';


export default function PoList() {
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
    divisionsFromPR,
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
{activeTab === 'po-history' && canSee('PO HISTORY') && (
  <motion.div key="po-list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
    <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-wrap gap-4 items-end">
      <div className="flex-1 min-w-[200px]">
        <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Filter Division</label>
        <select className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-700" value={searchDivisionPO} onChange={e => setSearchDivisionPO(e.target.value)}>
          <option value="">All Divisions</option>
          {divisionsFromPR.map(div => (
            <option key={div} value={div}>{div}</option>
          ))}
        </select>
      </div>
      <div className="flex-1 min-w-[200px]">
        <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Filter Supplier</label>
        <select className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-700" value={searchSupplierPO} onChange={e => setSearchSupplierPO(e.target.value)}>
          <option value="">All Suppliers</option>
          {Array.from(new Set(poList.map(p => p.supplier).filter(Boolean))).sort().map((sup: any) => (
            <option key={String(sup)} value={String(sup)}>{String(sup)}</option>
          ))}
        </select>
      </div>
      <button onClick={() => {setSearchDivisionPO(''); setSearchSupplierPO('');}} className="px-6 py-2 bg-slate-100 text-slate-500 rounded-xl font-bold text-sm hover:bg-slate-200 transition-all">Reset</button>
    </div>

    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
        <h3 className="font-bold text-slate-800">PO History Log</h3>
        <div className="flex gap-2">
          <span className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-500">
            {(() => {
              const count = Array.from(new Set(poList.map(p => p.poNo)))
                .map(poNo => {
                    const group = poList.filter(p => p.poNo === poNo);
                    const totalAmount = Number(group[0]?.grandTotal || 0);
                    return { ...group[0], totalAmount };
                })
                .filter(po => {
                  if (!po) return false;
                  const role = String(user.role || '').trim().toUpperCase();
                  const divCode = String(user.divisionCode || '').trim().toUpperCase();
                  const isPowerUser = ['ADMIN', 'PURCHASE', 'MANAJER', 'MANAGER', 'DIREKTUR', 'DIREKSI', 'DIR', 'MGR', 'KABAG', 'KADIV', 'PURCHASING'].includes(role) ||
                                      role.includes('MANAGER') || role.includes('MANAJER') || role.includes('DIREKTUR') || role.includes('DIREKSI') || 
                                      canSee('APPROVAL') || divCode === 'MGR' || divCode === 'DIR';
                  const poDiv = String(po.division || '').toLowerCase().trim();
                  const userDiv = String(user.division || '').toLowerCase().trim();
                  if (!isPowerUser && userDiv && poDiv !== userDiv && !poDiv.includes(userDiv) && !userDiv.includes(poDiv)) return false;
                  
                  const matchesDivision = searchDivisionPO === '' || poDiv.includes(searchDivisionPO.toLowerCase().trim());
                  const matchesSupplier = searchSupplierPO === '' || String(po.supplier || '').toLowerCase().trim().includes(searchSupplierPO.toLowerCase().trim());
                  
                  return matchesDivision && matchesSupplier;
                }).length;
              return `Found: ${count} Unique POs`;
            })()}
          </span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left font-sans">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="px-8 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">PO Number</th>
              <th className="px-8 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">PR Linked</th>
              <th className="px-8 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Supplier</th>
              <th className="px-8 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Tgl Kirim</th>
              <th className="px-8 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Qty</th>
              <th className="px-8 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Satuan</th>
              <th className="px-8 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">PDF</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {Array.from(new Set(poList.map(p => p.poNo)))
              .map(poNo => {
                  const group = poList.filter(p => p.poNo === poNo);
                  // Use grandTotal from the spreadsheet (Column S)
                  const totalAmount = Number(group[0]?.grandTotal || 0);
                  const totalQty = group.reduce((sum, item) => sum + Number(item.qty), 0);
                  const units = Array.from(new Set(group.map(item => item.unit).filter(Boolean))).join(', ') || 'PCS';
                  return { ...group[0], totalAmount, totalQty, units };
              })
              .filter(po => {
                if (!po) return false;
                const role = String(user.role || '').trim().toUpperCase();
                const divCode = String(user.divisionCode || '').trim().toUpperCase();
                const isPowerUser = ['ADMIN', 'PURCHASE', 'MANAJER', 'MANAGER', 'DIREKTUR', 'DIREKSI', 'DIR', 'MGR', 'KABAG', 'KADIV', 'PURCHASING'].includes(role) ||
                                    role.includes('MANAGER') || role.includes('MANAJER') || role.includes('DIREKTUR') || role.includes('DIREKSI') || 
                                    canSee('APPROVAL') || divCode === 'MGR' || divCode === 'DIR';
                
                // Data isolation: Regular users only see their own division's POs (via PR links)
                const poDiv = String(po.division || '').toLowerCase().trim();
                const userDiv = String(user.division || '').toLowerCase().trim();
                
                if (!isPowerUser && userDiv && poDiv !== userDiv && !poDiv.includes(userDiv) && !userDiv.includes(poDiv)) return false;
                
                const matchesDivision = searchDivisionPO === '' || poDiv.includes(searchDivisionPO.toLowerCase().trim());
                const matchesSupplier = searchSupplierPO === '' || String(po.supplier || '').toLowerCase().trim().includes(searchSupplierPO.toLowerCase().trim());
                
                return matchesDivision && matchesSupplier;
              })
              .map(po => (
              <tr key={po.poNo} className="hover:bg-slate-50 transition-colors">
                <td onClick={() => openPODetail(po)} className="px-8 py-4 font-bold text-indigo-600 border-l-4 border-l-transparent hover:border-l-indigo-500 text-xs cursor-pointer hover:underline transition-all text-center">{po.poNo}</td>
                <td className="px-8 py-4 text-center font-bold text-indigo-600 text-xs">{po.prId}</td>
                <td className="px-8 py-4">
                  <p className="font-bold text-slate-800 text-sm">{po.supplier}</p>
                  <p className="text-[10px] uppercase font-bold text-slate-400">By {po.purchaseName}</p>
                </td>
                <td className="px-8 py-4 text-center text-xs text-slate-600 font-bold">{po.deliveryDate || '-'}</td>
                <td className="px-8 py-4 text-center text-xs font-bold text-slate-700">{po.totalQty}</td>
                <td className="px-8 py-4 text-center text-xs font-bold text-slate-700">{po.units}</td>
                <td className="px-8 py-4">
                   <div className="flex justify-center">
                      <button onClick={() => openPODetail(po)} className="p-2 bg-indigo-55 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors">
                          <FileText className="w-4 h-4" />
                      </button>
                   </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </motion.div>
)}
    </>
  );
}
