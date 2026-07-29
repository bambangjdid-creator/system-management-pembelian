import React from 'react';
import { LogOut, Menu, Moon, Sun } from '../../icons';
import type { AppUser } from '../../lib/types';

type HeaderProps = {
  activeTab: string;
  user: AppUser;
  isDarkMode: boolean;
  setIsDarkMode: (value: boolean) => void;
  setMobileMenuOpen: (open: boolean) => void;
  handleLogout: () => void;
};

export default function Header({ activeTab, user, isDarkMode, setIsDarkMode, setMobileMenuOpen, handleLogout }: HeaderProps) {
  const displayName = user.displayName || user.fullName || user.username || 'User';

  return (
    <header className="mb-10 flex justify-between items-center gap-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="p-2.5 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-350 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm md:hidden hover:bg-slate-50 dark:hover:bg-slate-800 transition"
          aria-label="Open Menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <h2 className="text-xl md:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white capitalize">{activeTab.replace('-', ' ')}</h2>
      </div>
      <div className="flex items-center gap-3 md:gap-4">
        <button
          onClick={() => setIsDarkMode(!isDarkMode)}
          className="p-2.5 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-350 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-all active:scale-95"
          aria-label="Toggle Theme"
          title="Ganti Tema"
        >
          {isDarkMode ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5 text-indigo-650" />}
        </button>
        <div className="flex items-center gap-3 bg-white dark:bg-slate-900 px-3 md:px-4 py-2 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm transition-colors duration-300">
          <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">{displayName[0]?.toUpperCase()}</div>
          <span className="font-extrabold text-slate-700 dark:text-slate-200 text-sm hidden sm:inline">{displayName}</span>
        </div>
        <button onClick={handleLogout} className="p-2.5 bg-white dark:bg-slate-900 text-red-500 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm hover:bg-red-50 dark:hover:bg-red-950/20 transition-all font-bold" title="Keluar">
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}
