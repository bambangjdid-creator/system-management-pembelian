import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import Swal from 'sweetalert2';

import Header from './app/layout/Header';
import MobileDrawer from './app/layout/MobileDrawer';
import Sidebar from './app/layout/Sidebar';
import LoginScreen from './features/auth/LoginScreen';
import { useAuth } from './features/auth/useAuth';
import { useAdmin } from './features/admin/hooks/useAdmin';
import UserFormModal from './features/admin/UserFormModal';
import StockFormModal from './features/admin/StockFormModal';
import { useDashboard } from './features/dashboard/hooks/useDashboard';
import { usePoData } from './features/po/hooks/usePo';
import PdfPreviewModal from './features/components/PdfPreviewModal';
import EditPrModal from './features/pr/EditPrModal';
import { usePrData } from './features/pr/hooks/usePr';
import { canSee as canSeePermission } from './lib/permissions';
import { applyTheme, safeLocalStorage } from './lib/theme';
import { AppContext } from './store/AppContext';
import type { PoFormState, PrFormState } from './lib/types';

const SettingsView = lazy(() => import('./features/admin/SettingsView'));
const Dashboard = lazy(() => import('./features/dashboard/Dashboard'));
const PoForm = lazy(() => import('./features/po/PoForm'));
const PoList = lazy(() => import('./features/po/PoList'));
const PurchaseQueue = lazy(() => import('./features/po/PurchaseQueue'));
const ApprovalsView = lazy(() => import('./features/pr/approvals/ApprovalsView'));
const PrForm = lazy(() => import('./features/pr/PrForm'));
const PrList = lazy(() => import('./features/pr/PrList'));

function FeatureFallback() {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-10 shadow-sm animate-pulse">
      <div className="h-4 w-40 bg-slate-200 dark:bg-slate-800 rounded mb-4" />
      <div className="h-24 bg-slate-100 dark:bg-slate-800 rounded-2xl" />
    </div>
  );
}

