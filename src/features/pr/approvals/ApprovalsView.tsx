import React from 'react';
import { motion } from 'framer-motion';
import { Check, CheckCircle2, FileText, Search, X } from '../../../icons';

import { useAppContext } from '../../../store/AppContext';


export default function ApprovalsView() {
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
{activeTab === 'approvals' && canSee('APPROVAL') && (
   <motion.div key="appr" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Filter by Division</label>
          <select 
            className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
            value={searchDivisionApproval} 
            onChange={e => setSearchDivisionApproval(e.target.value)}
          >
            <option value="">All Divisions</option>
            {(Array.isArray(prList) ? Array.from(new Set(prList.map(p => p.division).filter(Boolean))).sort() : []).map(div => (
              <option key={div} value={div}>{div}</option>
            ))}
          </select>
        </div>
        <button onClick={() => setSearchDivisionApproval('')} className="px-6 py-2 bg-slate-100 text-slate-500 rounded-xl font-bold text-sm hover:bg-slate-200 transition-all">Clear Filter</button>
      </div>

      {(() => {
        // Get unique PRs for approval
        const seenIds = new Set();
        const safePrList = Array.isArray(prList) ? prList : [];
        const filteredPRs = safePrList.reduce((acc, p) => {
          if (!p || !p.id || seenIds.has(p.id)) return acc;
          
          const role = String(user.role || '').toUpperCase().trim();
          const divCode = String(user.divisionCode || '').toUpperCase().trim();
          const status = String(p.status || '').toUpperCase().trim();
          const prDiv = String(p.division || '').toLowerCase().trim();
          const userDiv = String(user.division || '').toLowerCase().trim();
          
          // Matchers
          const isMgr = role.includes('MANAGER') || role.includes('MANAJER') || role.includes('MGR') || role.includes('KABAG') || divCode === 'MGR';
          const isDir = role.includes('DIREKTUR') || role.includes('DIREKSI') || role.includes('DIR') || role.includes('KADIV') || divCode === 'DIR';
          const isAdmin = role.includes('ADMIN') || role.includes('SUPER');

          const isWaitMgr = status.includes('MANAGER') || status.includes('MANAJER') || status.includes('MGR') || status.includes('KABAG');
          const isWaitDir = status.includes('DIREKTUR') || status.includes('DIREKSI') || status.includes('DIR') || status.includes('KADIV');
          const isWaitPO = status.includes('PO') || status.includes('PURCHASE') || status.includes('PURCHASING');
          const isWaiting = status.includes('WAITING') || status.includes('PENDING') || status.includes('APPROVAL');

          // Division Check
          const hasApprovalAccess = canSee('APPROVAL');
          const isPowerUser = isAdmin || isMgr || isDir || hasApprovalAccess;
          if (!isPowerUser && userDiv && prDiv && !prDiv.includes(userDiv) && !userDiv.includes(prDiv)) {
            return acc;
          }

          let show = false;
          if (isAdmin) {
            // Admins see all pending approvals
            show = isWaiting && (isWaitMgr || isWaitDir || isWaitPO);
          } else if (isWaiting) {
            // STRICT ROLE FILTERING
            if (isMgr && isWaitMgr) {
              show = true;
            } else if (isDir && isWaitDir) {
              show = true;
            }
            // Note: We removed the broad fallback to ensure strict separation
          }

          const matchesSearch = !searchDivisionApproval || prDiv.includes(searchDivisionApproval.toLowerCase().trim());
          
          if (show && matchesSearch) {
            seenIds.add(p.id);
            acc.push(p);
          }
          return acc;
        }, []);

        if (filteredPRs.length === 0) {
          return (
            <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-200">
              <CheckCircle2 className="w-12 h-12 text-slate-200 mx-auto mb-4" />
              <p className="text-slate-400 font-bold">No pending approvals for you.</p>
            </div>
          );
        }

        return filteredPRs.map(pr => (
          <div key={`${pr.id}-${pr.rowIndex}`} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
            <div className="cursor-pointer group flex-1" onClick={() => openPRDetail(pr)}>
              <h4 className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors mb-1">{pr.id}</h4>
              <p className="text-sm text-slate-500">Requested by {pr.requester} • Supplier: {pr.supplier}</p>
              {pr.notes && <p className="text-xs text-slate-400 mt-1 italic">Note: {pr.notes}</p>}
              {pr.mgrApp && <p className="text-[10px] text-emerald-600 mt-1 uppercase font-bold">MGR Status: {pr.mgrApp}</p>}
            </div>
            <div className="flex flex-col items-end gap-2">
               <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded text-[10px] font-bold uppercase tracking-tight">{pr.status}</span>
               <button onClick={() => openPRDetail(pr)} className="px-4 py-2 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-all text-sm">View Detail</button>
            </div>
          </div>
        ));
      })()}
   </motion.div>
)}
    </>
  );
}
