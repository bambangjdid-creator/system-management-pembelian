import React from 'react';
import { motion } from 'framer-motion';
import UserManagement from './UserManagement';
import StockManagement from './StockManagement';
import WhatsAppDiagnostics from './WhatsAppDiagnostics';

import { useAppContext } from '../../store/AppContext';

export default function SettingsView() {
  const ctx = useAppContext();
  const {
    activeTab,
    user,
    settingsTab,
    setSettingsTab,
    adminData,
    handleAddUser,
    handleEditUser,
    handleDeleteUser,
    handleAddStock,
    handleEditStock,
    handleDeleteStock,
    apiFetch,
  } = ctx;

  if (!(activeTab === 'settings' && user?.role?.toUpperCase() === 'ADMIN')) return null;

  return (
    <motion.div key="settings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex flex-wrap gap-4 mb-6">
        <button onClick={() => setSettingsTab('users')} className={`px-6 py-2 rounded-xl font-bold transition-all ${settingsTab === 'users' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-slate-600 border border-slate-100'}`}>User Management</button>
        <button onClick={() => setSettingsTab('stock')} className={`px-6 py-2 rounded-xl font-bold transition-all ${settingsTab === 'stock' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-slate-600 border border-slate-100'}`}>Inventory Master</button>
        <button onClick={() => setSettingsTab('whatsapp')} className={`px-6 py-2 rounded-xl font-bold transition-all ${settingsTab === 'whatsapp' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-slate-600 border border-slate-100'}`}>WhatsApp Diagnostics</button>
      </div>

      {settingsTab === 'users' && (
        <UserManagement
          users={adminData.users}
          onAddUser={handleAddUser}
          onEditUser={handleEditUser}
          onDeleteUser={handleDeleteUser}
        />
      )}

      {settingsTab === 'stock' && (
        <StockManagement
          stock={adminData.stock}
          onAddStock={handleAddStock}
          onEditStock={handleEditStock}
          onDeleteStock={handleDeleteStock}
        />
      )}

      {settingsTab === 'whatsapp' && <WhatsAppDiagnostics apiFetch={apiFetch} />}
    </motion.div>
  );
}