export default function App() {
  const {
    user,
    setUser,
    googleToken,
    loginData,
    setLoginData,
    isAuthLoading,
    apiFetch,
    handleLogin,
    handleGoogleLogin,
    handleLogout,
  } = useAuth();
  const [isDarkMode, setIsDarkMode] = useState(() => safeLocalStorage.getItem('theme') === 'dark');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    applyTheme(isDarkMode);
  }, [isDarkMode]);
  const [activeTab, setActiveTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('tab') === 'approvals' ? 'approvals' : 'dashboard';
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [settingsTab, setSettingsTab] = useState('users'); // users, stock
  const [userModal, setUserModal] = useState<{ mode: 'add' | 'edit'; user?: any } | null>(null);
  const [stockModal, setStockModal] = useState<{ mode: 'add' | 'edit'; stock?: any } | null>(null);
  const [editingPr, setEditingPr] = useState<any | null>(null);
  const [previewPr, setPreviewPr] = useState<any | null>(null);
  const [previewPo, setPreviewPo] = useState<any | null>(null);
  const [searchStatus, setSearchStatus] = useState('');
  const [searchDivision, setSearchDivision] = useState('');
  const [searchSupplierPR, setSearchSupplierPR] = useState('');
  const [searchDivisionPO, setSearchDivisionPO] = useState('');
  const [searchSupplierPO, setSearchSupplierPO] = useState('');
  const [searchDivisionApproval, setSearchDivisionApproval] = useState('');

  const canSee = (menu: string) => canSeePermission(user, menu);
  const queriesEnabled = Boolean(user);
  const { stats, statsLoading, fetchStats } = useDashboard(apiFetch, queriesEnabled);
  const { prList, stockMaster, fetchPRs, fetchStock } = usePrData(apiFetch, queriesEnabled);
  const { poList, fetchPOs } = usePoData(apiFetch, queriesEnabled);
  const { adminData, fetchAdminData } = useAdmin(apiFetch, user);

  const [prForm, setPrForm] = useState<PrFormState>({
    supplier: '',
    notes: '',
    items: [
      {
        itemName: '',
        unit: '',
        qty: '',
        stockOnhand: '',
        b1: '0',
        b2: '0',
        b3: '0'
      }
    ]
  });

  const calculateAvg = (item) => (Number(item.b1) + Number(item.b2) + Number(item.b3)) / 3;

  const handleAddUser = () => setUserModal({ mode: 'add' });
  const handleEditUser = (user) => setUserModal({ mode: 'edit', user });
  const closeUserModal = () => setUserModal(null);

  const submitUserForm = async (formValues) => {
    setIsLoading(true);
    try {
      const isEdit = userModal?.mode === 'edit' && userModal.user?.id;
      await apiFetch(isEdit ? `/api/admin/users/${userModal.user.id}` : '/api/admin/users', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formValues)
      });
      await fetchAdminData();
      closeUserModal();
      Swal.fire('Success', isEdit ? 'User updated' : 'User added', 'success');
    } catch (error: any) {
      Swal.fire('Error', error.message || 'Failed to save user', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteUser = async (index) => {
    const confirm = await Swal.fire({ title: 'Delete user?', showCancelButton: true });
    if (confirm.isConfirmed) {
      await apiFetch(`/api/admin/users/${index}`, { method: 'DELETE' });
      fetchAdminData();
    }
  };

  const handleAddStock = () => setStockModal({ mode: 'add' });
  const handleEditStock = (stock) => setStockModal({ mode: 'edit', stock });
  const closeStockModal = () => setStockModal(null);

  const submitStockForm = async (formValues) => {
    setIsLoading(true);
    try {
      const isEdit = stockModal?.mode === 'edit' && stockModal.stock?.id;
      await apiFetch(isEdit ? `/api/admin/stock/${stockModal.stock.id}` : '/api/admin/stock', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formValues)
      });
      await fetchAdminData();
      await fetchStock();
      closeStockModal();
      Swal.fire('Success', isEdit ? 'Item updated' : 'Item added', 'success');
    } catch (error: any) {
      Swal.fire('Error', error.message || 'Failed to save item', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteStock = async (index) => {
    const confirm = await Swal.fire({ title: 'Delete item?', showCancelButton: true });
    if (confirm.isConfirmed) {
      await apiFetch(`/api/admin/stock/${index}`, { method: 'DELETE' });
      fetchAdminData();
      fetchStock();
    }
  };

  const handleDeletePR = async (index) => {
    const confirm = await Swal.fire({ title: 'Delete PR Record?', text: 'This will permanently remove the row from the sheet.', icon: 'warning', showCancelButton: true });
    if (confirm.isConfirmed) {
      await apiFetch(`/api/admin/pr/${index}`, { method: 'DELETE' });
      fetchPRs();
      fetchStats();
      Swal.fire('Deleted', 'PR row removed', 'success');
    }
  };

  const handleEditPR = (pr) => setEditingPr(pr);
  const closeEditPrModal = () => setEditingPr(null);

  const submitEditPR = async (formValues) => {
    if (!formValues?.rowIndex) return;
    setIsLoading(true);
    try {
      await apiFetch(`/api/pr/${formValues.rowIndex}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formValues)
      });
      await fetchPRs();
      await fetchStats();
      closeEditPrModal();
      Swal.fire('Updated', 'PR record updated', 'success');
    } catch (error: any) {
      Swal.fire('Error', error.message || 'Failed to update PR', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const addItem = () => {
    setPrForm({
      ...prForm,
      items: [...prForm.items, { itemName: '', unit: '', qty: '', stockOnhand: '', b1: '0', b2: '0', b3: '0' }]
    });
  };

  const removeItem = (index) => {
    if (prForm.items.length > 1) {
      const newItems = prForm.items.filter((_, i) => i !== index);
      setPrForm({ ...prForm, items: newItems });
    }
  };

  const updateItem = (index, field, value) => {
    const newItems = [...prForm.items];
    newItems[index] = { ...newItems[index], [field]: value };
    if (field === 'itemName') {
      const stock = (Array.isArray(stockMaster) ? stockMaster : []).find(s => s.name === value);
      newItems[index].unit = stock?.unit || '';
    }
    setPrForm({ ...prForm, items: newItems });
  };

  useEffect(() => {
    if (user) {
      // Safeguard against blank dashboard screen if dashboard permission is missing
      const availableTabs = [
        { id: 'dashboard', permission: 'DASHBOARD' },
        { id: 'create-pr', permission: 'CREATE PR' },
        { id: 'history', permission: 'PR HISTORY' },
        { id: 'po-history', permission: 'PO HISTORY' },
        { id: 'purchase-queue', permission: 'PURCHASE' },
        { id: 'approvals', permission: 'APPROVAL' }
      ];
      
      const currentTabDef = availableTabs.find(t => t.id === activeTab);
      const hasAccessToCurrent = currentTabDef ? canSee(currentTabDef.permission) : true;
      if (!hasAccessToCurrent || (activeTab === 'dashboard' && !canSee('DASHBOARD'))) {
        const allowed = availableTabs.find(t => canSee(t.permission));
        if (allowed) {
          setActiveTab(allowed.id);
        } else if (user.role?.toUpperCase() === 'ADMIN') {
          setActiveTab('settings');
        }
      }
    }
  }, [user]);

  const suppliers = useMemo(() => Array.from(new Set((Array.isArray(stockMaster) ? stockMaster : []).map(s => s.supplier).filter(Boolean).map(String))).sort(), [stockMaster]);
  const suppliersFromPR = useMemo(() => Array.from(new Set((Array.isArray(prList) ? prList : []).map(p => p.supplier).filter(Boolean).map(String))).sort(), [prList]);
  const divisionsFromPR = useMemo(() => Array.from(new Set((Array.isArray(prList) ? prList : []).map(p => p.division).filter(Boolean).map(String))).sort(), [prList]);

  const calculateEstimasi = (item) => {
    const avg = calculateAvg(item);
    if (!avg || avg === 0) return 0;
    const qty = Number(item.qty) || 0;
    // Estimasi = Qty / (Avg/30) => (Qty * 30) / Avg
    return (qty * 30) / avg;
  };

  const handleSubmitPR = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await apiFetch('/api/pr/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier: prForm.supplier,
          notes: prForm.notes,
          items: prForm.items.map(item => ({
            ...item,
            avgSales: calculateAvg(item)
          })),
          requester: user.displayName,
          division: user.division,
          divCode: user.divisionCode
        })
      });
      const data = await res.json();
      if (data.success) {
        Swal.fire('Success', 'PR Submitted Successfully', 'success');
        setPrForm({ supplier: '', notes: '', items: [{ itemName: '', unit: '', qty: '', stockOnhand: '', b1: '0', b2: '0', b3: '0' }] });
        setActiveTab('history');
        fetchPRs();
        fetchStats();
      }
    } catch (e) {
      Swal.fire('Error', 'Submission failed', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const [poForm, setPoForm] = useState<PoFormState>({
    prId: '',
    purchaseName: '',
    deliveryDate: '',
    supplier: '',
    items: [],
    notes: '',
    discount: 0,
    discountPercent: 0,
    tax: 0,
    taxPercent: 0,
    others: 0,
    division: 'GD PONCOL'
  });

  const handleSubmitPO = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      // Input Validation
      if (!poForm.deliveryDate) {
        throw new Error("Target Delivery Date is required.");
      }

      for (const item of poForm.items) {
        const parsedPrice = Number(item.price);
        if (item.price === "" || isNaN(parsedPrice) || parsedPrice < 0) {
          throw new Error(`Harga untuk item "${item.itemName}" tidak valid. Harap masukkan angka yang valid.`);
        }
      }

      const subTotal = poForm.items.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.qty || 0)), 0);
      const discount = (subTotal * Number(poForm.discountPercent || 0)) / 100;
      const tax = (subTotal * Number(poForm.taxPercent || 0)) / 100;
      const others = Number(poForm.others || 0);
      const grandTotal = subTotal - discount + tax + others;

      if (isNaN(grandTotal) || grandTotal < 0) {
        throw new Error("Kalkulasi Total Pembayaran menghasilkan nilai tidak valid.");
      }

      const res = await apiFetch('/api/po/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prId: poForm.prId,
          purchaseName: user.displayName || user.username || "System",
          deliveryDate: poForm.deliveryDate,
          supplier: poForm.supplier,
          items: poForm.items.map(item => ({
            itemName: item.itemName,
            unit: item.unit,
            qty: Number(item.qty),
            price: Number(item.price || 0)
          })),
          notes: poForm.notes,
          discount,
          tax,
          others,
          subTotal,
          grandTotal,
          discountPercent: poForm.discountPercent,
          taxPercent: poForm.taxPercent,
          division: poForm.division
        })
      });
      
      if (!res.ok) {
        let errText = `Failed to create PO (Status: ${res.status})`;
        try {
          const errData = await res.json();
          if (errData) {
            errText = errData.error || errData.message || JSON.stringify(errData);
          }
        } catch {}
        throw new Error(errText);
      }
      
      const data = await res.json();
      if (!data || !data.success || !data.poNo) {
        const detail = data 
          ? (data.error || data.message || JSON.stringify(data)) 
          : `Empty response (Status: ${res.status})`;
        throw new Error(`Server did not return a valid PO Number. Detail: ${detail}`);
      }
      
      Swal.fire({
        icon: 'success',
        title: 'PO Created Successfully',
        text: `PO Number: ${data.poNo}`,
        confirmButtonColor: '#4f46e5'
      });
      
      setActiveTab('history');
      fetchPRs();
      fetchPOs();
      fetchStats();
    } catch (error: any) {
      console.error(error);
      Swal.fire('Error', error.message || 'Failed to create PO', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAction = async (prId, action) => {
    let reason = '';
    if (action === 'REJECT') {
      const { value: text } = await Swal.fire({
        title: 'Rejection Reason',
        input: 'textarea',
        inputPlaceholder: 'Type your reason here...',
        inputAttributes: { 'aria-label': 'Type your reason here' },
        showCancelButton: true,
        inputValidator: (value) => {
          if (!value) return 'You need to write something!'
        }
      });
      if (!text) return;
      reason = text;
    } else {
      const confirm = await Swal.fire({
        title: 'Are you sure?',
        text: "Approve this purchase request?",
        icon: 'question',
        showCancelButton: true
      });
      if (!confirm.isConfirmed) return;
    }

    setIsLoading(true);
    let effectiveRole = user.role;
    const divCode = String(user.divisionCode || '').toUpperCase();
    if (String(effectiveRole || '').toUpperCase() === 'USER') {
      if (divCode === 'MGR') effectiveRole = 'MANAGER';
      if (divCode === 'DIR') effectiveRole = 'DIREKTUR';
    }

    try {
      await apiFetch('/api/pr/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prId, role: effectiveRole, user: user.displayName, action, reason })
      });
      Swal.close();
      Swal.fire(action === 'APPROVE' ? 'Approved' : (action === 'REJECT' ? 'Rejected' : 'Set to Pending'), '', 'success');
      fetchPRs();
      fetchStats();
    } finally {
      setIsLoading(false);
    }
  };

  const handleFinishPR = async (prId) => {
    const confirm = await Swal.fire({
      title: 'Barang sudah diterima?',
      text: "Status akan berubah menjadi FINISH",
      icon: 'question',
      showCancelButton: true
    });
    if (!confirm.isConfirmed) return;

    setIsLoading(true);
    try {
      await apiFetch('/api/pr/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prId })
      });
      Swal.fire('Finished', 'PR is now marked as Finished', 'success');
      fetchPRs();
      fetchStats();
    } finally {
      setIsLoading(false);
    }
  };

  const openPRDetail = (pr) => setPreviewPr({ ...pr, _cacheBuster: Date.now() });
  const closePRDetail = () => setPreviewPr(null);

  const openPODetail = (po) => setPreviewPo({ ...po, _cacheBuster: Date.now() });
  const closePODetail = () => setPreviewPo(null);

  const openPOForm = (items) => {
    const info = items[0];
    const rawDivision = String(info.division || '').toUpperCase().trim();
    let selectedDivision = 'GD PONCOL';
    if (rawDivision.includes('PONCOL')) {
      selectedDivision = 'GD PONCOL';
    } else if (rawDivision.includes('CIRACAS')) {
      selectedDivision = 'GD CIRACAS';
    } else if (rawDivision.includes('NAGOYA')) {
      selectedDivision = 'GD NAGOYA';
    }

    setPoForm({
      prId: info.id,
      supplier: info.supplier,
      deliveryDate: '',
      items: items.map(item => ({
        itemName: item.itemName,
        qty: item.qty,
        unit: item.unit,
        price: '0',
      })),
      notes: info.notes || '',
      purchaseName: user.displayName,
      discount: 0,
      discountPercent: 0,
      tax: 0,
      taxPercent: 0,
      others: 0,
      division: selectedDivision
    });
    setActiveTab('po-form');
  };

  if (!user) {
    return (
      <LoginScreen
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
        showPassword={showPassword}
        setShowPassword={setShowPassword}
        loginData={loginData}
        setLoginData={setLoginData}
        handleLogin={handleLogin}
        handleGoogleLogin={handleGoogleLogin}
        googleToken={googleToken}
        isLoading={isAuthLoading}
      />
    );
  }

  const appCtx = {
    activeTab,
    setActiveTab,
    canSee,
    user,
    stats,
    statsLoading,
    fetchStats,
    prList,
    poList,
    stockMaster,
    adminData,
    settingsTab,
    setSettingsTab,
    searchStatus,
    setSearchStatus,
    searchDivision,
    setSearchDivision,
    searchSupplierPR,
    setSearchSupplierPR,
    searchDivisionPO,
    setSearchDivisionPO,
    searchSupplierPO,
    setSearchSupplierPO,
    searchDivisionApproval,
    setSearchDivisionApproval,
    prForm,
    setPrForm,
    poForm,
    setPoForm,
    suppliers,
    suppliersFromPR,
    divisionsFromPR,
    calculateAvg,
    calculateEstimasi,
    addItem,
    removeItem,
    updateItem,
    isLoading,
    apiFetch,
    handleAddUser,
    handleEditUser,
    handleDeleteUser,
    handleAddStock,
    handleEditStock,
    handleDeleteStock,
    handleDeletePR,
    handleEditPR,
    handleSubmitPR,
    handleSubmitPO,
    handleAction,
    handleFinishPR,
    openPRDetail,
    openPODetail,
    openPOForm,
  };

  return (
    <AppContext.Provider value={appCtx}>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex transition-colors duration-300">
        <Sidebar
          user={user}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          canSee={canSee}
          googleToken={googleToken}
          handleGoogleLogin={handleGoogleLogin}
        />

        <MobileDrawer
          user={user}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          canSee={canSee}
          googleToken={googleToken}
          handleGoogleLogin={handleGoogleLogin}
          mobileMenuOpen={mobileMenuOpen}
          setMobileMenuOpen={setMobileMenuOpen}
        />

        <main className="flex-1 p-6 md:p-10 overflow-y-auto">
          <Header
            activeTab={activeTab}
            user={user}
            isDarkMode={isDarkMode}
            setIsDarkMode={setIsDarkMode}
            setMobileMenuOpen={setMobileMenuOpen}
            handleLogout={handleLogout}
          />

          <Suspense fallback={<FeatureFallback />}>
            <AnimatePresence mode="wait">
              {activeTab === 'dashboard' && <Dashboard />}
              {activeTab === 'create-pr' && <PrForm />}
              {activeTab === 'history' && <PrList />}
              {activeTab === 'po-history' && <PoList />}
              {activeTab === 'approvals' && <ApprovalsView />}
              {activeTab === 'purchase-queue' && <PurchaseQueue />}
              {activeTab === 'po-form' && <PoForm />}
              {activeTab === 'settings' && <SettingsView />}
            </AnimatePresence>
          </Suspense>
        </main>

        <UserFormModal
          open={Boolean(userModal)}
          mode={userModal?.mode || 'add'}
          user={userModal?.user}
          isSubmitting={isLoading}
          onClose={closeUserModal}
          onSubmit={submitUserForm}
        />
        <StockFormModal
          open={Boolean(stockModal)}
          mode={stockModal?.mode || 'add'}
          stock={stockModal?.stock}
          isSubmitting={isLoading}
          onClose={closeStockModal}
          onSubmit={submitStockForm}
        />
        <EditPrModal
          open={Boolean(editingPr)}
          pr={editingPr}
          isSubmitting={isLoading}
          onClose={closeEditPrModal}
          onSubmit={submitEditPR}
        />
        {previewPr && (
          <PdfPreviewModal
            open={Boolean(previewPr)}
            title={`Detail PR: ${previewPr.id}`}
            previewUrl={`/api/pdf/pr/${String(previewPr.id || '').replace(/\//g, '_')}.pdf?v=${previewPr._cacheBuster}`}
            originalLink={previewPr.pdfLink || `/api/pdf/pr/${String(previewPr.id || '').replace(/\//g, '_')}.pdf`}
            onClose={closePRDetail}
            actions={[
              { label: 'REJECT', className: 'px-6 py-2 bg-red-50 text-red-600 font-bold rounded-xl border border-red-100 hover:bg-red-100 transition-colors', onClick: () => { closePRDetail(); handleAction(previewPr.id, 'REJECT'); } },
              { label: 'PENDING', className: 'px-6 py-2 bg-slate-50 text-slate-600 font-bold rounded-xl border border-slate-200 hover:bg-slate-100 transition-colors', onClick: () => { closePRDetail(); handleAction(previewPr.id, 'PENDING'); } },
              { label: 'APPROVE', className: 'px-6 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg transition-all transform hover:-translate-y-0.5', onClick: () => { closePRDetail(); handleAction(previewPr.id, 'APPROVE'); } },
            ]}
          />
        )}
        {previewPo && (
          <PdfPreviewModal
            open={Boolean(previewPo)}
            title={`Detail PO: ${previewPo.poNo}`}
            previewUrl={`/api/pdf/po/${String(previewPo.poNo || '').replace(/\//g, '_')}.pdf?v=${previewPo._cacheBuster}`}
            originalLink={previewPo.pdfLink || `/api/pdf/po/${String(previewPo.poNo || '').replace(/\//g, '_')}.pdf`}
            onClose={closePODetail}
            meta={(
              <div className="space-y-1.5 rounded-xl border border-slate-100 bg-slate-50 p-4 text-left text-xs dark:border-slate-800 dark:bg-slate-800/40">
                <p className="flex justify-between"><span className="text-[9px] font-black uppercase tracking-wider text-slate-400">PR Link:</span><span className="font-bold text-slate-800 dark:text-slate-200">{previewPo.prId || '-'}</span></p>
                <p className="flex justify-between"><span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Supplier:</span><span className="font-bold text-slate-800 dark:text-slate-200">{previewPo.supplier || '-'}</span></p>
                <p className="flex justify-between"><span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Tanggal Kirim:</span><span className="font-bold text-slate-800 dark:text-slate-200">{previewPo.deliveryDate || '-'}</span></p>
                <p className="flex justify-between"><span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Pembuat PO:</span><span className="font-bold text-slate-800 dark:text-slate-200">{previewPo.purchaseName || '-'}</span></p>
                <p className="flex justify-between"><span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Catatan:</span><span className="font-bold text-slate-800 dark:text-slate-200">{previewPo.notes || '-'}</span></p>
                {previewPo.status === 'ALREADY RECEIVE' && (
                  <div className="mt-3 pt-3 border-t border-slate-200/60 space-y-1.5">
                    <p className="text-[9px] font-black uppercase tracking-wider text-emerald-600 mb-1">✓ Informasi Penerimaan Gudang</p>
                    <p className="flex justify-between"><span className="text-[9px] font-black uppercase tracking-wider text-slate-400">No. DO / Surat Jalan:</span><span className="font-bold text-emerald-700">{previewPo.doNo || '-'}</span></p>
                    <p className="flex justify-between"><span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Nama Supir:</span><span className="font-bold text-slate-800 dark:text-slate-200">{previewPo.driverName || '-'}</span></p>
                    <p className="flex justify-between"><span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Nomor Polisi:</span><span className="font-bold text-slate-800 dark:text-slate-200">{previewPo.licensePlate || '-'}</span></p>
                    <p className="flex justify-between"><span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Tanggal Diterima:</span><span className="font-bold text-slate-800 dark:text-slate-200">{previewPo.receivedDate || '-'}</span></p>
                    <p className="flex justify-between"><span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Checker By:</span><span className="font-bold text-emerald-700">{previewPo.checkerBy || '-'}</span></p>
                  </div>
                )}
              </div>
            )}
          />
        )}
      </div>
    </AppContext.Provider>
  );
}
