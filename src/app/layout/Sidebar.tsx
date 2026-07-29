import React from 'react';
import { Check, CheckCircle2, FileText, LayoutDashboard, Plus, Settings, ShoppingBag } from '../../icons';
import SidebarItem from '../../features/components/SidebarItem';
import { isAdmin } from '../../lib/permissions';
import type { AppUser } from '../../lib/types';

type SidebarProps = {
  user: AppUser;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  canSee: (menu: string) => boolean;
  googleToken: string | null;
  handleGoogleLogin: () => void;
};

export default function Sidebar({ user, activeTab, setActiveTab, canSee, googleToken, handleGoogleLogin }: SidebarProps) {
  return (
    <aside className="w-64 bg-white dark:bg-slate-900 border-r border-slate-100 dark:border-slate-800 hidden md:flex flex-col p-6 shrink-0 transition-colors duration-300">
      <div className="flex items-center gap-3 mb-10 px-2 font-black text-slate-900 dark:text-slate-100">
        <ShoppingBag className="w-6 h-6 text-blue-600" />
        <span className="tracking-tight">Sist. Pembelian</span>
      </div>
      <nav className="flex-1 space-y-2">
        {canSee('DASHBOARD') && <SidebarItem icon={LayoutDashboard} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />}
        {canSee('CREATE PR') && <SidebarItem icon={Plus} label="Create PR" active={activeTab === 'create-pr'} onClick={() => setActiveTab('create-pr')} />}
        {canSee('PR HISTORY') && <SidebarItem icon={FileText} label="PR History" active={activeTab === 'history'} onClick={() => setActiveTab('history')} />}
        {canSee('PO HISTORY') && <SidebarItem icon={ShoppingBag} label="PO History" active={activeTab === 'po-history'} onClick={() => setActiveTab('po-history')} />}
        {canSee('PURCHASE') && <SidebarItem icon={ShoppingBag} label="Purchase Queue" active={activeTab === 'purchase-queue'} onClick={() => setActiveTab('purchase-queue')} />}
        {canSee('APPROVAL') && <SidebarItem icon={CheckCircle2} label="Approvals" active={activeTab === 'approvals'} onClick={() => setActiveTab('approvals')} />}
        {isAdmin(user) && <SidebarItem icon={Settings} label="Settings" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />}
      </nav>
      <div className="mt-auto pt-4 border-t border-slate-50 dark:border-slate-805 space-y-2">
        {!googleToken ? (
          <button onClick={handleGoogleLogin} className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-600 dark:text-slate-350 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all font-semibold w-full text-left">
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
            <span className="text-sm">Hubungkan Google</span>
          </button>
        ) : (
          <div className="flex items-center gap-3 px-4 py-3 text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/20 rounded-xl border border-emerald-100 dark:border-emerald-900 m-2">
            <Check className="w-4 h-4" />
            <span className="text-[10px] uppercase">Google Aktif</span>
          </div>
        )}
      </div>
    </aside>
  );
}
