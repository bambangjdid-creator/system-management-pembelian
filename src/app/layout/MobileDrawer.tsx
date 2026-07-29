import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, CheckCircle2, FileText, LayoutDashboard, Plus, Settings, ShoppingBag, X } from '../../icons';
import SidebarItem from '../../features/components/SidebarItem';
import { isAdmin } from '../../lib/permissions';
import type { AppUser } from '../../lib/types';

type MobileDrawerProps = {
  user: AppUser;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  canSee: (menu: string) => boolean;
  googleToken: string | null;
  handleGoogleLogin: () => void;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
};

export default function MobileDrawer({ user, activeTab, setActiveTab, canSee, googleToken, handleGoogleLogin, mobileMenuOpen, setMobileMenuOpen }: MobileDrawerProps) {
  const go = (tab: string) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
  };

  return (
    <AnimatePresence>
      {mobileMenuOpen && (
        <>
          <motion.div
            key="mobile-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileMenuOpen(false)}
            className="fixed inset-0 bg-black z-40 md:hidden"
          />
          <motion.aside
            key="mobile-sidebar"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 220 }}
            className="fixed inset-y-0 left-0 w-64 bg-white dark:bg-slate-900 z-50 flex flex-col p-6 shadow-2xl md:hidden text-left transition-colors duration-300 border-r border-slate-100 dark:border-slate-800"
          >
            <div className="flex items-center justify-between mb-10 px-2 font-bold text-slate-900 dark:text-slate-100">
              <span className="flex items-center gap-3"><ShoppingBag className="w-6 h-6 text-blue-600" /> Sist. Pembelian</span>
              <button onClick={() => setMobileMenuOpen(false)} className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 space-y-2">
              {canSee('DASHBOARD') && <SidebarItem icon={LayoutDashboard} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => go('dashboard')} />}
              {canSee('CREATE PR') && <SidebarItem icon={Plus} label="Create PR" active={activeTab === 'create-pr'} onClick={() => go('create-pr')} />}
              {canSee('PR HISTORY') && <SidebarItem icon={FileText} label="PR History" active={activeTab === 'history'} onClick={() => go('history')} />}
              {canSee('PO HISTORY') && <SidebarItem icon={ShoppingBag} label="PO History" active={activeTab === 'po-history'} onClick={() => go('po-history')} />}
              {canSee('PURCHASE') && <SidebarItem icon={ShoppingBag} label="Purchase Queue" active={activeTab === 'purchase-queue'} onClick={() => go('purchase-queue')} />}
              {canSee('APPROVAL') && <SidebarItem icon={CheckCircle2} label="Approvals" active={activeTab === 'approvals'} onClick={() => go('approvals')} />}
              {isAdmin(user) && <SidebarItem icon={Settings} label="Settings" active={activeTab === 'settings'} onClick={() => go('settings')} />}
            </nav>
            <div className="mt-auto pt-4 border-t border-slate-50 dark:border-slate-850 space-y-2">
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
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
