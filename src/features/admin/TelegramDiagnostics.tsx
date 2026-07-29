import React, { useState, useEffect } from "react";
import { 
  CheckCircle, 
  AlertTriangle, 
  RefreshCw, 
  Send, 
  Users, 
  Terminal, 
  ShieldCheck, 
  ShieldAlert, 
  AlertCircle,
  Bot
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Swal from "sweetalert2";

interface SystemUser {
  username: string;
  displayName: string;
  role: string;
  telegramChatId: string;
}

interface DiagnosticsData {
  success: boolean;
  tokenSet: boolean;
  webhookUrlSet: boolean;
  botInfo?: {
    id: number;
    is_bot: boolean;
    first_name: string;
    username: string;
  };
  systemUsers: SystemUser[];
}

interface Props {
  apiFetch: (url: string, options?: any) => Promise<any>;
}

export default function TelegramDiagnostics({ apiFetch }: Props) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DiagnosticsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Test Form State
  const [testTarget, setTestTarget] = useState("");
  const [testMessage, setTestMessage] = useState(`🔔 *TES KONEKTIVITAS TELEGRAM* 🔔

Halo, ini adalah pesan uji coba otomatis dari *PR-PO Management System Pro*. Jika Anda menerima ini, bot Telegram berfungsi normal!`);
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    log?: any;
    error?: string;
  } | null>(null);

  const fetchDiagnostics = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/admin/telegram/diagnostics");
      const json = await res.json();
      if (json.success) {
        setData(json);
        if (json.systemUsers && json.systemUsers.length > 0 && !testTarget) {
          const firstTargetUser = json.systemUsers.find((u: SystemUser) => u.telegramChatId);
          if (firstTargetUser) {
            setTestTarget(firstTargetUser.telegramChatId);
          }
        }
      } else {
        setError(json.message || "Gagal memproses data diagnosa Telegram.");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Gagal menghubungi server untuk memuat modul diagnosa.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDiagnostics();
  }, []);

  const handleSendTestMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testTarget) {
      Swal.fire("Error", "Masukkan Chat ID tujuan.", "error");
      return;
    }
    
    setSendingTest(true);
    setTestResult(null);
    try {
      const res = await apiFetch("/api/admin/telegram/send-test-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: testTarget, message: testMessage })
      });
      const json = await res.json();
      setTestResult(json);
      if (json.success) {
        Swal.fire({
          title: "Pesan Terkirim!",
          text: "Silakan cek target Chat ID atau lihat respons di bawah.",
          icon: "success",
          confirmButtonColor: "#4f46e5"
        });
      } else {
        Swal.fire({
          title: "Gagal Mengirim",
          text: json.message || "Gagal mengirim pesan. Periksa detail respons di bawah.",
          icon: "warning",
          confirmButtonColor: "#f59e0b"
        });
      }
    } catch (err: any) {
      console.error(err);
      setTestResult({ success: false, error: err.message || "Koneksi ke API Server gagal." });
      Swal.fire("Error Koneksi", err.message || "Gagal menghubungi server.", "error");
    } finally {
      setSendingTest(false);
    }
  };

  const getHeaderMessage = () => {
    if (!data) return {};
    if (!data.tokenSet) {
      return { 
        text: "TELEGRAM_BOT_TOKEN Tidak Terdeteksi", 
        desc: "Layanan notifikasi Telegram dinonaktifkan karena token tidak ditemukan di environment server.",
        style: "bg-rose-50 border-rose-100 text-rose-800",
        icon: <ShieldAlert className="w-6 h-6 text-rose-600" />
      };
    }
     if (!data.webhookUrlSet) {
      return {
        text: "Peringatan: TELEGRAM_WEBHOOK_URL Tidak Disetel",
        desc: "Meskipun Token Bot ada, URL Webhook tidak dikonfigurasi. Sistem akan kembali menggunakan mode 'polling' untuk mendapatkan pembaruan, yang kurang efisien. Harap setel URL webhook untuk fungsionalitas penuh.",
        style: "bg-amber-50 border-amber-200 text-amber-900",
        icon: <AlertTriangle className="w-6 h-6 text-amber-600" />
      };
    }
    return {
      text: "Bot Telegram Siap Beroperasi",
      desc: `Layanan terhubung menggunakan bot: @${data.botInfo?.username}. Notifikasi untuk persetujuan PR akan dikirim melalui bot ini.`,
      style: "bg-emerald-50 border-emerald-100 text-emerald-800",
      icon: <ShieldCheck className="w-6 h-6 text-emerald-600" />
    };
  };

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-slate-100 shadow-sm min-h-[350px]">
        <RefreshCw className="w-10 h-10 text-indigo-600 animate-spin mb-4" />
        <p className="text-slate-600 font-bold">Menganalisa Modul Telegram...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-8 space-y-6">
        <div className="flex items-center gap-4 p-5 bg-rose-50 rounded-2xl border border-rose-100 text-rose-800">
          <AlertCircle className="w-10 h-10 text-rose-600 flex-shrink-0" />
          <div>
            <h4 className="font-bold text-lg">Modul Diagnosa Gagal Dimuat</h4>
            <p className="text-sm opacity-90 mt-1">{error}</p>
          </div>
        </div>
        <button onClick={fetchDiagnostics} className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition duration-200">
          <RefreshCw className="w-4 h-4" /> Coba Lagi
        </button>
      </div>
    );
  }
  
  const alertBox = getHeaderMessage();

  return (
    <div className="space-y-8">
      {/* 1. Header Alert Banner */}
      {data && (
        <div className={`p-6 rounded-3xl border flex items-start gap-4 ${alertBox.style} shadow-sm`}>
          <div className="p-3 bg-white bg-opacity-70 rounded-2xl shadow-sm">{alertBox.icon}</div>
          <div>
            <h3 className="text-lg font-extrabold tracking-tight">{alertBox.text}</h3>
            <p className="text-sm leading-relaxed opacity-90 font-medium">{alertBox.desc}</p>
          </div>
        </div>
      )}

      {/* 2. Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-4">
           <div className="bg-white border border-slate-100 p-5 rounded-3xl shadow-sm flex items-center gap-4">
            <div className="p-3 bg-blue-50 rounded-2xl text-blue-600"><Bot className="w-6 h-6" /></div>
            <div>
              <p className="text-slate-500 font-bold text-xs uppercase tracking-wider">Bot Aktif</p>
              <h4 className="text-xl font-black text-slate-800 mt-1">@{data?.botInfo?.username || 'N/A'}</h4>
            </div>
          </div>
          <div className="bg-white border border-slate-100 p-5 rounded-3xl shadow-sm flex items-center gap-4">
            <div className="p-3 bg-indigo-50 rounded-2xl text-indigo-600"><Users className="w-6 h-6" /></div>
            <div>
              <p className="text-slate-500 font-bold text-xs uppercase tracking-wider">Penerima Notifikasi</p>
              <h4 className="text-2xl font-black text-slate-800 mt-1">{data?.systemUsers?.filter(u => u.telegramChatId).length || 0} <span className="text-xs text-slate-400 font-normal">user</span></h4>
            </div>
          </div>
        </div>
        
        <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-4">
            <h3 className="font-extrabold text-slate-800 text-base flex items-center gap-2">
                <Terminal className="w-5 h-5 text-indigo-500" />
                Tes Pengiriman Pesan
            </h3>
            <form onSubmit={handleSendTestMessage} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs text-slate-500 font-bold uppercase tracking-wider block">Pilih Penerima (dari User Terdaftar)</label>
                <select
                  value={testTarget}
                  onChange={e => setTestTarget(e.target.value)}
                  className="w-full text-slate-700 bg-white border border-slate-200 outline-none rounded-xl px-4 py-2.5 text-sm font-bold focus:border-indigo-500 shadow-sm transition"
                >
                  <option value="">-- Pilih Pengguna --</option>
                  {data?.systemUsers?.filter(u => u.telegramChatId).map(user => (
                    <option key={user.username} value={user.telegramChatId}>
                      {user.displayName} ({user.role})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-slate-500 font-bold uppercase tracking-wider block">Telegram Chat ID Manual</label>
                <input 
                    type="text" 
                    value={testTarget}
                    onChange={e => setTestTarget(e.target.value)}
                    placeholder="Masukkan Chat ID..."
                    required
                    className="w-full text-slate-700 bg-white border border-slate-200 outline-none rounded-xl px-4 py-2.5 text-sm font-bold focus:border-indigo-500 shadow-sm transition"
                  />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-slate-500 font-bold uppercase tracking-wider block">Isi Pesan</label>
                <textarea 
                  rows={4}
                  value={testMessage}
                  onChange={e => setTestMessage(e.target.value)}
                  required
                  className="w-full text-slate-600 bg-white border border-slate-200 outline-none rounded-2xl p-4 text-xs font-mono focus:border-indigo-500 shadow-sm leading-relaxed transition"
                ></textarea>
                 <p className="text-slate-400 text-[10px]">Pesan mendukung format <a href="https://core.telegram.org/bots/api#markdown-style" target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:underline">Markdown</a> (*bold*, _italic_).</p>
              </div>

              <button
                type="submit"
                disabled={sendingTest}
                className={`w-full text-white bg-indigo-600 hover:bg-indigo-700 font-bold text-sm py-3 px-6 rounded-2xl flex items-center justify-center gap-2 shadow-lg transition active:scale-98 ${sendingTest ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <Send className={`w-4 h-4 ${sendingTest ? "animate-pulse" : ""}`} />
                {sendingTest ? "Mengirim Pesan..." : "Kirim Pesan Tes"}
              </button>
            </form>
            
            <AnimatePresence>
              {testResult && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className={`p-4 rounded-2xl border text-xs font-mono space-y-2 mt-4 ${testResult.success ? "bg-emerald-50 border-emerald-150 text-emerald-900" : "bg-rose-50 border-rose-150 text-rose-900"}`}
                >
                  <div className="flex items-center justify-between border-b border-black border-opacity-5 pb-2">
                    <span className="font-extrabold flex items-center gap-1">
                      {testResult.success ? <CheckCircle className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-rose-600" />}
                      {testResult.success ? "SUCCESS" : "FAILED"}
                    </span>
                    <span className="text-[10px] opacity-75">{new Date().toLocaleTimeString()}</span>
                  </div>
                  <div className="bg-white bg-opacity-70 p-2.5 rounded-lg border border-black border-opacity-5 max-h-[140px] overflow-y-auto w-full text-[9px] text-slate-700">
                    <strong>RAW API JSON Response:</strong>
                    <pre className="mt-1 font-mono break-all whitespace-pre-wrap">{JSON.stringify(testResult.log || { error: testResult.error }, null, 2)}</pre>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
