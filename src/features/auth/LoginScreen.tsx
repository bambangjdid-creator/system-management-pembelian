import React from 'react';
import { motion } from 'framer-motion';
import { Check, Eye, EyeOff, Lock, Moon, Sun, User } from '../../icons';

type LoginScreenProps = {
  isDarkMode: boolean;
  setIsDarkMode: (value: boolean) => void;
  showPassword: boolean;
  setShowPassword: (value: boolean) => void;
  loginData: { username: string; password: string };
  setLoginData: (value: { username: string; password: string }) => void;
  handleLogin: (e: React.FormEvent) => void;
  handleGoogleLogin: () => void;
  googleToken: string | null;
  isLoading: boolean;
};

export default function LoginScreen({ isDarkMode, setIsDarkMode, showPassword, setShowPassword, loginData, setLoginData, handleLogin, handleGoogleLogin, googleToken, isLoading }: LoginScreenProps) {
  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-800'} flex items-center justify-center p-4 transition-colors duration-300 relative`}>
      <div className="absolute top-6 right-6">
        <button
          type="button"
          onClick={() => setIsDarkMode(!isDarkMode)}
          className="p-3 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 rounded-xl border border-slate-200 dark:border-slate-800 shadow-md hover:bg-slate-50 dark:hover:bg-slate-800 transition active:scale-95"
          title="Ubah Tema"
        >
          {isDarkMode ? <Sun className="w-5 h-5 text-amber-400 font-extrabold animate-pulse" /> : <Moon className="w-5 h-5 text-indigo-650" />}
        </button>
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-4xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden border border-slate-100 dark:border-slate-800/80 flex flex-col md:flex-row transition-colors duration-300"
      >
        <div className="hidden md:flex md:w-1/2 bg-gradient-to-br from-blue-700 via-blue-600 to-indigo-800 p-12 text-white flex-col justify-between relative overflow-hidden">
          <div className="absolute -left-12 -bottom-12 w-64 h-64 rounded-full bg-blue-500/20 blur-xl pointer-events-none" />
          <div className="absolute -right-16 -top-16 w-80 h-80 rounded-full bg-indigo-500/20 blur-xl pointer-events-none" />
          <div className="absolute right-4 bottom-4 w-48 h-48 rounded-full bg-blue-400/20 blur-md pointer-events-none" />
          <div className="relative z-10 flex flex-col h-full justify-between min-h-[400px]">
            <div>
              <span className="text-[10px] font-black uppercase tracking-[0.25em] bg-white/20 backdrop-blur-md px-3.5 py-1.5 rounded-full text-white">CV. SAU</span>
              <h2 className="text-3xl font-extrabold tracking-tight mt-10 leading-snug">Sistem Manajemen Pembelian</h2>
              <div className="w-16 h-1 bg-white/40 rounded-full mt-4" />
            </div>
            <div className="space-y-4">
              <p className="text-2xl font-black text-blue-50 tracking-wide uppercase">Selamat Datang</p>
              <p className="text-xs text-blue-105/90 leading-relaxed font-normal">Sistem manajemen pembelian dengan alur kerja persetujuan multi-level, dasbor real-time, dan integrasi Google Sheets.</p>
            </div>
            <p className="text-[10px] text-blue-300/40 uppercase font-mono tracking-widest mt-6">© 2026 CV. SAU • Semua hak dilindungi undang-undang</p>
          </div>
        </div>

        <div className="w-full md:w-1/2 p-8 md:p-12 flex flex-col justify-center bg-white dark:bg-slate-900 transition-colors duration-300">
          <div className="flex flex-col items-center text-center">
            <div className="w-20 h-20 mb-3 flex items-center justify-center p-1.5 rounded-2xl bg-white border border-slate-100 dark:border-slate-800 shadow-md">
              <div className="w-full h-full rounded-xl bg-blue-600 text-white flex items-center justify-center font-black text-xl">SAU</div>
            </div>
            <h3 className="text-xl font-bold tracking-tight text-slate-800 dark:text-white">CV. SAU</h3>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider mt-0.5">Sistem Manajemen Pembelian</p>
          </div>

          <form onSubmit={handleLogin} className="mt-8 space-y-4 text-left">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">Nama Pengguna (Username)</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-505"><User className="w-4 h-4" /></span>
                <input type="text" placeholder="Masukkan username Anda" className="w-full pl-11 pr-4 py-3 text-sm rounded-xl border border-slate-200 dark:border-slate-850 dark:bg-slate-800/80 dark:text-white focus:outline-none focus:border-blue-500 dark:focus:border-blue-400" required value={loginData.username} onChange={e => setLoginData({ ...loginData, username: e.target.value })} />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-505 mb-1.5">Kata Sandi (Password)</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-550"><Lock className="w-4 h-4" /></span>
                <input type={showPassword ? 'text' : 'password'} placeholder="Masukkan password Anda" className="w-full pl-11 pr-24 py-3 text-sm rounded-xl border border-slate-200 dark:border-slate-850 dark:bg-slate-800/80 dark:text-white focus:outline-none focus:border-blue-500 dark:focus:border-blue-400" required value={loginData.password} onChange={e => setLoginData({ ...loginData, password: e.target.value })} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] font-extrabold uppercase tracking-wider text-blue-600 dark:text-blue-405 hover:text-blue-800 transition active:scale-95 flex items-center gap-1 bg-blue-50/50 dark:bg-blue-950/20 px-2 py-1 rounded">
                  {showPassword ? <><EyeOff className="w-3 h-3" /><span>Sembunyikan</span></> : <><Eye className="w-3 h-3" /><span>Lihat</span></>}
                </button>
              </div>
            </div>

            <div className="pt-2">
              <button disabled={isLoading} type="submit" className="w-full bg-blue-600 dark:bg-blue-600 text-white font-extrabold py-3.5 rounded-xl shadow-lg dark:shadow-blue-950/20 hover:bg-blue-700 active:scale-[0.98] transition-all text-sm">
                {isLoading ? 'Sedang Masuk...' : 'Masuk'}
              </button>
            </div>

            <div className="relative flex py-1.5 items-center">
              <div className="flex-grow border-t border-slate-100 dark:border-slate-805" />
              <span className="flex-shrink mx-4 text-slate-400 dark:text-slate-600 text-[10px] uppercase font-bold tracking-widest">Atau</span>
              <div className="flex-grow border-t border-slate-100 dark:border-slate-805" />
            </div>

            {!googleToken ? (
              <button type="button" onClick={handleGoogleLogin} className="w-full bg-white dark:bg-slate-850 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold py-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-center gap-3 transition-all text-xs">
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-4 h-4" alt="Google" />
                Hubungkan Google Drive (PDF)
              </button>
            ) : (
              <div className="flex items-center justify-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold text-xs bg-emerald-50 dark:bg-emerald-950/20 py-3 rounded-xl border border-emerald-100 dark:border-emerald-950/30">
                <Check className="w-4 h-4" /> Google Drive Terhubung
              </div>
            )}
          </form>
        </div>
      </motion.div>
    </div>
  );
}
