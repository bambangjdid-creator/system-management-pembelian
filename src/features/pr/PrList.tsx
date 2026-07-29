import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Edit, FileText, Trash2 } from '../../icons';

import { useAppContext } from '../../store/AppContext';


export default function PrList() {
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
{activeTab === 'history' && canSee('PR HISTORY') && (
  <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
    <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-wrap gap-4 items-end">
      <div className="flex-1 min-w-[200px]">
        <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Search Status</label>
        <select className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-700" value={searchStatus} onChange={e => setSearchStatus(e.target.value)}>
          <option value="">All Status</option>
          <option value="WAITING MANAGER APPROVAL">WAITING MANAGER APPROVAL</option>
          <option value="WAITING DIREKTUR APPROVAL">WAITING DIREKTUR APPROVAL</option>
          <option value="WAITING CREATED PO">WAITING CREATED PO</option>
          <option value="WAITING RECEIVE">WAITING RECEIVE</option>
          <option value="FINISH">FINISH</option>
          <option value="Rejected">Rejected</option>
        </select>
      </div>
      <div className="flex-1 min-w-[200px]">
        <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Search Division</label>
        <select className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-700" value={searchDivision} onChange={e => setSearchDivision(e.target.value)}>
          <option value="">All Divisions</option>
          {(Array.isArray(prList) ? Array.from(new Set(prList.map(p => p.division).filter(Boolean))).sort() : []).map(div => (
            <option key={div} value={div}>{div}</option>
          ))}
        </select>
      </div>
      <div className="flex-1 min-w-[200px]">
        <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Search Supplier</label>
        <select className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-700" value={searchSupplierPR} onChange={e => setSearchSupplierPR(e.target.value)}>
          <option value="">All Suppliers</option>
          {suppliersFromPR.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <button onClick={() => {setSearchStatus(''); setSearchDivision(''); setSearchSupplierPR('');}} className="px-6 py-2 bg-slate-100 text-slate-500 rounded-xl font-bold text-sm hover:bg-slate-200 transition-all">Reset</button>
    </div>

    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
        <h3 className="font-bold text-slate-800">PR History Log</h3>
        <div className="flex gap-2">
          <span className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-500">
            {(() => {
              const count = (Array.isArray(prList) ? Array.from(new Set(prList.map(p => p.id))) : [])
                .map(id => prList.find(p => p.id === id))
                .filter(pr => {
                  if (!pr) return false;
                  const role = String(user.role || '').trim().toUpperCase();
                  const divCode = String(user.divisionCode || '').trim().toUpperCase();
                  const isPowerUser = ['ADMIN', 'PURCHASE', 'MANAJER', 'MANAGER', 'DIREKTUR', 'DIREKSI', 'DIR', 'MGR', 'KABAG', 'KADIV', 'PURCHASING'].includes(role) || 
                                      role.includes('MANAGER') || role.includes('MANAJER') || role.includes('DIREKTUR') || role.includes('DIREKSI') || 
                                      canSee('APPROVAL') || divCode === 'MGR' || divCode === 'DIR';
                  const prDiv = String(pr.division || '').toLowerCase().trim();
                  const userDiv = String(user.division || '').toLowerCase().trim();
                  if (!isPowerUser && userDiv && prDiv !== userDiv && !prDiv.includes(userDiv) && !userDiv.includes(prDiv)) return false;
                  const matchesStatus = searchStatus === '' || String(pr.status || '').trim().toUpperCase() === searchStatus.toUpperCase().trim();
                  const matchesDivision = searchDivision === '' || prDiv.includes(searchDivision.toLowerCase().trim());
                  const matchesSupplier = searchSupplierPR === '' || String(pr.supplier || '').toLowerCase().trim().includes(searchSupplierPR.toLowerCase().trim());
                  return matchesStatus && matchesDivision && matchesSupplier;
                }).length;
              return `Found: ${count} Unique PRs`;
            })()}
          </span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="px-8 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest text-center">PR ID</th>
              <th className="px-8 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Requester</th>
              <th className="px-8 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest text-center">Status</th>
              <th className="px-8 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest text-center whitespace-nowrap">Estimasi Datang</th>
              <th className="px-8 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest text-center">PO Number</th>
              <th className="px-8 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest text-center">PDF</th>
              <th className="px-8 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {/* Only show unique PRs in History */}
            {(Array.isArray(prList) ? Array.from(new Set(prList.map(p => p.id))) : [])
              .map(id => prList.find(p => p.id === id))
              .filter(pr => {
                if (!pr) return false;
                const role = String(user.role || '').trim().toUpperCase();
                const divCode = String(user.divisionCode || '').trim().toUpperCase();
                const isPowerUser = ['ADMIN', 'PURCHASE', 'MANAJER', 'MANAGER', 'DIREKTUR', 'DIREKSI', 'DIR', 'MGR', 'KABAG', 'KADIV', 'PURCHASING'].includes(role) || 
                                    role.includes('MANAGER') || role.includes('MANAJER') || role.includes('DIREKTUR') || role.includes('DIREKSI') || 
                                    canSee('APPROVAL') || divCode === 'MGR' || divCode === 'DIR';
                
                // Data isolation: Regular users only see their own division's PRs
                const prDiv = String(pr.division || '').toLowerCase().trim();
                const userDiv = String(user.division || '').toLowerCase().trim();
                
                if (!isPowerUser && userDiv && prDiv !== userDiv && !prDiv.includes(userDiv) && !userDiv.includes(prDiv)) return false;

                // Search/Filter logic
                const matchesStatus = searchStatus === '' || String(pr.status || '').trim().toUpperCase() === searchStatus.toUpperCase().trim();
                const matchesDivision = searchDivision === '' || prDiv.includes(searchDivision.toLowerCase().trim());
                const matchesSupplier = searchSupplierPR === '' || String(pr.supplier || '').toLowerCase().trim().includes(searchSupplierPR.toLowerCase().trim());
                
                return matchesStatus && matchesDivision && matchesSupplier;
              })
              .map(pr => (
              <tr key={`${pr.id}-${pr.rowIndex}`} className="hover:bg-slate-50 transition-colors">
                <td onClick={() => openPRDetail(pr)} className="px-8 py-4 font-bold text-indigo-600 border-l-4 border-l-transparent hover:border-l-indigo-500 text-xs cursor-pointer hover:underline transition-all text-center">{pr.id}</td>
                <td className="px-8 py-4">
                  <p className="font-bold text-slate-800 text-sm">{pr.requester}</p>
                  <p className="text-[10px] uppercase font-bold text-slate-400">{pr.division}</p>
                </td>
                <td className="px-8 py-4 text-center">
                  <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter ${
                    pr.status?.includes('WAITING') ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                    pr.status === 'Approved' || pr.status === 'FINISH' || pr.status === 'WAITING CREATED PO' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                    pr.status === 'Rejected' ? 'bg-red-50 text-red-600 border border-red-100' :
                    'bg-slate-50 text-slate-500 border border-slate-100'
                  }`}>{pr.status}</span>
                </td>
                <td className="px-8 py-4 text-center">
                  <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg border border-indigo-100">
                    {(() => {
                      const linkedPO = poList.find(po => String(po.prId) === String(pr.id));
                      return linkedPO?.deliveryDate || '-';
                    })()}
                  </span>
                </td>
                <td className="px-8 py-4 text-center">
                  <span className="text-[10px] font-bold text-slate-600 font-mono tracking-tighter">
                    {pr.poNumber || '-'}
                  </span>
                </td>
                <td className="px-8 py-4">
                   <div className="flex justify-center">
                      <button onClick={() => openPRDetail(pr)} className="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors">
                          <FileText className="w-4 h-4" />
                      </button>
                   </div>
                </td>
                <td className="px-8 py-4 text-right">
                  <div className="flex justify-end gap-1">
                     <button onClick={() => handleEditPR(pr)} title="Edit" className="p-2 text-slate-400 hover:text-indigo-600 transition-colors"><Edit className="w-4 h-4" /></button>
                     {pr.status === 'WAITING RECEIVE' && (
                       <button onClick={() => handleFinishPR(pr.id)} title="Receive/Finish" className="p-2 text-emerald-500 hover:bg-emerald-50 rounded-lg"><CheckCircle2 className="w-4 h-4" /></button>
                     )}
                     <button onClick={() => handleDeletePR(pr.rowIndex)} title="Delete" className="p-2 text-slate-400 hover:text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
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
