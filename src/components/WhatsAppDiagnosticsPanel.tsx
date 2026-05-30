import React, { useState, useEffect } from "react";
import { 
  CheckCircle, 
  AlertTriangle, 
  RefreshCw, 
  Send, 
  Users, 
  MessageSquare, 
  Terminal, 
  ChevronDown, 
  ChevronUp, 
  ShieldCheck, 
  ShieldAlert, 
  Database,
  CloudLightning,
  AlertCircle,
  Clock,
  UserCheck,
  Search,
  Key,
  Save
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import Swal from "sweetalert2";

interface SystemUser {
  username: string;
  displayName: string;
  role: string;
  divisionCode: string;
  wa: string;
  isManagerOrDirector: boolean;
  isAdmin: boolean;
}

interface WaLog {
  timestamp: string;
  target: string;
  recipientName: string;
  recipientRole: string;
  messageType: string;
  message: string;
  status: "SUCCESS" | "FAILED";
  gatewayResponse: string;
}

interface DiagnosticsData {
  success: boolean;
  tokenSet: boolean;
  tokenPreview: string;
  isDefaultToken: boolean;
  rawToken: string;
  diagnostics: {
    totalUsersInDatabase: number;
    managersAndDirectorsCount: number;
    adminsCount: number;
    usersWithWhatsAppCount: number;
  };
  systemUsers: SystemUser[];
  logs: WaLog[];
}

interface Props {
  apiFetch: (url: string, options?: any) => Promise<any>;
}

export default function WhatsAppDiagnosticsPanel({ apiFetch }: Props) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DiagnosticsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Fonnte Token State
  const [waTokenInput, setWaTokenInput] = useState("");
  const [savingToken, setSavingToken] = useState(false);

  // Test Form State
  const [testTarget, setTestTarget] = useState("");
  const [testMessage, setTestMessage] = useState(
    `🔔 *TES KONEKTIVITAS WHATSAPP GW* 🔔\n\nHalo, ini adalah pesan uji coba otomatis dari *PR-PO Management System Pro*. Uji koneksi WhatsApp Gateway berhasil dengan lancar!`
  );
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    log?: WaLog;
    error?: string;
  } | null>(null);

  // Filter/Search State for Recipients
  const [userSearch, setUserSearch] = useState("");
  
  // Collapsed Log Detail Indices
  const [expandedLogId, setExpandedLogId] = useState<number | null>(null);

  const fetchDiagnostics = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/wa-diagnostics");
      const json = await res.json();
      if (json.success) {
        setData(json);
        if (json.rawToken) {
          setWaTokenInput(json.rawToken);
        }
        // Pre-fill test recipient with the first PR alert recipient if empty
        if (json.systemUsers && json.systemUsers.length > 0 && !testTarget) {
          const firstTargetUser = json.systemUsers.find((u: SystemUser) => u.isManagerOrDirector && u.wa) || 
                                  json.systemUsers.find((u: SystemUser) => u.wa);
          if (firstTargetUser) {
            setTestTarget(firstTargetUser.wa);
          }
        }
      } else {
        setError(json.message || "Gagal memproses data diagnosa WA.");
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

  const handleSaveToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!waTokenInput.trim()) {
      Swal.fire("Error", "Token tidak boleh kosong.", "error");
      return;
    }
    setSavingToken(true);
    try {
      const res = await apiFetch("/api/wa-save-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: waTokenInput.trim() })
      });
      const json = await res.json();
      if (json.success) {
        Swal.fire({
          title: "Token Disimpan!",
          text: "Kunci WhatsApp Fonnte berhasil diperbarui. Silakan uji coba pengiriman pesan sekarang!",
          icon: "success",
          confirmButtonColor: "#4f46e5"
        });
        await fetchDiagnostics();
      } else {
        Swal.fire("Gagal", json.message || "Gagal menyimpan token.", "error");
      }
    } catch (err: any) {
      console.error(err);
      Swal.fire("Error", err.message || "Gagal merespon penyimpanan token.", "error");
    } finally {
      setSavingToken(false);
    }
  };

  const handleSendTestMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testTarget) {
      Swal.fire("Error", "Masukkan nomor target WhatsApp tujuan.", "error");
      return;
    }
    
    setSendingTest(true);
    setTestResult(null);
    try {
      const res = await apiFetch("/api/wa-test-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: testTarget, message: testMessage })
      });
      const json = await res.json();
      if (json.success) {
        setTestResult({ success: true, log: json.log });
        Swal.fire({
          title: "Pesan Terkirim!",
          text: "Silakan cek nomor tujuan atau cek respons gateway di bawah penel.",
          icon: "success",
          confirmButtonColor: "#4f46e5"
        });
        // Refresh diagnostics to update event logs feed
        await fetchDiagnostics();
      } else {
        setTestResult({ success: false, log: json.log, error: json.message || "Tolak oleh gateway" });
        Swal.fire({
          title: "Gateway Menolak",
          text: "Gagal mengirim pesan WA. Periksa detail respons JSON API Gateway di bawah.",
          icon: "warning",
          confirmButtonColor: "#f59e0b"
        });
      }
    } catch (err: any) {
      console.error(err);
      setTestResult({ success: false, error: err.message || "Koneksi ke API Server gagal." });
      Swal.fire("Error Koneksi", err.message || "Gagal menghubungi server pengenal.", "error");
    } finally {
      setSendingTest(false);
    }
  };

  const getCleanedHeaderMessage = () => {
    if (!data) return { text: "", style: "" };
    if (!data.tokenSet) {
      return { 
        text: "Kunci Akses WA_API_TOKEN Tidak Terdeteksi", 
        desc: "Layanan notifikasi dinonaktifkan sepenuhnya karena tidak ada token yang dikonfigurasi pada environment server maupun file .env.example.",
        style: "bg-rose-50 border-rose-100 text-rose-800",
        icon: <ShieldAlert className="w-6 h-6 text-rose-600" />
      };
    }
    if (data.isDefaultToken) {
      return {
        text: "Peringatan: Token Default Terdeteksi (Placeholder)",
        desc: "Sistem mendeteksi bahwa WA_API_TOKEN Anda saat ini menggunakan token placeholder 'EAATixkW...' dari format default .env.example. Gateway Fonnte tidak bisa beroperasi dengan token ini karena token tersebut merupakan format OAuth Meta / Facebook Graph API. Hubungi admin untuk memperbarui variabel lingkungan server Anda dengan token gateway Anda yang sesungguhnya.",
        style: "bg-amber-50 border-amber-200 text-amber-900",
        icon: <AlertTriangle className="w-6 h-6 text-amber-600" />
      };
    }
    return {
      text: "WhatsApp API Gateway Siap Beroperasi",
      desc: `Layanan diaktifkan menggunakan token kustom yang terkonfigurasi. Penyelarasan nomor dan hak akses database dari sistem sudah berjalan otomatis.`,
      style: "bg-emerald-50 border-emerald-100 text-emerald-800",
      icon: <ShieldCheck className="w-6 h-6 text-emerald-600" />
    };
  };

  const toggleExpandLog = (index: number) => {
    if (expandedLogId === index) {
      setExpandedLogId(null);
    } else {
      setExpandedLogId(index);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-slate-100 shadow-sm min-h-[350px]">
        <RefreshCw className="w-10 h-10 text-indigo-600 animate-spin mb-4" />
        <p className="text-slate-600 font-bold">Menganalisa dan Menghubungkan Modul WhatsApp...</p>
        <p className="text-slate-400 text-sm mt-1">Membaca Spreadsheet User_Role & status gateway tokens</p>
      </div>
    );
  }

  // Handle Sheet connection failures
  if (error) {
    return (
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-8 space-y-6">
        <div className="flex items-center gap-4 p-5 bg-rose-50 rounded-2xl border border-rose-100 text-rose-800">
          <AlertCircle className="w-10 h-10 text-rose-600 flex-shrink-0" />
          <div>
            <h4 className="font-bold text-lg">Modul Diagnosa Tidak Dapat Dimuat</h4>
            <p className="text-sm opacity-90 mt-1">{error}</p>
          </div>
        </div>
        <button onClick={fetchDiagnostics} className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition duration-200">
          <RefreshCw className="w-4 h-4" /> Coba Lagi
        </button>
      </div>
    );
  }

  const alertBox = getCleanedHeaderMessage();
  const filteredUsers = (data?.systemUsers || []).filter(u => 
    u.displayName.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.role.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.username.toLowerCase().includes(userSearch.toLowerCase()) ||
    (u.wa || "").includes(userSearch)
  );

  return (
    <div className="space-y-8">
      {/* 1. Header Alert Banner */}
      {data && (
        <div className={`p-6 rounded-3xl border flex flex-col md:flex-row items-start gap-4 ${alertBox.style} shadow-sm transition-all duration-300`}>
          <div className="p-3 bg-white bg-opacity-70 rounded-2xl shadow-sm flex-shrink-0">
            {alertBox.icon}
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-extrabold tracking-tight">{alertBox.text}</h3>
            <p className="text-sm leading-relaxed opacity-90 font-medium">{alertBox.desc}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2 text-xs font-mono">
              <span>Token Server: <strong className="bg-white bg-opacity-50 px-2 py-0.5 rounded">{data.tokenPreview}</strong></span>
              <span>Status Token: <strong className="bg-white bg-opacity-50 px-2 py-0.5 rounded text-[10px]">{data.isDefaultToken ? "PLACEHOLDER (.env.example)" : "REAL / CUSTOM ENVIRONMENT"}</strong></span>
            </div>
          </div>
          <button 
            onClick={fetchDiagnostics} 
            className="md:ml-auto self-center p-3 bg-white hover:bg-slate-50 border border-slate-150 rounded-2xl shadow-sm transition duration-200 flex items-center gap-2 text-slate-700 text-sm font-bold active:scale-95"
            title="Refresh Diagnostic Status"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 2. Diagnostics Metrics Grid */}
      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          <div className="bg-white border border-slate-100 p-5 rounded-3xl shadow-sm flex items-center gap-4">
            <div className="p-3 bg-indigo-50 rounded-2xl text-indigo-600">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <p className="text-slate-500 font-bold text-xs uppercase tracking-wider">Total Database User</p>
              <h4 className="text-2xl font-black text-slate-800 mt-1">{data.diagnostics.totalUsersInDatabase} <span className="text-xs text-slate-400 font-normal">akun</span></h4>
            </div>
          </div>

          <div className="bg-white border border-slate-100 p-5 rounded-3xl shadow-sm flex items-center gap-4">
            <div className="p-3 bg-purple-50 rounded-2xl text-purple-600">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <p className="text-slate-500 font-bold text-xs uppercase tracking-wider">Penerima Notif PR Baru</p>
              <h4 className="text-2xl font-black text-slate-800 mt-1">{data.diagnostics.managersAndDirectorsCount} <span className="text-xs text-slate-400 font-normal">user</span></h4>
            </div>
          </div>

          <div className="bg-white border border-slate-100 p-5 rounded-3xl shadow-sm flex items-center gap-4">
            <div className="p-3 bg-blue-50 rounded-2xl text-blue-600">
              <UserCheck className="w-6 h-6" />
            </div>
            <div>
              <p className="text-slate-500 font-bold text-xs uppercase tracking-wider">Penerima Status PO/Pr</p>
              <h4 className="text-2xl font-black text-slate-800 mt-1">{data.diagnostics.adminsCount} <span className="text-xs text-slate-400 font-normal">admin</span></h4>
            </div>
          </div>

          <div className="bg-white border border-slate-100 p-5 rounded-3xl shadow-sm flex items-center gap-4">
            <div className="p-3 bg-emerald-50 rounded-2xl text-emerald-600">
              <MessageSquare className="w-6 h-6" />
            </div>
            <div>
              <p className="text-slate-500 font-bold text-xs uppercase tracking-wider">Kontak Memiliki No WA</p>
              <h4 className="text-2xl font-black text-slate-800 mt-1">{data.diagnostics.usersWithWhatsAppCount} <span className="text-xs text-slate-400 font-normal">kontak</span></h4>
            </div>
          </div>
        </div>
      )}

      {/* 3. Main Split View: Recipients Checker vs. SandBox Test Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Side: Recipients Mapped Checker (7 Cols) */}
        <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
          <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="font-extrabold text-slate-800 text-lg flex items-center gap-2">
                <Database className="w-5 h-5 text-indigo-500" />
                Daftar Sinkronisasi Penerima Notifikasì
              </h3>
              <p className="text-slate-500 text-xs mt-1">Daftar pengguna dari tabel User_Role beserta analisis hak penerimaan pesan.</p>
            </div>
            <div className="relative w-full md:w-48">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
              <input 
                type="text" 
                placeholder="Cari user..."
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                className="w-full text-slate-600 placeholder-slate-400 text-xs pl-9 pr-3 py-2 border border-slate-200 outline-none rounded-xl focus:border-indigo-500 transition"
              />
            </div>
          </div>

          <div className="overflow-x-auto flex-1 max-h-[450px] overflow-y-auto">
            <table className="w-full text-left font-medium text-xs">
              <thead className="bg-slate-50 border-b border-slate-100 sticky top-0">
                <tr>
                  <th className="px-5 py-3 text-slate-500 uppercase font-black text-[10px]">Nama Lengkap / Username</th>
                  <th className="px-5 py-3 text-slate-500 uppercase font-black text-[10px]">Peran / Divisi</th>
                  <th className="px-5 py-3 text-slate-500 uppercase font-black text-[10px]">No. WhatsApp</th>
                  <th className="px-5 py-3 text-slate-500 uppercase font-black text-[10px]">Kriteria Alir Notifikasi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-slate-400">
                      Tidak ada pengguna yang cocok dengan kueri pencarian.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition">
                      <td className="px-5 py-4.5">
                        <p className="font-extrabold text-slate-850 text-sm">{u.displayName}</p>
                        <p className="text-slate-400 font-mono text-[10px] mt-0.5">@{u.username}</p>
                      </td>
                      <td className="px-5 py-4.5">
                        <p className="font-extrabold text-slate-700">{u.role}</p>
                        <p className="text-slate-400 mt-0.5">Kode Divisi: <strong className="text-slate-600 font-mono text-[10px]">{u.divisionCode || "-"}</strong></p>
                      </td>
                      <td className="px-5 py-4.5 font-mono">
                        {u.wa ? (
                          <div className="space-y-1">
                            <span className="text-slate-800 font-bold bg-slate-100 px-2 py-1 rounded-lg text-[10px]">
                              {u.wa}
                            </span>
                            {/* Standard check for Indonesian formatting */}
                            {!u.wa.replace(/[^0-9]/g, "").startsWith("0") && !u.wa.replace(/[^0-9]/g, "").startsWith("62") && (
                              <p className="text-amber-500 text-[9px] flex items-center gap-1">
                                <AlertTriangle className="w-2.5 h-2.5" /> Struktur bukan Indonesia (0 / 62)
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-amber-50 border border-amber-150 text-amber-600 rounded-lg text-[9px] font-bold shadow-sm">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                            Matikan / Kosong
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4.5 space-y-1.5">
                        <div className="flex flex-wrap gap-1.5">
                          {u.isManagerOrDirector ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-50 border border-purple-100 text-purple-600 rounded-md text-[9px] font-black uppercase tracking-wider" title="Menerima pesan WA setiap kali ada staff membuat PR baru">
                              <span className="w-1.5 h-1.5 rounded-full bg-purple-500 block animate-pulse"></span>
                              🔔 Penerima PR Baru
                            </span>
                          ) : null}

                          {u.isAdmin ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 border border-blue-100 text-blue-600 rounded-md text-[9px] font-black uppercase tracking-wider" title="Menerima pesan WA setiap kali Manager memberikan persetujuan atau penolakan PR">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 block"></span>
                              📢 Penerima Status PR
                            </span>
                          ) : null}

                          {!u.isManagerOrDirector && !u.isAdmin ? (
                            <span className="text-slate-400 font-medium text-[10px] italic">
                              Hanya Pengisi PR (Tanpa Notif Keluar)
                            </span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="bg-slate-50 p-4 border-t border-slate-100 text-slate-500 text-[10px] leading-relaxed">
            💡 <strong>Sistem Otomasi Peran:</strong> Siapa saja yang memiliki <strong>ROLE</strong> mengandung istilah <em>Manager, Manajer, Direktur, Direksi, Dir, Kabag, Kadiv</em> atau kolom <strong>DIVISI_KODE</strong> sama dengan <em>MGR</em> atau <em>DIR</em> akan secara otomatis diklasifikasikan sebagai <strong>Penerima PR Baru</strong> untuk persetujuan.
          </div>
        </div>

        {/* Right Side: Stacked Fonnte Token Settings & Sandbox Test Form (5 Cols) */}
        <div className="lg:col-span-5 space-y-6 flex flex-col">
          
          {/* Card A: Fonnte Token Settings */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-4">
            <div className="space-y-1">
              <h3 className="font-extrabold text-slate-800 text-base flex items-center gap-2">
                <Key className="w-5 h-5 text-indigo-500" />
                Pengaturan Kunci API Fonnte
              </h3>
              <p className="text-slate-500 text-xs">Simpan Kunci Token Fonnte Anda agar tersimpan permanen di server.</p>
            </div>

            <form onSubmit={handleSaveToken} className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs text-slate-500 font-bold uppercase tracking-wider block">Fonnte API Token</label>
                <input 
                  type="password" 
                  value={waTokenInput}
                  onChange={e => setWaTokenInput(e.target.value)}
                  placeholder="Contoh: a1b2c3d4e5f6g7h8..."
                  required
                  className="w-full text-slate-700 bg-white border border-slate-200 outline-none rounded-xl px-4 py-2.5 text-xs font-mono focus:border-indigo-500 shadow-sm transition"
                />
              </div>

              <div className="bg-amber-50 md:p-3 p-2.5 rounded-xl border border-amber-100 text-amber-900 text-[11px] leading-relaxed">
                📢 <strong>Cara Mendapatkan Token:</strong> Login ke <strong>https://fonnte.com</strong>, buka menu <strong>Device / API</strong> di dashboard Anda, salin key token untuk device Anda, lalu tempelkan di atas kemudian klik simpan. Jangan gunakan token default / Meta FB!
              </div>

              <button
                type="submit"
                disabled={savingToken}
                className={`w-full text-white bg-indigo-600 hover:bg-indigo-700 font-bold text-xs py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-md transition active:scale-98 ${savingToken ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <Save className="w-4 h-4" />
                {savingToken ? "Menyimpan Token..." : "Simpan & Aktifkan Token"}
              </button>
            </form>
          </div>

          {/* Card B: Sandbox Test Control */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-4 flex-1 flex flex-col justify-between">
            <div className="space-y-1">
              <h3 className="font-extrabold text-slate-800 text-base flex items-center gap-2">
                <Terminal className="w-5 h-5 text-indigo-500" />
                Kontrol Sandbox & Tes Gateway
              </h3>
              <p className="text-slate-500 text-xs">Kirim pesan uji coba langsung untuk memastikan integrasi API gateway WA aktif dan kompatibel dengan token Anda.</p>
            </div>

            <form onSubmit={handleSendTestMessage} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs text-slate-500 font-bold uppercase tracking-wider block">Nomor Target WA Uji Coba</label>
                <div className="relative">
                  <input 
                    type="text" 
                    value={testTarget}
                    onChange={e => setTestTarget(e.target.value)}
                    placeholder="Contoh: 081299998888 atau 6281..."
                    required
                    className="w-full text-slate-700 bg-white border border-slate-200 outline-none rounded-xl px-4 py-2.5 text-sm font-bold focus:border-indigo-500 shadow-sm pl-11 transition"
                  />
                  <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400 font-black text-sm">@</span>
                </div>
                <p className="text-slate-400 text-[10px]">Masukkan nomor WhatsApp lengkap yang aktif di HP Anda untuk menerima notifikasi penguji.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-slate-500 font-bold uppercase tracking-wider block">Template Isi Pesan Diagnosa</label>
                <textarea 
                  rows={4}
                  value={testMessage}
                  onChange={e => setTestMessage(e.target.value)}
                  required
                  className="w-full text-slate-600 bg-white border border-slate-200 outline-none rounded-2xl p-4 text-xs font-mono focus:border-indigo-500 shadow-sm leading-relaxed transition"
                ></textarea>
              </div>

              <button
                type="submit"
                disabled={sendingTest}
                className={`w-full text-white bg-indigo-600 hover:bg-indigo-700 font-bold text-sm py-3 px-6 rounded-2xl flex items-center justify-center gap-2 shadow-lg transition active:scale-98 ${sendingTest ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <Send className={`w-4 h-4 ${sendingTest ? "animate-pulse" : ""}`} />
                {sendingTest ? "Menghubungi API Gateway..." : "Kirim Uji Coba Pesan WA"}
              </button>
            </form>

            {/* Test Sandbox Live Result Area */}
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
                      {testResult.success ? (
                        <CheckCircle className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-600" />
                      )}
                      {testResult.success ? "SANDBOX_SUCCESS (200)" : "SANDBOX_FAILED (Gateway Rejected)"}
                    </span>
                    <span className="text-[10px] opacity-75">{new Date().toLocaleTimeString()}</span>
                  </div>
                  {testResult.log && (
                    <div className="space-y-1.5 overflow-hidden">
                      <p className="text-[10px] break-words"><strong>Tujuan:</strong> {testResult.log.target} ({testResult.log.recipientName})</p>
                      <div className="bg-white bg-opacity-70 p-2.5 rounded-lg border border-black border-opacity-5 max-h-[140px] overflow-y-auto w-full text-[9px] text-slate-700">
                        <strong>RAW API JSON Response:</strong>
                        <pre className="mt-1 font-mono break-all whitespace-pre-wrap">{testResult.log.gatewayResponse}</pre>
                      </div>
                    </div>
                  )}
                  {testResult.error && (
                    <p className="text-[10px] leading-relaxed text-rose-700 bg-white bg-opacity-50 p-2 rounded-lg">
                      <strong>Pesan Kegagalan:</strong> {testResult.error}
                    </p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* 4. Audit Log & History Logs (Most Recent 10 Attempts) */}
      {data && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center gap-3">
            <Clock className="w-5 h-5 text-indigo-500" />
            <div>
              <h3 className="font-extrabold text-slate-800 text-lg">Histori Aktivitas Pengiriman Notifikasi (Audit Trail)</h3>
              <p className="text-slate-500 text-xs mt-1">Audit log temporal pengiriman notifikasi WhatsApp secara real-time dari engine server ke gateway.</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            {data.logs.length === 0 ? (
              <div className="p-12 text-center text-slate-400 space-y-2 flex flex-col items-center">
                <CloudLightning className="w-8 h-8 text-slate-300" />
                <p className="font-bold text-sm">Konsol Riwayat Kosong</p>
                <p className="text-xs">Uji coba pengunggahan PR baru atau gunakan tombol sandbox di atas untuk memetakan log ke server.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {data.logs.map((log, idx) => (
                  <div key={idx} className="p-4 hover:bg-slate-50 transition-colors">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 font-medium text-xs">
                      {/* Left: Time and Status */}
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-1 rounded-lg text-[10px] font-black ${log.status === 'SUCCESS' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'}`}>
                          {log.status}
                        </span>
                        <div>
                          <p className="font-extrabold text-slate-800 flex items-center gap-1.5">
                            {log.recipientName} ({log.recipientRole}) 
                            <span className="font-mono text-slate-400 text-[10px]">@{log.target}</span>
                          </p>
                          <p className="text-slate-400 text-[10px] flex items-center gap-1 mt-0.5">
                            <Clock className="w-3 h-3" />
                            {new Date(log.timestamp).toLocaleDateString()} {new Date(log.timestamp).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>

                      {/* Middle: Event Template */}
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded font-mono text-[10px] uppercase">
                        {log.messageType}
                      </span>

                      {/* Right: Toggle Button */}
                      <button 
                        onClick={() => toggleExpandLog(idx)}
                        className="flex items-center gap-1 px-3 py-1 text-xs text-indigo-600 font-bold hover:bg-indigo-50 rounded-lg transition"
                      >
                        {expandedLogId === idx ? "Tutup Detail JSON" : "Buka Payload Gateway"}
                        {expandedLogId === idx ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>

                    {/* Collapsible Inspection Details */}
                    <AnimatePresence>
                      {expandedLogId === idx && (
                        <motion.div 
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-3 p-4 bg-slate-50 rounded-2xl border border-slate-150 space-y-3 overflow-hidden text-xs font-mono"
                        >
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1 bg-white p-3 rounded-xl border border-slate-150 text-slate-700">
                              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Kandungan Isi Pesan WA</span>
                              <p className="whitespace-pre-wrap text-[11px] leading-relaxed mt-1 font-sans">{log.message}</p>
                            </div>
                            <div className="space-y-1 bg-white p-3 rounded-xl border border-slate-150 text-slate-700">
                              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Respons Gateway Mentah (Raw response)</span>
                              <pre className="mt-1 text-[10px] leading-relaxed break-all max-h-[140px] overflow-y-auto whitespace-pre-wrap truncate">{log.gatewayResponse}</pre>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
