import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Edit, FileText, Trash2 } from '../../icons';
import { useAppContext } from '../../store/AppContext';
import { isAdmin, isPurchase } from '../../lib/permissions';


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

  const [receivingPr, setReceivingPr] = useState<any | null>(null);
  const [doNo, setDoNo] = useState('');
  const [driverName, setDriverName] = useState('');
  const [licensePlate, setLicensePlate] = useState('');
  const [checkerBy, setCheckerBy] = useState('');
  const [receivedDate, setReceivedDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const startReceiving = (pr: any) => {
    setReceivingPr(pr);
    setDoNo('');
    setDriverName('');
    setLicensePlate('');
    setCheckerBy(user.fullName || user.displayName || user.username || '');
    
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    setReceivedDate(`${yyyy}-${mm}-${dd}`);
  };

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
          <option value="ALREADY RECEIVE">ALREADY RECEIVE</option>
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
              <th className="px-8 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest text-center">Tanggal PR</th>
              <th className="px-8 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest text-center">PR ID</th>
              <th className="px-8 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Requester</th>
              <th className="px-8 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest text-center">Status</th>
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
                <td className="px-8 py-4 text-center text-xs font-bold text-slate-600 whitespace-nowrap border-l-4 border-l-transparent">{pr.date || '-'}</td>
                <td onClick={() => openPRDetail(pr)} className="px-8 py-4 font-bold text-indigo-600 hover:border-l-indigo-500 text-xs cursor-pointer hover:underline transition-all text-center">{pr.id}</td>
                <td className="px-8 py-4">
                  <p className="font-bold text-slate-800 text-sm">{pr.requester}</p>
                  <p className="text-[10px] uppercase font-bold text-slate-400">{pr.division}</p>
                </td>
                <td className="px-8 py-4 text-center">
                  <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter ${
                    pr.status?.includes('WAITING') ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                    pr.status === 'Approved' || pr.status === 'FINISH' || pr.status === 'WAITING CREATED PO' || pr.status === 'ALREADY RECEIVE' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                    pr.status === 'Rejected' ? 'bg-red-50 text-red-600 border border-red-100' :
                    'bg-slate-50 text-slate-500 border border-slate-100'
                  }`}>{pr.status}</span>
                </td>
                <td className="px-8 py-4 text-center">
                  <span className="text-[10px] font-bold text-slate-600 font-mono tracking-tighter">
                    {pr.poNumber || '-'}
                  </span>
                </td>
                <td className="px-8 py-4">
                   <div className="flex justify-center">
                      <button onClick={() => openPRDetail(pr)} className="p-2 bg-indigo-55 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors">
                          <FileText className="w-4 h-4" />
                      </button>
                   </div>
                </td>
                <td className="px-8 py-4 text-right">
                  <div className="flex justify-end gap-1 items-center">
                     <button onClick={() => handleEditPR(pr)} title="Edit" className="p-2 text-slate-400 hover:text-indigo-600 transition-colors"><Edit className="w-4 h-4" /></button>
                     {pr.status === 'WAITING RECEIVE' && (() => {
                       const userDiv = String(user.division || '').toLowerCase().trim();
                       const prDiv = String(pr.division || '').toLowerCase().trim();
                       const canReceive = isAdmin(user) || isPurchase(user) || (userDiv && (prDiv === userDiv || prDiv.includes(userDiv) || userDiv.includes(prDiv)));
                       if (!canReceive) return null;
                       return (
                         <button 
                           onClick={() => startReceiving(pr)} 
                           title="Terima Barang" 
                           className="px-2.5 py-1 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-lg text-[10px] font-black hover:bg-emerald-100 transition-all flex items-center gap-1 shadow-sm uppercase"
                         >
                           <CheckCircle2 className="w-3.5 h-3.5" />
                           TERIMA
                         </button>
                       );
                     })()}
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

{receivingPr && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
    <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-2xl max-w-md w-full mx-4 text-left">
      <div className="mb-4">
        <h3 className="text-lg font-bold text-slate-900 uppercase">Penerimaan Barang (Receive PO)</h3>
        <p className="text-xs text-slate-400 font-bold">No. PR: <span className="text-indigo-600">{receivingPr.id}</span> | PO: <span className="text-indigo-600">{receivingPr.poNumber}</span></p>
      </div>
      <form onSubmit={async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
          const res = await ctx.apiFetch('/api/po/receive', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prId: receivingPr.id,
              poNo: receivingPr.poNumber,
              doNo,
              driverName,
              licensePlate,
              checkerBy,
              receivedDate,
            })
          });
          const result = await res.json();
          if (!result.success) throw new Error(result.message || 'Gagal menyimpan data.');
          
          await ctx.fetchStats();
          setReceivingPr(null);
          setDoNo('');
          setDriverName('');
          setLicensePlate('');
          
          if ((window as any).Swal) {
            (window as any).Swal.fire({
              icon: 'success',
              title: 'Berhasil!',
              text: 'Barang berhasil diterima.',
              confirmButtonColor: '#4f46e5'
            });
          } else {
            alert('Barang berhasil diterima.');
          }
        } catch (err: any) {
          if ((window as any).Swal) {
            (window as any).Swal.fire({
              icon: 'error',
              title: 'Gagal!',
              text: err.message,
              confirmButtonColor: '#4f46e5'
            });
          } else {
            alert(err.message);
          }
        } finally {
          setSubmitting(false);
        }
      }} className="space-y-4">
        <label className="block space-y-1">
          <span className="text-[10px] font-black uppercase text-slate-400">Tanggal Terima</span>
          <input 
            type="date"
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none" 
            required 
            value={receivedDate} 
            onChange={e => setReceivedDate(e.target.value)} 
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[10px] font-black uppercase text-slate-400">No. DO / Surat Jalan</span>
          <input 
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none" 
            required 
            value={doNo} 
            onChange={e => setDoNo(e.target.value)} 
            placeholder="Masukkan Nomor DO/Surat Jalan"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[10px] font-black uppercase text-slate-400">Nama Supir</span>
          <input 
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none" 
            required 
            value={driverName} 
            onChange={e => setDriverName(e.target.value)} 
            placeholder="Masukkan Nama Supir"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[10px] font-black uppercase text-slate-400">Nomor Polisi</span>
          <input 
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none" 
            required 
            value={licensePlate} 
            onChange={e => setLicensePlate(e.target.value)} 
            placeholder="e.g. B 1234 ABC"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[10px] font-black uppercase text-slate-400">Checker By</span>
          <input 
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none" 
            required 
            value={checkerBy} 
            onChange={e => setCheckerBy(e.target.value)} 
            placeholder="Nama Penerima/Pemeriksa"
          />
        </label>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={() => setReceivingPr(null)} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200 transition-all">Cancel</button>
          <button type="submit" disabled={submitting} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all disabled:opacity-60">Simpan Penerimaan</button>
        </div>
      </form>
    </div>
  </div>
)}
    </>
  );
}
