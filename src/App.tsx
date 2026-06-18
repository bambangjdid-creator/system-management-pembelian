import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from 'firebase/auth';

// Firebase configuration
const firebaseConfig = {
  projectId: "inner-outlook-zs7sz",
  appId: "1:410530787566:web:e3e138524a7f7c2bb743ff",
  apiKey: "AIzaSyD-ysEViYjeJ7z6yVKRtcmGjDeHEgmANdQ",
  authDomain: "inner-outlook-zs7sz.firebaseapp.com",
  storageBucket: "inner-outlook-zs7sz.firebasestorage.app",
  messagingSenderId: "410530787566"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/spreadsheets');
googleProvider.addScope('https://www.googleapis.com/auth/drive');
googleProvider.addScope('https://www.googleapis.com/auth/documents');

export const WAREHOUSE_ADDRESS_INFO: { [key: string]: { name: string, address: string } } = {
  'GD PONCOL': {
    name: 'GUDANG PONCOL',
    address: 'JL. RAYA PONCOL NO.17 RT/RW 003/07 KEL. CIRACAS KEC. CIRACAS, KOTA JAKARTA TIMUR, DKI JAKARTA - 13750'
  },
  'GD CIRACAS': {
    name: 'GUDANG CIRACAS',
    address: 'JL. RAYA BOGOR KM 26 NO.2 RT/RW 005/01 KEL. CIRACAS KEC. CIRACAS KOTA JAKARTA TIMUR, DKI JAKARTA - 13750'
  },
  'GD NAGOYA': {
    name: 'GUDANG NAGOYA',
    address: 'JL. SWADAYA V NO. 50 RT/RW. 002/05 KEC. CILANGKAP KEL. CIPAYUNG KOTA JAKARTA TIMUR, DKI JAKARTA - 13870'
  }
};

import WhatsAppDiagnosticsPanel from './components/WhatsAppDiagnosticsPanel';

import { 
  LayoutDashboard, 
  FileText, 
  ShoppingBag, 
  Users, 
  LogOut, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  Plus,
  Search,
  Check,
  X,
  Settings,
  Trash2,
  Edit,
  Menu,
  Sun,
  Moon,
  Eye,
  EyeOff,
  Lock,
  User
} from './icons';
import { motion, AnimatePresence } from 'framer-motion';
import Swal from 'sweetalert2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  LineController,
  BarController
} from 'chart.js';
import { Chart } from 'react-chartjs-2';
import ChartDataLabels from 'chartjs-plugin-datalabels';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  LineController,
  BarController,
  ChartDataLabels
);

const StatCard = ({ title, value, icon: Icon, color }) => {
  const baseColor = color.replace('bg-', '').replace('-500', '').replace('-600', '');
  return (
    <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all group">
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 text-left">{title}</p>
      <div className="flex items-center justify-between">
        <h3 className={`text-4xl font-black text-slate-900 tracking-tight leading-none`}>{value}</h3>
        <div className={`p-4 rounded-2xl bg-${baseColor}-50 text-${baseColor}-600 group-hover:scale-110 transition-transform`}>
          <Icon className="w-6 h-6" strokeWidth={3} />
        </div>
      </div>
    </div>
  );
};

const SidebarItem = ({ icon: Icon, label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
      active 
        ? 'bg-blue-600 text-white shadow-lg dark:shadow-blue-950/20 shadow-blue-100 font-extrabold' 
        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-blue-600 dark:hover:text-blue-400 font-semibold'
    }`}
  >
    <Icon className="w-5 h-5" />
    <span className="font-medium">{label}</span>
  </button>
);

// Safe localStorage wrapper to prevent iframe SecurityError crashes
const safeLocalStorage = {
  getItem: (key: string) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch {}
  },
  removeItem: (key: string) => {
    try {
      localStorage.removeItem(key);
    } catch {}
  }
};

export default function App() {
  const [user, setUser] = useState(null);
  const [googleToken, setGoogleToken] = useState(safeLocalStorage.getItem('google_token') || null);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return safeLocalStorage.getItem('theme') === 'dark';
  });
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      safeLocalStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      safeLocalStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);
  const [activeTab, setActiveTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('tab') === 'approvals' ? 'approvals' : 'dashboard';
  });
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [prList, setPrList] = useState([]);
  const [poList, setPoList] = useState([]);
  const [stockMaster, setStockMaster] = useState([]);
  const [loginData, setLoginData] = useState({ username: '', password: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [adminData, setAdminData] = useState({ users: [], stock: [] });
  const [settingsTab, setSettingsTab] = useState('users'); // users, stock
  const [searchStatus, setSearchStatus] = useState('');
  const [searchDivision, setSearchDivision] = useState('');
  const [searchSupplierPR, setSearchSupplierPR] = useState('');
  const [searchDivisionPO, setSearchDivisionPO] = useState('');
  const [searchSupplierPO, setSearchSupplierPO] = useState('');
  const [searchDivisionApproval, setSearchDivisionApproval] = useState('');

  const canSee = (menu) => {
    if (!user) return false;
    const role = (user.role || '').toUpperCase();
    if (role.includes('ADMIN')) return true;
    
    // Auto-grant APPROVAL menu to managers/directors
    if (menu.toUpperCase() === 'APPROVAL') {
      const divCode = (user.divisionCode || '').toUpperCase();
      const isApprover = role.includes('MANAGER') || role.includes('MANAJER') || 
                         role.includes('DIREKTUR') || role.includes('DIREKSI') || 
                         role.includes('MGR') || role.includes('DIR') || 
                         role.includes('KABAG') || role.includes('KADIV') ||
                         divCode === 'MGR' || divCode === 'DIR';
      if (isApprover) return true;
    }

    // Auto-grant PR HISTORY etc.
    if (['PR HISTORY', 'PO HISTORY', 'DASHBOARD'].includes(menu.toUpperCase())) {
       const divCode = (user.divisionCode || '').toUpperCase();
       const isHighLevel = role.includes('MANAGER') || role.includes('MANAJER') || 
                           role.includes('DIREKTUR') || role.includes('DIREKSI') || 
                           role.includes('MGR') || role.includes('DIR') || 
                           role.includes('ADMIN') || role.includes('PURCHASE') ||
                           divCode === 'MGR' || divCode === 'DIR';
       if (isHighLevel) return true;
    }
    
    // Check access property (case-insensitive string match)
    const access = (user.access || '').toUpperCase();
    const menuUp = menu.toUpperCase();
    
    // Support comma separated or exact match
    const accessList = access.split(',').map(m => m.trim());
    return accessList.includes(menuUp);
  };

  const [prForm, setPrForm] = useState({
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

  const apiFetch = async (url, options: any = {}) => {
    // === GOOGLE APPS SCRIPT WEB APP INTEGRATION ===
    // Replace this URL with your actual deployed Web App URL from Google Apps Script
    const GAS_URL = "https://script.google.com/macros/s/AKfycbwnqXkuqQEihqleNJ1DaAEukSaPMAVI9cIjvcKg9Ok6qlquPSbdwK1lyHGNPJ_Vih09/exec";
    
    let action = "";
    if (url.includes("/login")) action = "login";
    else if (url.includes("/admin/users")) action = "getUsers";
    else if (url.includes("/admin/stock")) action = "getMasterStock";
    else if (url.includes("/pr/create")) action = "createPR";
    else if (url.includes("/po/create")) action = "createPO";
    else if (url.includes("/pr/approve")) action = "approvePR";
    else if (url.includes("/pr/finish")) action = "finishPR";
    else if (url.includes("/pr")) action = "getPRs";
    else if (url.includes("/po")) action = "getPOs";
    else if (url.includes("/stock")) action = "getMasterStock";

    if (!action) {
      if (url.includes("/stats")) {
          return { json: async () => ({ success: true, stats: { totalPr:0, totalPo:0, pendingApprove:0 } }) };
      }
      return { json: async () => ({ success: true }) };
    }

    try {
      const payload = { action, ...((options.body && JSON.parse(options.body)) || {}) };
      
      const response = await fetch(GAS_URL, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      
      const data = await response.json();
      return {
        ok: data.success !== false,
        json: async () => data
      };
    } catch (e) {
      console.error("GAS API Error:", e);
      throw e;
    }
  };

  const handleGoogleLogin = async () => {
    try {
      setIsLoading(true);
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken;
      if (token) {
        setGoogleToken(token);
        safeLocalStorage.setItem('google_token', token);
        Swal.fire('Success', 'Connected to Google Drive!', 'success');
      }
    } catch (error: any) {
      console.error(error);
      Swal.fire('Error', 'Google Connection Failed: ' + error.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddUser = async () => {
    const menuOptions = ['DASHBOARD', 'CREATE PR', 'PR HISTORY', 'PO HISTORY', 'PURCHASE', 'APPROVAL'];
    const { value: formValues } = await Swal.fire({
      title: 'Add New User',
      html:
        '<div class="grid grid-cols-1 gap-2 text-left">' +
        '<label class="text-[10px] font-bold text-slate-400 uppercase">Login Credentials</label>' +
        '<input id="swal-input1" class="swal2-input !mt-0" placeholder="Username">' +
        '<input id="swal-input2" class="swal2-input" placeholder="Password" type="password">' +
        '<label class="text-[10px] font-bold text-slate-400 uppercase mt-2">Profile Information</label>' +
        '<input id="swal-input3" class="swal2-input !mt-0" placeholder="Full Name">' +
        '<select id="swal-input4" class="swal2-input"><option value="USER">USER</option><option value="Manager">Manager</option><option value="Direktur">Direktur</option><option value="Purchase">Purchase</option><option value="ADMIN">ADMIN</option></select>' +
        '<input id="swal-input5" class="swal2-input" placeholder="Division">' +
        '<input id="swal-input6" class="swal2-input" placeholder="Division Code">' +
        '<input id="swal-input7" class="swal2-input" placeholder="WA Number (628...)">' +
        '<label class="text-[10px] font-bold text-slate-400 uppercase mt-4">Menu Access Permissions</label>' +
        '<div class="grid grid-cols-2 gap-2 mt-2 px-2">' +
        menuOptions.map(m => `
          <div class="flex items-center gap-2">
            <input type="checkbox" id="access-${m}" value="${m}" class="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500">
            <label for="access-${m}" class="text-sm text-slate-600 font-medium cursor-pointer">${m}</label>
          </div>
        `).join('') +
        '</div>' +
        '</div>',
      focusConfirm: false,
      preConfirm: () => {
        const access = menuOptions.filter(m => (document.getElementById(`access-${m}`) as HTMLInputElement).checked).join(', ');
        return {
          username: (document.getElementById('swal-input1') as HTMLInputElement).value,
          password: (document.getElementById('swal-input2') as HTMLInputElement).value,
          fullName: (document.getElementById('swal-input3') as HTMLInputElement).value,
          role: (document.getElementById('swal-input4') as HTMLSelectElement).value,
          division: (document.getElementById('swal-input5') as HTMLInputElement).value,
          divCode: (document.getElementById('swal-input6') as HTMLInputElement).value,
          wa: (document.getElementById('swal-input7') as HTMLInputElement).value,
          access
        };
      }
    });

    if (formValues) {
      await apiFetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formValues)
      });
      fetchAdminData();
      Swal.fire('Success', 'User added', 'success');
    }
  };

  const handleEditUser = async (user) => {
    const menuOptions = ['DASHBOARD', 'CREATE PR', 'PR HISTORY', 'PO HISTORY', 'PURCHASE', 'APPROVAL'];
    const userAccess = (user.access || '').toUpperCase();
    
    const { value: formValues } = await Swal.fire({
      title: 'Edit User',
      html:
        '<div class="grid grid-cols-1 gap-2 text-left">' +
        '<label class="text-[10px] font-bold text-slate-400 uppercase">Login Credentials</label>' +
        `<input id="edit-u-1" class="swal2-input !mt-0" placeholder="Username" value="${user.username}">` +
        `<input id="edit-u-2" class="swal2-input" placeholder="Password" type="text" value="${user.password}">` +
        '<label class="text-[10px] font-bold text-slate-400 uppercase mt-2">Profile Information</label>' +
        `<input id="edit-u-3" class="swal2-input !mt-0" placeholder="Full Name" value="${user.fullName}">` +
        `<select id="edit-u-4" class="swal2-input">
          <option value="USER" ${user.role==='USER'?'selected':''}>USER</option>
          <option value="Manager" ${user.role==='Manager'?'selected':''}>Manager</option>
          <option value="Direktur" ${user.role==='Direktur'?'selected':''}>Direktur</option>
          <option value="Purchase" ${user.role==='Purchase'?'selected':''}>Purchase</option>
          <option value="ADMIN" ${user.role==='ADMIN'?'selected':''}>ADMIN</option>
        </select>` +
        `<input id="edit-u-5" class="swal2-input" placeholder="Division" value="${user.division}">` +
        `<input id="edit-u-6" class="swal2-input" placeholder="Division Code" value="${user.divCode}">` +
        `<input id="edit-u-7" class="swal2-input" placeholder="WA Number" value="${user.wa}">` +
        '<label class="text-[10px] font-bold text-slate-400 uppercase mt-4">Menu Access Permissions</label>' +
        '<div class="grid grid-cols-2 gap-2 mt-2 px-2">' +
        menuOptions.map(m => `
          <div class="flex items-center gap-2">
            <input type="checkbox" id="edit-access-${m}" value="${m}" ${userAccess.includes(m) ? 'checked' : ''} class="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500">
            <label for="edit-access-${m}" class="text-sm text-slate-600 font-medium cursor-pointer">${m}</label>
          </div>
        `).join('') +
        '</div>' +
        '</div>',
      focusConfirm: false,
      preConfirm: () => {
        const access = menuOptions.filter(m => (document.getElementById(`edit-access-${m}`) as HTMLInputElement).checked).join(', ');
        return {
          username: (document.getElementById('edit-u-1') as HTMLInputElement).value,
          password: (document.getElementById('edit-u-2') as HTMLInputElement).value,
          fullName: (document.getElementById('edit-u-3') as HTMLInputElement).value,
          role: (document.getElementById('edit-u-4') as HTMLSelectElement).value,
          division: (document.getElementById('edit-u-5') as HTMLInputElement).value,
          divCode: (document.getElementById('edit-u-6') as HTMLInputElement).value,
          wa: (document.getElementById('edit-u-7') as HTMLInputElement).value,
          access
        };
      }
    });

    if (formValues) {
      await apiFetch(`/api/admin/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formValues)
      });
      fetchAdminData();
      Swal.fire('Success', 'User updated', 'success');
    }
  };

  const handleDeleteUser = async (index) => {
    const confirm = await Swal.fire({ title: 'Delete user?', showCancelButton: true });
    if (confirm.isConfirmed) {
      await apiFetch(`/api/admin/users/${index}`, { method: 'DELETE' });
      fetchAdminData();
    }
  };

  const handleAddStock = async () => {
    const { value: formValues } = await Swal.fire({
      title: 'Add New Item',
      html:
        '<input id="s-input1" class="swal2-input" placeholder="Item Name">' +
        '<input id="s-input2" class="swal2-input" placeholder="Category">' +
        '<input id="s-input3" class="swal2-input" placeholder="Supplier">' +
        '<input id="s-input4" class="swal2-input" placeholder="Unit">' +
        '<input id="s-input5" class="swal2-input" placeholder="Initial Price" type="number">',
      focusConfirm: false,
      preConfirm: () => ({
        name: (document.getElementById('s-input1') as HTMLInputElement).value,
        category: (document.getElementById('s-input2') as HTMLInputElement).value,
        supplier: (document.getElementById('s-input3') as HTMLInputElement).value,
        unit: (document.getElementById('s-input4') as HTMLInputElement).value,
        price: (document.getElementById('s-input5') as HTMLInputElement).value
      })
    });

    if (formValues) {
      await apiFetch('/api/admin/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formValues)
      });
      fetchAdminData();
      fetchStock();
      Swal.fire('Success', 'Item added', 'success');
    }
  };

  const handleEditStock = async (stock) => {
    const { value: formValues } = await Swal.fire({
      title: 'Edit Item',
      html:
        `<input id="edit-s-1" class="swal2-input" placeholder="Item Name" value="${stock.name}">` +
        `<input id="edit-s-2" class="swal2-input" placeholder="Category" value="${stock.category}">` +
        `<input id="edit-s-3" class="swal2-input" placeholder="Supplier" value="${stock.supplier}">` +
        `<input id="edit-s-4" class="swal2-input" placeholder="Unit" value="${stock.unit}">` +
        `<input id="edit-s-5" class="swal2-input" placeholder="Price" type="number" value="${stock.price}">`,
      focusConfirm: false,
      preConfirm: () => ({
        name: (document.getElementById('edit-s-1') as HTMLInputElement).value,
        category: (document.getElementById('edit-s-2') as HTMLInputElement).value,
        supplier: (document.getElementById('edit-s-3') as HTMLInputElement).value,
        unit: (document.getElementById('edit-s-4') as HTMLInputElement).value,
        price: (document.getElementById('edit-s-5') as HTMLInputElement).value
      })
    });

    if (formValues) {
      await apiFetch(`/api/admin/stock/${stock.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formValues)
      });
      fetchAdminData();
      fetchStock();
      Swal.fire('Success', 'Item updated', 'success');
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

  const handleEditPR = async (pr) => {
    const { value: formValues } = await Swal.fire({
      title: 'Edit PR Record',
      html:
        `<div class="text-left space-y-2 max-h-[60vh] overflow-y-auto px-1">
          <p class="text-[10px] font-bold text-slate-400 uppercase">PR ID: <span class="text-indigo-600">${pr.id}</span></p>
          
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="text-[10px] font-bold text-slate-400 uppercase">Date</label>
              <input id="edit-pr-date" class="swal2-input !mt-0 !mb-4" value="${pr.date}">
            </div>
            <div>
              <label class="text-[10px] font-bold text-slate-400 uppercase">Requester</label>
              <input id="edit-pr-requester" class="swal2-input !mt-0 !mb-4" value="${pr.requester}">
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="text-[10px] font-bold text-slate-400 uppercase">Division</label>
              <input id="edit-pr-division" class="swal2-input !mt-0 !mb-4" value="${pr.division}">
            </div>
            <div>
              <label class="text-[10px] font-bold text-slate-400 uppercase">Supplier</label>
              <input id="edit-pr-supplier" class="swal2-input !mt-0 !mb-4" value="${pr.supplier}">
            </div>
          </div>

          <label class="text-[10px] font-bold text-slate-400 uppercase">Item Name</label>
          <input id="edit-pr-name" class="swal2-input !mt-0 !mb-4" value="${pr.itemName}">

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="text-[10px] font-bold text-slate-400 uppercase">Qty</label>
              <input id="edit-pr-qty" type="number" class="swal2-input !mt-0 !mb-4" value="${pr.qty}">
            </div>
            <div>
              <label class="text-[10px] font-bold text-slate-400 uppercase">Unit</label>
              <input id="edit-pr-unit" class="swal2-input !mt-0 !mb-4" value="${pr.unit}">
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="text-[10px] font-bold text-slate-400 uppercase">Stock Onhand</label>
              <input id="edit-pr-stock" type="number" class="swal2-input !mt-0 !mb-4" value="${pr.stockOnhand}">
            </div>
            <div>
              <label class="text-[10px] font-bold text-slate-400 uppercase">Avg Sales</label>
              <input id="edit-pr-avg" type="number" class="swal2-input !mt-0 !mb-4" value="${pr.avgSales}">
            </div>
          </div>

          <label class="text-[10px] font-bold text-slate-400 uppercase">PDF Link</label>
          <input id="edit-pr-pdflink" class="swal2-input !mt-0 !mb-4" value="${pr.pdfLink || ''}">

          <label class="text-[10px] font-bold text-slate-400 uppercase">Status</label>
          <select id="edit-pr-status" class="swal2-input !mt-0 !mb-4">
            <option value="WAITING MANAGER APPROVAL" ${pr.status==='WAITING MANAGER APPROVAL'?'selected':''}>WAITING MANAGER APPROVAL</option>
            <option value="WAITING DIREKTUR APPROVAL" ${pr.status==='WAITING DIREKTUR APPROVAL'?'selected':''}>WAITING DIREKTUR APPROVAL</option>
            <option value="WAITING CREATED PO" ${pr.status==='WAITING CREATED PO'?'selected':''}>WAITING CREATED PO</option>
            <option value="WAITING RECEIVE" ${pr.status==='WAITING RECEIVE'?'selected':''}>WAITING RECEIVE</option>
            <option value="FINISH" ${pr.status==='FINISH'?'selected':''}>FINISH</option>
            <option value="Rejected" ${pr.status==='Rejected'?'selected':''}>Rejected</option>
          </select>
          <label class="text-[10px] font-bold text-slate-400 uppercase">Notes</label>
          <input id="edit-pr-notes" class="swal2-input !mt-0" value="${pr.notes || ''}">
        </div>`,
      focusConfirm: false,
      width: '650px',
      preConfirm: () => ({
        ...pr,
        date: (document.getElementById('edit-pr-date') as HTMLInputElement).value,
        requester: (document.getElementById('edit-pr-requester') as HTMLInputElement).value,
        division: (document.getElementById('edit-pr-division') as HTMLInputElement).value,
        supplier: (document.getElementById('edit-pr-supplier') as HTMLInputElement).value,
        itemName: (document.getElementById('edit-pr-name') as HTMLInputElement).value,
        qty: (document.getElementById('edit-pr-qty') as HTMLInputElement).value,
        unit: (document.getElementById('edit-pr-unit') as HTMLInputElement).value,
        stockOnhand: (document.getElementById('edit-pr-stock') as HTMLInputElement).value,
        avgSales: (document.getElementById('edit-pr-avg') as HTMLInputElement).value,
        pdfLink: (document.getElementById('edit-pr-pdflink') as HTMLInputElement).value,
        status: (document.getElementById('edit-pr-status') as HTMLSelectElement).value,
        notes: (document.getElementById('edit-pr-notes') as HTMLInputElement).value,
      })
    });

    if (formValues) {
      await apiFetch(`/api/pr/${pr.rowIndex}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formValues)
      });
      fetchPRs();
      fetchStats();
      Swal.fire('Updated', 'PR record updated', 'success');
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
      fetchStats();
      fetchPRs();
      fetchPOs();
      fetchStock();
      if (user.role === 'ADMIN' || String(user.divisionCode || '').toUpperCase().trim() === 'ADMIN') {
        fetchAdminData();
      }

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

  const fetchAdminData = async () => {
    try {
      const [uRes, sRes] = await Promise.all([
        apiFetch('/api/admin/users').then(r => r.json()),
        apiFetch('/api/admin/stock').then(r => r.json())
      ]);
      setAdminData({ users: uRes, stock: sRes });
    } catch (e) { console.error(e); }
  };

  const fetchStats = async () => {
    setStatsLoading(true);
    try {
      const res = await apiFetch('/api/stats');
      const data = await res.json();
      setStats(data);
    } catch (e) { 
      console.error(e); 
    } finally {
      setStatsLoading(false);
    }
  };

  const fetchPRs = async () => {
    try {
      const res = await apiFetch('/api/pr');
      const data = await res.json();
      if (Array.isArray(data)) {
        setPrList(data);
      } else {
        setPrList([]);
      }
    } catch (e) { 
      console.error(e);
      setPrList([]);
    }
  };
  
  const fetchPOs = async () => {
    try {
      const res = await apiFetch('/api/po');
      const data = await res.json();
      if (Array.isArray(data)) {
        setPoList(data);
      } else {
        setPoList([]);
      }
    } catch (e) { 
      console.error(e);
      setPoList([]);
    }
  };

  const fetchStock = async () => {
    try {
      const res = await apiFetch('/api/stock');
      const data = await res.json();
      if (Array.isArray(data)) {
        setStockMaster(data);
      } else {
        console.warn('Stock data is not an array:', data);
        setStockMaster([]);
      }
    } catch (e) { 
      console.error(e);
      setStockMaster([]);
    }
  };

  const suppliers = Array.from(new Set((Array.isArray(stockMaster) ? stockMaster : []).map(s => s.supplier))).sort();
  const suppliersFromPR = Array.from(new Set((Array.isArray(prList) ? prList : []).map(p => p.supplier).filter(Boolean))).sort();
  const divisionsFromPR = Array.from(new Set((Array.isArray(prList) ? prList : []).map(p => p.division).filter(Boolean))).sort();

  const calculateEstimasi = (item) => {
    const avg = calculateAvg(item);
    if (!avg || avg === 0) return 0;
    const qty = Number(item.qty) || 0;
    // Estimasi = Qty / (Avg/30) => (Qty * 30) / Avg
    return (qty * 30) / avg;
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await apiFetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginData)
      });
      const data = await res.json();
      if (data.success) {
        setUser(data.user);
        Swal.fire({ icon: 'success', title: 'Welcome!', text: `Logged in as ${data.user.displayName}`, timer: 1500, showConfirmButton: false });
      } else {
        Swal.fire('Error', data.message || 'Invalid credentials', 'error');
      }
    } catch (e) {
      Swal.fire('Error', 'Connection failed', 'error');
    } finally {
      setIsLoading(false);
    }
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

  const [poForm, setPoForm] = useState({
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

  const openPRDetail = async (pr) => {
    // Generate a unique cache buster for the preview
    const cacheBuster = Date.now();
    const cleanId = pr.id.replace(/\//g, '_');
    const localPreviewUrl = `/api/pdf/pr/${cleanId}.pdf?v=${cacheBuster}`;
    const originalLink = pr.pdfLink || localPreviewUrl;
    
    Swal.fire({
      title: `Detail PR: ${pr.id}`,
      html: `
        <div class="space-y-4">
          <div class="relative bg-slate-100 rounded-xl overflow-hidden shadow-inner" style="height: 600px;">
            <iframe 
                src="${localPreviewUrl}" 
                class="w-full h-full border-0" 
                title="PR Preview"
            ></iframe>
          </div>
          
          <div class="flex gap-2 justify-center mt-6">
            <button id="btn-reject" class="px-6 py-2 bg-red-50 text-red-600 font-bold rounded-xl border border-red-100 hover:bg-red-100 transition-colors">REJECT</button>
            <button id="btn-pending" class="px-6 py-2 bg-slate-50 text-slate-600 font-bold rounded-xl border border-slate-200 hover:bg-slate-100 transition-colors">PENDING</button>
            <button id="btn-approve" class="px-6 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg transition-all transform hover:-translate-y-0.5">APPROVE</button>
          </div>
          
          <div class="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/80 flex flex-col items-center gap-1">
             <a href="${originalLink}" target="_blank" class="text-indigo-600 dark:text-indigo-400 font-bold hover:underline flex items-center gap-1">
               <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M7.71 3.5C7 3.5 6.44 3.93 6.13 4.5L1.5 12.5L1.5 12.5L1.5 12.5C1.19 13.07 1.19 13.73 1.5 14.3L3.81 18.3C4.12 18.87 4.69 19.3 5.39 19.3H18.73C19.43 19.3 20 18.87 20.31 18.3L22.62 14.3C22.93 13.73 22.93 13.07 22.62 12.5L18 4.5C17.69 3.93 17.13 3.5 16.43 3.5H7.71ZM9 7H15.14L19.04 13.75L15.91 19.16C15.54 18.23 15 17.3 14.4 16.42L11 10.5L11 10.5L9.6 8.23L9 7Z"/></svg>
               Open Original / Download
             </a>
          </div>
        </div>
      `,
      width: '900px',
      showConfirmButton: false,
      showCloseButton: true,
      didOpen: () => {
        document.getElementById('btn-reject').onclick = () => handleAction(pr.id, 'REJECT');
        document.getElementById('btn-pending').onclick = () => handleAction(pr.id, 'PENDING');
        document.getElementById('btn-approve').onclick = () => handleAction(pr.id, 'APPROVE');
      }
    });
  };

  const openPODetail = async (po) => {
    // Generate a unique cache buster for the preview
    const cacheBuster = Date.now();
    const cleanPoNo = po.poNo.replace(/\//g, '_');
    const localPreviewUrl = `/api/pdf/po/${cleanPoNo}.pdf?v=${cacheBuster}`;
    const originalLink = po.pdfLink || localPreviewUrl;
    
    Swal.fire({
      title: `Detail PO: ${po.poNo}`,
      html: `
        <div class="space-y-4">
          <div class="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl text-left text-xs space-y-1.5 border border-slate-100 dark:border-slate-800">
            <p class="flex justify-between"><span class="font-black text-slate-400 uppercase text-[9px] tracking-wider">PR Link:</span> <span class="font-bold text-slate-800 dark:text-slate-200">${po.prId || '-'}</span></p>
            <p class="flex justify-between"><span class="font-black text-slate-400 uppercase text-[9px] tracking-wider">Supplier:</span> <span class="font-bold text-slate-800 dark:text-slate-200">${po.supplier || '-'}</span></p>
            <p class="flex justify-between"><span class="font-black text-slate-400 uppercase text-[9px] tracking-wider">Tanggal Kirim:</span> <span class="font-bold text-slate-800 dark:text-slate-200">${po.deliveryDate || '-'}</span></p>
            <p class="flex justify-between"><span class="font-black text-slate-400 uppercase text-[9px] tracking-wider">Pembuat PO:</span> <span class="font-bold text-slate-800 dark:text-slate-200">${po.purchaseName || '-'}</span></p>
            <p class="flex justify-between"><span class="font-black text-slate-400 uppercase text-[9px] tracking-wider">Catatan:</span> <span class="font-bold text-slate-800 dark:text-slate-200">${po.notes || '-'}</span></p>
          </div>
          <div class="relative bg-slate-100 rounded-xl overflow-hidden shadow-inner" style="height: 600px;">
            <iframe 
                src="${localPreviewUrl}" 
                class="w-full h-full border-0" 
                title="PO Preview"
            ></iframe>
          </div>
          <div class="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/80 flex flex-col items-center gap-1">
             <a href="${originalLink}" target="_blank" class="text-indigo-650 dark:text-indigo-400 font-bold hover:underline flex items-center gap-1">
               <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M7.71 3.5C7 3.5 6.44 3.93 6.13 4.5L1.5 12.5L1.5 12.5L1.5 12.5C1.19 13.07 1.19 13.73 1.5 14.3L3.81 18.3C4.12 18.87 4.69 19.3 5.39 19.3H18.73C19.43 19.3 20 18.87 20.31 18.3L22.62 14.3C22.93 13.73 22.93 13.07 22.62 12.5L18 4.5C17.69 3.93 17.13 3.5 16.43 3.5H7.71ZM9 7H15.14L19.04 13.75L15.91 19.16C15.54 18.23 15 17.3 14.4 16.42L11 10.5L11 10.5L9.6 8.23L9 7Z"/></svg>
               Open Original / Download
             </a>
          </div>
        </div>
      `,
      width: '900px',
      showConfirmButton: false,
      showCloseButton: true
    });
  };

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
        price: '',
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
      <div className={`min-h-screen ${isDarkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-800'} flex items-center justify-center p-4 transition-colors duration-300 relative`}>
        {/* Floating Top Header Theme Switch inside Login Page */}
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
          className={`w-full max-w-4xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden border border-slate-100 dark:border-slate-800/80 flex flex-col md:flex-row transition-colors duration-300`}
        >
          {/* Left Column - Welcome branding banner */}
          <div className="hidden md:flex md:w-1/2 bg-gradient-to-br from-blue-700 via-blue-600 to-indigo-800 p-12 text-white flex-col justify-between relative overflow-hidden">
            {/* Background vector graphics styling resembling the reference picture */}
            <div className="absolute -left-12 -bottom-12 w-64 h-64 rounded-full bg-blue-500/20 blur-xl pointer-events-none" />
            <div className="absolute -right-16 -top-16 w-80 h-80 rounded-full bg-indigo-500/20 blur-xl pointer-events-none" />
            <div className="absolute right-4 bottom-4 w-48 h-48 rounded-full bg-blue-400/20 blur-md pointer-events-none" />
            
            <div className="relative z-10 flex flex-col h-full justify-between min-h-[400px]">
              <div>
                <span className="text-[10px] font-black uppercase tracking-[0.25em] bg-white/20 backdrop-blur-md px-3.5 py-1.5 rounded-full text-white">
                  CV. SAU
                </span>
                <h2 className="text-3xl font-extrabold tracking-tight mt-10 leading-snug">
                  Sistem Manajemen Pembelian
                </h2>
                <div className="w-16 h-1 bg-white/40 rounded-full mt-4" />
              </div>
              
              <div className="space-y-4">
                <p className="text-2xl font-black text-blue-50 tracking-wide uppercase">
                  Selamat Datang
                </p>
                <p className="text-xs text-blue-105/90 leading-relaxed font-normal">
                  Sistem manajemen pembelian dengan alur kerja persetujuan multi-level, dasbor real-time, dan integrasi Google Sheets.
                </p>
              </div>
              
              <p className="text-[10px] text-blue-300/40 uppercase font-mono tracking-widest mt-6">
                © 2026 CV. SAU • Semua hak dilindungi undang-undang
              </p>
            </div>
          </div>

          {/* Right Column - Input Form */}
          <div className="w-full md:w-1/2 p-8 md:p-12 flex flex-col justify-center bg-white dark:bg-slate-900 transition-colors duration-300">
            <div className="flex flex-col items-center text-center">
              {/* Company Logo (CV. SAU) fetched directly via standard embed */}
              <div className="w-20 h-20 mb-3 flex items-center justify-center p-1.5 rounded-2xl bg-white border border-slate-100 dark:border-slate-800 shadow-md">
                <img 
                  src="https://lh3.googleusercontent.com/d/1z4OOPp5Z1YxXs00Zogk9oQmII2jj9_oU" 
                  alt="Logo CV. SAU" 
                  className="w-full h-full object-contain"
                  referrerPolicy="no-referrer"
                />
              </div>
              <h3 className="text-xl font-bold tracking-tight text-slate-800 dark:text-white">
                CV. SAU
              </h3>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider mt-0.5">
                Sistem Manajemen Pembelian
              </p>
            </div>

            <form onSubmit={handleLogin} className="mt-8 space-y-4 text-left">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">
                  Nama Pengguna (Username)
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-505">
                    <User className="w-4 h-4" />
                  </span>
                  <input 
                    type="text" 
                    placeholder="Masukkan username Anda"
                    className="w-full pl-11 pr-4 py-3 text-sm rounded-xl border border-slate-200 dark:border-slate-850 dark:bg-slate-800/80 dark:text-white focus:outline-none focus:border-blue-500 dark:focus:border-blue-400" 
                    required 
                    value={loginData.username} 
                    onChange={e => setLoginData({...loginData, username: e.target.value})} 
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-505 mb-1.5">
                  Kata Sandi (Password)
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-550">
                    <Lock className="w-4 h-4" />
                  </span>
                  <input 
                    type={showPassword ? "text" : "password"} 
                    placeholder="Masukkan password Anda"
                    className="w-full pl-11 pr-24 py-3 text-sm rounded-xl border border-slate-200 dark:border-slate-850 dark:bg-slate-800/80 dark:text-white focus:outline-none focus:border-blue-500 dark:focus:border-blue-400" 
                    required 
                    value={loginData.password} 
                    onChange={e => setLoginData({...loginData, password: e.target.value})} 
                  />
                  <button 
                    type="button" 
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] font-extrabold uppercase tracking-wider text-blue-600 dark:text-blue-405 hover:text-blue-800 transition active:scale-95 flex items-center gap-1 bg-blue-50/50 dark:bg-blue-950/20 px-2 py-1 rounded"
                  >
                    {showPassword ? (
                      <>
                        <EyeOff className="w-3 h-3" />
                        <span>Sembunyikan</span>
                      </>
                    ) : (
                      <>
                        <Eye className="w-3 h-3" />
                        <span>Lihat</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <button 
                  disabled={isLoading} 
                  type="submit" 
                  className="w-full bg-blue-600 dark:bg-blue-600 text-white font-extrabold py-3.5 rounded-xl shadow-lg dark:shadow-blue-950/20 hover:bg-blue-700 active:scale-[0.98] transition-all text-sm"
                >
                  {isLoading ? 'Sedang Masuk...' : 'Masuk'}
                </button>
              </div>

              <div className="relative flex py-1.5 items-center">
                <div className="flex-grow border-t border-slate-100 dark:border-slate-805"></div>
                <span className="flex-shrink mx-4 text-slate-400 dark:text-slate-600 text-[10px] uppercase font-bold tracking-widest">Atau</span>
                <div className="flex-grow border-t border-slate-100 dark:border-slate-805"></div>
              </div>

              {!googleToken ? (
                <button 
                  type="button" 
                  onClick={handleGoogleLogin} 
                  className="w-full bg-white dark:bg-slate-850 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold py-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-center gap-3 transition-all text-xs"
                >
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

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex transition-colors duration-300">
      {/* Desktop Sidebar */}
      <aside className="w-64 bg-white dark:bg-slate-900 border-r border-slate-100 dark:border-slate-800 hidden md:flex flex-col p-6 shrink-0 transition-colors duration-300">
        <div className="flex items-center gap-3 mb-10 px-2 font-black text-slate-900 dark:text-slate-100">
          <ShoppingBag className="w-6 h-6 text-blue-600" />
          <span className="tracking-tight">Sist. Pembelian</span>
        </div>
        <nav className="flex-1 space-y-2">
          {canSee('DASHBOARD') && (
            <SidebarItem icon={LayoutDashboard} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
          )}
          {canSee('CREATE PR') && (
            <SidebarItem icon={Plus} label="Create PR" active={activeTab === 'create-pr'} onClick={() => setActiveTab('create-pr')} />
          )}
          {canSee('PR HISTORY') && (
            <SidebarItem icon={FileText} label="PR History" active={activeTab === 'history'} onClick={() => setActiveTab('history')} />
          )}
          {canSee('PO HISTORY') && (
            <SidebarItem icon={ShoppingBag} label="PO History" active={activeTab === 'po-history'} onClick={() => setActiveTab('po-history')} />
          )}
          {canSee('PURCHASE') && (
            <SidebarItem icon={ShoppingBag} label="Purchase Queue" active={activeTab === 'purchase-queue'} onClick={() => setActiveTab('purchase-queue')} />
          )}
          {canSee('APPROVAL') && (
            <SidebarItem icon={CheckCircle2} label="Approvals" active={activeTab === 'approvals'} onClick={() => setActiveTab('approvals')} />
          )}
          {(user.role?.toUpperCase() === 'ADMIN' || String(user.divisionCode || '').toUpperCase().trim() === 'ADMIN') && (
            <SidebarItem icon={Settings} label="Settings" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
          )}
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

      {/* Mobile Drawer Sidebar */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div 
              key="mobile-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 bg-black z-40 md:hidden"
            />
            {/* Sidebar content */}
            <motion.aside 
              key="mobile-sidebar"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="fixed inset-y-0 left-0 w-64 bg-white dark:bg-slate-900 z-50 flex flex-col p-6 shadow-2xl md:hidden text-left transition-colors duration-300 border-r border-slate-100 dark:border-slate-800"
            >
              <div className="flex items-center justify-between mb-10 px-2 font-bold text-slate-900 dark:text-slate-100">
                <span className="flex items-center gap-3"><ShoppingBag className="w-6 h-6 text-blue-600" /> Sist. Pembelian</span>
                <button onClick={() => setMobileMenuOpen(false)} className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <nav className="flex-1 space-y-2">
                {canSee('DASHBOARD') && (
                  <SidebarItem icon={LayoutDashboard} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => { setActiveTab('dashboard'); setMobileMenuOpen(false); }} />
                )}
                {canSee('CREATE PR') && (
                  <SidebarItem icon={Plus} label="Create PR" active={activeTab === 'create-pr'} onClick={() => { setActiveTab('create-pr'); setMobileMenuOpen(false); }} />
                )}
                {canSee('PR HISTORY') && (
                  <SidebarItem icon={FileText} label="PR History" active={activeTab === 'history'} onClick={() => { setActiveTab('history'); setMobileMenuOpen(false); }} />
                )}
                {canSee('PO HISTORY') && (
                  <SidebarItem icon={ShoppingBag} label="PO History" active={activeTab === 'po-history'} onClick={() => { setActiveTab('po-history'); setMobileMenuOpen(false); }} />
                )}
                {canSee('PURCHASE') && (
                  <SidebarItem icon={ShoppingBag} label="Purchase Queue" active={activeTab === 'purchase-queue'} onClick={() => { setActiveTab('purchase-queue'); setMobileMenuOpen(false); }} />
                )}
                {canSee('APPROVAL') && (
                  <SidebarItem icon={CheckCircle2} label="Approvals" active={activeTab === 'approvals'} onClick={() => { setActiveTab('approvals'); setMobileMenuOpen(false); }} />
                )}
                {(user.role?.toUpperCase() === 'ADMIN' || String(user.divisionCode || '').toUpperCase().trim() === 'ADMIN') && (
                  <SidebarItem icon={Settings} label="Settings" active={activeTab === 'settings'} onClick={() => { setActiveTab('settings'); setMobileMenuOpen(false); }} />
                )}
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

      <main className="flex-1 p-6 md:p-10 overflow-y-auto">
        <header className="mb-10 flex justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            {/* Hamburger Button for Mobile */}
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
            {/* Theme Toggle Button */}
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)} 
              className="p-2.5 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-350 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-all active:scale-95"
              aria-label="Toggle Theme"
              title="Ganti Tema"
            >
              {isDarkMode ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5 text-indigo-650" />}
            </button>
            <div className="flex items-center gap-3 bg-white dark:bg-slate-900 px-3 md:px-4 py-2 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm transition-colors duration-300">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">{(user.displayName || user.username || 'U')[0]?.toUpperCase()}</div>
                <span className="font-extrabold text-slate-700 dark:text-slate-200 text-sm hidden sm:inline">{user.displayName || user.username}</span>
            </div>
            <button onClick={() => setUser(null)} className="p-2.5 bg-white dark:bg-slate-900 text-red-500 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm hover:bg-red-50 dark:hover:bg-red-950/20 transition-all font-bold" title="Keluar">
                <LogOut className="w-5 h-5" />
            </button>
          </div>
        </header>

        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && canSee('DASHBOARD') && (
            statsLoading && !stats ? (
              <div className="space-y-8 animate-pulse text-left">
                <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm h-28 flex flex-col justify-between">
                      <div className="h-2.5 bg-slate-200 rounded w-1/2"></div>
                      <div className="h-8 bg-slate-200 rounded w-3/4"></div>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-2 bg-white p-8 rounded-3xl border border-slate-100 shadow-sm h-96">
                    <div className="h-4 bg-slate-200 rounded w-1/4 mb-6"></div>
                    <div className="h-64 bg-slate-100 rounded"></div>
                  </div>
                  <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm h-96">
                    <div className="h-4 bg-slate-200 rounded w-1/4 mb-6"></div>
                    <div className="h-64 bg-slate-100 rounded"></div>
                  </div>
                </div>
              </div>
            ) : !stats ? (
              <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-200 space-y-4 max-w-md mx-auto">
                <p className="text-slate-500 font-bold">Failed to load Dashboard statistics</p>
                <p className="text-xs text-slate-400">Database took too long to respond or returned an empty payload.</p>
                <button type="button" onClick={fetchStats} className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl shadow-md font-bold text-xs hover:bg-indigo-700 transition">
                  Retry Loading Statistics
                </button>
              </div>
            ) : (
              <motion.div key="db" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                  <StatCard title="Total PR" value={stats.totalPR} icon={FileText} color="bg-indigo-500" />
                  <StatCard title="Wait Manager" value={stats.waitingManager} icon={Clock} color="bg-amber-500" />
                  <StatCard title="Wait Direktur" value={stats.waitingDirector} icon={Clock} color="bg-orange-500" />
                  <StatCard title="Wait PO" value={stats.waitingPO} icon={ShoppingBag} color="bg-blue-400" />
                  <StatCard title="Wait Receive" value={stats.waitingReceive} icon={ShoppingBag} color="bg-cyan-500" />
                  <StatCard title="Finished" value={stats.finish} icon={CheckCircle2} color="bg-emerald-500" />
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-2 space-y-8">
                    <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
                      <h3 className="font-bold mb-6 text-slate-800">Monthly Procurement Volume</h3>
                      <div className="h-64">
                        {stats?.chartData?.labels && stats?.chartData?.labels.length > 0 ? (
                          <Chart 
                            type="bar"
                            data={stats.chartData} 
                            options={{ 
                              maintainAspectRatio: false, 
                              plugins: { 
                                legend: { 
                                  display: true, 
                                  position: 'top' as const,
                                  align: 'end',
                                  labels: {
                                    font: { weight: 'bold', size: 11 },
                                    usePointStyle: true,
                                    padding: 20
                                  }
                                },
                                datalabels: {
                                  display: true,
                                  anchor: 'end',
                                  align: 'top',
                                  offset: 4,
                                  formatter: (value, context) => {
                                    if (context.dataset.label === 'Total Qty') return (value || 0).toLocaleString('id-ID');
                                    return '';
                                  },
                                  font: {
                                    weight: 'bold',
                                    size: 10
                                  },
                                  color: 'rgb(79, 70, 229)',
                                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                  borderRadius: 4,
                                  padding: 4
                                }
                              },
                              scales: { 
                                y: { 
                                  beginAtZero: true,
                                  position: 'left',
                                  grid: { color: 'rgba(241, 245, 249, 1)' },
                                  title: { display: true, text: 'PR Count', font: { weight: 'bold', size: 11 } }
                                },
                                y1: {
                                  beginAtZero: true,
                                  position: 'right',
                                  grid: { display: false },
                                  title: { display: true, text: 'Total Qty', font: { weight: 'bold', size: 11 } }
                                },
                                x: {
                                  grid: { display: false }
                                }
                              },
                              elements: {
                                line: {
                                  borderWidth: 3,
                                  tension: 0.4
                                },
                                point: {
                                  radius: 3,
                                  hoverRadius: 6
                                }
                              }
                            }} 
                          />
                        ) : (
                          <div className="h-full flex items-center justify-center text-slate-400 font-bold text-sm bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                            Loading chart data...
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm text-left">
                      <h4 className="font-bold text-slate-800 mb-4 uppercase text-xs tracking-widest">Top 10 Requested Items</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {stats.topItems?.map((item, i) => (
                          <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-indigo-100 transition-colors">
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-800 truncate">{item.name}</p>
                              <p className="text-[9px] text-slate-400 font-bold uppercase block text-left">Qty: {item.totalQty || 0}</p>
                            </div>
                            <span className="text-[10px] font-black bg-white border border-slate-200 text-indigo-600 px-2 py-1 rounded-lg shrink-0 shadow-sm">{item.count} PRs</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-6 text-left">
                    <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                      <h4 className="font-bold text-slate-800 mb-4 uppercase text-xs tracking-widest">Top Suppliers</h4>
                      <div className="space-y-3">
                        {stats.topSuppliers?.map((s, i) => (
                          <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-800 truncate">{s.name}</p>
                              <p className="text-[9px] text-slate-400 font-bold uppercase block text-left">Total Qty: {s.totalQty || 0}</p>
                            </div>
                            <span className="text-[10px] font-black bg-indigo-50 text-indigo-700 px-2 py-1 rounded-lg border border-indigo-100 shadow-sm shrink-0">{s.count} PRs</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                      <h4 className="font-bold text-slate-800 mb-4 uppercase text-xs tracking-widest">Top Divisions</h4>
                      <div className="space-y-3">
                        {stats.topDivisions?.map((d, i) => (
                          <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-800 truncate">{d.name}</p>
                              <p className="text-[9px] text-slate-400 font-bold uppercase block text-left">Total Qty: {d.totalQty || 0}</p>
                            </div>
                            <span className="text-[10px] font-black bg-emerald-50 text-emerald-700 px-2 py-1 rounded-lg border border-emerald-100 shadow-sm shrink-0">{d.count} PRs</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    <div className="bg-indigo-600 p-6 rounded-3xl shadow-lg shadow-indigo-100 text-white">
                      <h4 className="font-bold mb-2">Need Help?</h4>
                      <p className="text-xs text-indigo-100 mb-4 opacity-80 leading-relaxed">Contact your IT division for issues regarding the procurement system access or bug reports.</p>
                      <button className="w-full py-3 bg-white text-indigo-600 rounded-xl font-bold text-sm shadow-sm hover:bg-slate-50 transition">Contact Support</button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )
          )}

          {activeTab === 'create-pr' && canSee('CREATE PR') && (
            <motion.div key="form" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm max-w-2xl mx-auto">
              <div className="mb-8 flex justify-between items-start">
                <div>
                  <h3 className="text-xl font-bold text-slate-900 uppercase">NEW PURCHASE REQUEST</h3>
                  <p className="text-xs text-slate-500 font-bold mt-1">NO PR: <span className="text-indigo-600">AUTO-GENERATED</span></p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-black text-slate-400 uppercase">Requester</p>
                  <p className="text-sm font-bold text-slate-800">{user.displayName}</p>
                  <p className="text-[10px] font-bold text-indigo-500">{user.division}</p>
                </div>
              </div>
              
              <form onSubmit={handleSubmitPR} className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Supplier</label>
                  <select className="w-full px-4 py-3 rounded-xl border border-slate-200" value={prForm.supplier} onChange={e => setPrForm({...prForm, supplier: e.target.value})} required>
                    <option value="">Select Supplier</option>
                    {suppliers.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div className="space-y-6 max-h-[500px] overflow-y-auto pr-2 pb-4">
                  {prForm.items.map((item, index) => (
                    <div key={index} className="p-6 bg-slate-50 rounded-2xl border border-slate-200 relative group">
                      {prForm.items.length > 1 && (
                        <button type="button" onClick={() => removeItem(index)} className="absolute -top-3 -right-3 w-8 h-8 bg-red-100 text-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                      
                      <div className="mb-4">
                        <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-wider">Item #{index + 1}</label>
                        <select className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white" value={item.itemName} onChange={e => updateItem(index, 'itemName', e.target.value)} required disabled={!prForm.supplier}>
                          <option value="">Select Item</option>
                          {stockMaster.filter(s => s.supplier === prForm.supplier).map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                          <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-wider">Qty Requested</label>
                          <div className="relative">
                            <input type="number" className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white" value={item.qty} onChange={e => updateItem(index, 'qty', e.target.value)} required />
                            <span className="absolute right-4 top-3 text-xs font-bold text-slate-400">{item.unit}</span>
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-wider">Stock Onhand</label>
                          <input type="number" className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white" value={item.stockOnhand} onChange={e => updateItem(index, 'stockOnhand', e.target.value)} required />
                        </div>
                      </div>

                      <div className="bg-white p-4 rounded-xl border border-slate-100 mb-4">
                        <div className="flex justify-between items-center mb-3">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sales History (B1-B3)</label>
                          <div className="text-right">
                             <p className="text-[9px] font-bold text-slate-400 uppercase">Avg</p>
                             <p className="text-xs font-black text-indigo-600">{calculateAvg(item).toFixed(1)}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-3 mb-3">
                          <input type="number" placeholder="B1" className="w-full px-3 py-2 rounded-lg border border-slate-100 bg-slate-50 text-xs" value={item.b1} onChange={e => updateItem(index, 'b1', e.target.value)} />
                          <input type="number" placeholder="B2" className="w-full px-3 py-2 rounded-lg border border-slate-100 bg-slate-50 text-xs" value={item.b2} onChange={e => updateItem(index, 'b2', e.target.value)} />
                          <input type="number" placeholder="B3" className="w-full px-3 py-2 rounded-lg border border-slate-100 bg-slate-50 text-xs" value={item.b3} onChange={e => updateItem(index, 'b3', e.target.value)} />
                        </div>
                        <div className="pt-2 border-t border-slate-50">
                           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Estimasi</p>
                           <p className="text-xs font-bold text-indigo-600">
                             Estimasi stock untuk penjualan {Math.round(calculateEstimasi(item))} hari
                           </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <button type="button" onClick={addItem} className="w-full py-3 border-2 border-dashed border-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center gap-2 font-bold hover:bg-indigo-50 transition-all mb-4">
                  <Plus className="w-4 h-4" /> Add Item
                </button>

                <div className="mb-8">
                  <label className="block text-sm font-bold text-slate-700 mb-2">Overall Notes (Optional)</label>
                  <textarea 
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all outline-none" 
                    rows={3} 
                    value={prForm.notes || ''} 
                    onChange={e => setPrForm({...prForm, notes: e.target.value})} 
                    placeholder="Masukkan catatan tambahan di sini..."
                  ></textarea>
                </div>

                <button type="submit" disabled={isLoading} className="w-full bg-indigo-600 text-white font-bold py-4 rounded-xl shadow-lg hover:translate-y-[-2px] transition-all">
                  {isLoading ? 'SUBMITTING...' : 'SUBMIT PURCHASE REQUEST'}
                </button>
              </form>
            </motion.div>
          )}

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
                    <option value="FINISH">FINISH</option>
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
                        <th className="px-8 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest text-center">PR ID</th>
                        <th className="px-8 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Requester</th>
                        <th className="px-8 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest text-center">Status</th>
                        <th className="px-8 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest text-center whitespace-nowrap">Estimasi Datang</th>
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
                          <td onClick={() => openPRDetail(pr)} className="px-8 py-4 font-bold text-indigo-600 border-l-4 border-l-transparent hover:border-l-indigo-500 text-xs cursor-pointer hover:underline transition-all text-center">{pr.id}</td>
                          <td className="px-8 py-4">
                            <p className="font-bold text-slate-800 text-sm">{pr.requester}</p>
                            <p className="text-[10px] uppercase font-bold text-slate-400">{pr.division}</p>
                          </td>
                          <td className="px-8 py-4 text-center">
                            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter ${
                              pr.status?.includes('WAITING') ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                              pr.status === 'Approved' || pr.status === 'FINISH' || pr.status === 'WAITING CREATED PO' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                              pr.status === 'Rejected' ? 'bg-red-50 text-red-600 border border-red-100' :
                              'bg-slate-50 text-slate-500 border border-slate-100'
                            }`}>{pr.status}</span>
                          </td>
                          <td className="px-8 py-4 text-center">
                            <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg border border-indigo-100">
                              {(() => {
                                const linkedPO = poList.find(po => String(po.prId) === String(pr.id));
                                return linkedPO?.deliveryDate || '-';
                              })()}
                            </span>
                          </td>
                          <td className="px-8 py-4 text-center">
                            <span className="text-[10px] font-bold text-slate-600 font-mono tracking-tighter">
                              {pr.poNumber || '-'}
                            </span>
                          </td>
                          <td className="px-8 py-4">
                             <div className="flex justify-center">
                                <button onClick={() => openPRDetail(pr)} className="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors">
                                    <FileText className="w-4 h-4" />
                                </button>
                             </div>
                          </td>
                          <td className="px-8 py-4 text-right">
                            <div className="flex justify-end gap-1">
                               <button onClick={() => handleEditPR(pr)} title="Edit" className="p-2 text-slate-400 hover:text-indigo-600 transition-colors"><Edit className="w-4 h-4" /></button>
                               {pr.status === 'WAITING RECEIVE' && (
                                 <button onClick={() => handleFinishPR(pr.id)} title="Receive/Finish" className="p-2 text-emerald-500 hover:bg-emerald-50 rounded-lg"><CheckCircle2 className="w-4 h-4" /></button>
                               )}
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

          {activeTab === 'po-history' && canSee('PO HISTORY') && (
            <motion.div key="po-list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
              <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-wrap gap-4 items-end">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Filter Division</label>
                  <select className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-700" value={searchDivisionPO} onChange={e => setSearchDivisionPO(e.target.value)}>
                    <option value="">All Divisions</option>
                    {divisionsFromPR.map(div => (
                      <option key={div} value={div}>{div}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Filter Supplier</label>
                  <select className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-700" value={searchSupplierPO} onChange={e => setSearchSupplierPO(e.target.value)}>
                    <option value="">All Suppliers</option>
                    {Array.from(new Set(poList.map(p => p.supplier).filter(Boolean))).sort().map(sup => (
                      <option key={sup} value={sup}>{sup}</option>
                    ))}
                  </select>
                </div>
                <button onClick={() => {setSearchDivisionPO(''); setSearchSupplierPO('');}} className="px-6 py-2 bg-slate-100 text-slate-500 rounded-xl font-bold text-sm hover:bg-slate-200 transition-all">Reset</button>
              </div>

              <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                  <h3 className="font-bold text-slate-800">PO History Log</h3>
                  <div className="flex gap-2">
                    <span className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-500">
                      {(() => {
                        const count = Array.from(new Set(poList.map(p => p.poNo)))
                          .map(poNo => {
                              const group = poList.filter(p => p.poNo === poNo);
                              const totalAmount = Number(group[0]?.grandTotal || 0);
                              return { ...group[0], totalAmount };
                          })
                          .filter(po => {
                            if (!po) return false;
                            const role = String(user.role || '').trim().toUpperCase();
                            const divCode = String(user.divisionCode || '').trim().toUpperCase();
                            const isPowerUser = ['ADMIN', 'PURCHASE', 'MANAJER', 'MANAGER', 'DIREKTUR', 'DIREKSI', 'DIR', 'MGR', 'KABAG', 'KADIV', 'PURCHASING'].includes(role) ||
                                                role.includes('MANAGER') || role.includes('MANAJER') || role.includes('DIREKTUR') || role.includes('DIREKSI') || 
                                                canSee('APPROVAL') || divCode === 'MGR' || divCode === 'DIR';
                            const poDiv = String(po.division || '').toLowerCase().trim();
                            const userDiv = String(user.division || '').toLowerCase().trim();
                            if (!isPowerUser && userDiv && poDiv !== userDiv && !poDiv.includes(userDiv) && !userDiv.includes(poDiv)) return false;
                            
                            const matchesDivision = searchDivisionPO === '' || poDiv.includes(searchDivisionPO.toLowerCase().trim());
                            const matchesSupplier = searchSupplierPO === '' || String(po.supplier || '').toLowerCase().trim().includes(searchSupplierPO.toLowerCase().trim());
                            
                            return matchesDivision && matchesSupplier;
                          }).length;
                        return `Found: ${count} Unique POs`;
                      })()}
                    </span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left font-sans">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>
                        <th className="px-8 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">PO Number</th>
                        <th className="px-8 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">PR Linked</th>
                        <th className="px-8 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Supplier</th>
                        <th className="px-8 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Tgl Kirim</th>
                        <th className="px-8 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Qty</th>
                        <th className="px-8 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Total</th>
                        <th className="px-8 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">PDF</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {Array.from(new Set(poList.map(p => p.poNo)))
                        .map(poNo => {
                            const group = poList.filter(p => p.poNo === poNo);
                            // Use grandTotal from the spreadsheet (Column S)
                            const totalAmount = Number(group[0]?.grandTotal || 0);
                            const totalQty = group.reduce((sum, item) => sum + Number(item.qty), 0);
                            return { ...group[0], totalAmount, totalQty };
                        })
                        .filter(po => {
                          if (!po) return false;
                          const role = String(user.role || '').trim().toUpperCase();
                          const divCode = String(user.divisionCode || '').trim().toUpperCase();
                          const isPowerUser = ['ADMIN', 'PURCHASE', 'MANAJER', 'MANAGER', 'DIREKTUR', 'DIREKSI', 'DIR', 'MGR', 'KABAG', 'KADIV', 'PURCHASING'].includes(role) ||
                                              role.includes('MANAGER') || role.includes('MANAJER') || role.includes('DIREKTUR') || role.includes('DIREKSI') || 
                                              canSee('APPROVAL') || divCode === 'MGR' || divCode === 'DIR';
                          
                          // Data isolation: Regular users only see their own division's POs (via PR links)
                          const poDiv = String(po.division || '').toLowerCase().trim();
                          const userDiv = String(user.division || '').toLowerCase().trim();
                          
                          if (!isPowerUser && userDiv && poDiv !== userDiv && !poDiv.includes(userDiv) && !userDiv.includes(poDiv)) return false;
                          
                          const matchesDivision = searchDivisionPO === '' || poDiv.includes(searchDivisionPO.toLowerCase().trim());
                          const matchesSupplier = searchSupplierPO === '' || String(po.supplier || '').toLowerCase().trim().includes(searchSupplierPO.toLowerCase().trim());
                          
                          return matchesDivision && matchesSupplier;
                        })
                        .map(po => (
                        <tr key={po.poNo} className="hover:bg-slate-50 transition-colors">
                          <td onClick={() => openPODetail(po)} className="px-8 py-4 font-bold text-indigo-600 border-l-4 border-l-transparent hover:border-l-indigo-500 text-xs cursor-pointer hover:underline transition-all text-center">{po.poNo}</td>
                          <td className="px-8 py-4 text-center font-bold text-indigo-600 text-xs">{po.prId}</td>
                          <td className="px-8 py-4">
                            <p className="font-bold text-slate-800 text-sm">{po.supplier}</p>
                            <p className="text-[10px] uppercase font-bold text-slate-400">By {po.purchaseName}</p>
                          </td>
                          <td className="px-8 py-4 text-center text-xs text-slate-600 font-bold">{po.deliveryDate || '-'}</td>
                          <td className="px-8 py-4 text-center text-xs font-bold text-slate-700">{po.totalQty}</td>
                          <td className="px-8 py-4 text-center text-xs font-black text-slate-900 leading-none">
                            Rp {po.totalAmount.toLocaleString('id-ID')}
                          </td>
                          <td className="px-8 py-4">
                             <div className="flex justify-center">
                                <button onClick={() => openPODetail(po)} className="p-2 bg-indigo-55 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors">
                                    <FileText className="w-4 h-4" />
                                </button>
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

          {activeTab === 'purchase-queue' && canSee('PURCHASE') && (
             <motion.div key="pq" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                {(() => {
                  const waitingPRs = prList.filter(p => String(p.status || '').trim().toUpperCase() === 'WAITING CREATED PO');
                  const groupedResults = {};
                  waitingPRs.forEach(item => {
                    if (!groupedResults[item.id]) groupedResults[item.id] = [];
                    groupedResults[item.id].push(item);
                  });

                  const prIds = Object.keys(groupedResults).sort((a, b) => b.localeCompare(a));

                  if (prIds.length === 0) {
                    return (
                      <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-200">
                        <ShoppingBag className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                        <p className="text-slate-400 font-bold">No purchase requests waiting for PO.</p>
                      </div>
                    );
                  }

                  return prIds.map(prId => {
                    const items = groupedResults[prId];
                    const info = items[0];
                    return (
                      <div key={prId} className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                          <div className="p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                            <div>
                              <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">PR NUMBER</span>
                              <h4 className="font-bold text-lg text-slate-800">{prId}</h4>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="text-right hidden sm:block">
                                <p className="text-[10px] font-bold text-slate-400 uppercase">Division & Supplier</p>
                                <p className="text-sm font-bold text-slate-700">{info.division} • <span className="text-indigo-600">{info.supplier}</span></p>
                              </div>
                              <button 
                                onClick={() => openPOForm(items)} 
                                className="px-6 py-2.5 bg-indigo-600 text-white text-[10px] font-black uppercase rounded-xl shadow-lg shadow-indigo-100 hover:translate-y-[-2px] transition-all"
                              >
                                Process PO
                              </button>
                            </div>
                          </div>
                          <div className="p-0">
                            <table className="w-full text-left">
                              <thead className="bg-white border-b border-slate-50">
                                <tr>
                                  <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase">Item Name</th>
                                  <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase text-center">Qty</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50">
                                {items.map(item => (
                                  <tr key={`${item.id}-${item.rowIndex}`} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-6 py-4">
                                      <p className="font-bold text-slate-800 text-sm">{item.itemName}</p>
                                      <p className="text-[10px] text-slate-400">Stock: {item.stockOnhand} | Avg: {Number(item.avgSales).toFixed(1)}</p>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                      <span className="font-bold text-slate-700 text-sm">{item.qty}</span>
                                      <span className="ml-1 text-[10px] font-bold text-slate-400 uppercase">{item.unit}</span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        <div className="p-4 bg-slate-50/50 flex justify-between items-center px-6">
                           <p className="text-[10px] text-slate-400 font-bold uppercase">Requested by {info.requester}</p>
                           <button onClick={() => openPRDetail(info)} className="text-[10px] text-indigo-600 font-black hover:underline uppercase">View Full PR</button>
                        </div>
                      </div>
                    );
                  });
                })()}
             </motion.div>
          )}

          {activeTab === 'po-form' && (
            <motion.div key="poform" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white p-8 rounded-3xl border border-slate-100 shadow-xl max-w-3xl mx-auto">
                <div className="mb-8 flex justify-between items-start pb-6 border-b border-slate-100">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                           <ShoppingBag className="w-5 h-5 text-indigo-600" />
                           <h3 className="text-xl font-bold text-slate-900 uppercase">Create Purchase Order</h3>
                        </div>
                        <p className="text-xs text-slate-400 font-bold">Linking to PR: <span className="text-indigo-600">{poForm.prId}</span></p>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="text-right">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Authorized By</p>
                            <p className="text-sm font-bold text-slate-900">{user.displayName}</p>
                        </div>
                        <button onClick={() => setActiveTab('purchase-queue')} className="p-2 transition-colors bg-slate-50 text-slate-400 rounded-xl hover:text-slate-600">
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                <form onSubmit={handleSubmitPO} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Supplier</label>
                            <div className="px-4 py-3 rounded-xl border border-slate-100 bg-slate-50 text-indigo-600 font-bold text-sm">
                               {poForm.supplier}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Target Delivery Date</label>
                            <input 
                                type="date" 
                                className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
                                value={poForm.deliveryDate} 
                                onChange={e => setPoForm({...poForm, deliveryDate: e.target.value})} 
                                required 
                            />
                        </div>
                    </div>

                    <div className="space-y-2 bg-slate-50/50 p-4 rounded-2xl border border-slate-100/80">
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest">Alamat Kirim (Gudang)</label>
                        <select 
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none transition-all shadow-sm"
                            value={poForm.division}
                            onChange={e => setPoForm({...poForm, division: e.target.value})}
                            required
                        >
                            {Object.keys(WAREHOUSE_ADDRESS_INFO).map(key => (
                                <option key={key} value={key}>{key} - {WAREHOUSE_ADDRESS_INFO[key].name}</option>
                            ))}
                        </select>
                        <div className="mt-2 p-4 bg-white border border-slate-100 rounded-xl shadow-inner">
                            <p className="text-[9px] font-black text-indigo-500 uppercase tracking-widest mb-1.5">Alamat Terisi Otomatis</p>
                            <p className="text-xs font-bold text-slate-700 leading-relaxed">
                                {WAREHOUSE_ADDRESS_INFO[poForm.division]?.address || '-'}
                            </p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Item & Pricing Details</label>
                        <div className="space-y-3 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                          {poForm.items.map((item, idx) => (
                            <div key={idx} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                               <div className="md:col-span-4">
                                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">Item Name</p>
                                  <p className="font-bold text-slate-700 text-sm truncate">{item.itemName}</p>
                               </div>
                               <div className="md:col-span-2 text-center">
                                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">Quantity</p>
                                  <p className="font-bold text-slate-700 text-sm">{item.qty} {item.unit}</p>
                               </div>
                               <div className="md:col-span-3">
                                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5 text-right">Unit Price (IDR)</p>
                                  <div className="relative">
                                    <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">Rp</span>
                                    <input 
                                      type="number" 
                                      className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-100 rounded-lg text-sm font-bold focus:bg-white focus:ring-2 focus:ring-indigo-500 transition-all text-right"
                                      placeholder="0"
                                      value={item.price}
                                      onChange={e => {
                                        const newItems = [...poForm.items];
                                        newItems[idx].price = e.target.value;
                                        setPoForm({...poForm, items: newItems});
                                      }}
                                      required
                                    />
                                  </div>
                               </div>
                               <div className="md:col-span-3 text-right">
                                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">Item Total</p>
                                  <p className="font-black text-indigo-600 text-sm">
                                    Rp {(Number(item.qty || 0) * Number(item.price || 0)).toLocaleString('id-ID')}
                                  </p>
                               </div>
                            </div>
                          ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
                        <div className="space-y-4">
                            <div className="space-y-2">
                              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Internal Notes for PO</label>
                              <textarea 
                                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium" 
                                  rows={4} 
                                  placeholder="Notes for vendor or logistics..."
                                  value={poForm.notes} 
                                  onChange={e => setPoForm({...poForm, notes: e.target.value})}
                              ></textarea>
                            </div>
                        </div>

                        <div className="bg-slate-50 p-6 rounded-3xl space-y-3 border border-slate-100">
                             {(() => {
                               const subTotal = poForm.items.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.qty || 0)), 0);
                               const discountNominal = (subTotal * Number(poForm.discountPercent || 0)) / 100;
                               const taxNominal = (subTotal * Number(poForm.taxPercent || 0)) / 100;
                               const grandTotal = subTotal - discountNominal + taxNominal + Number(poForm.others || 0);

                               return (
                                 <>
                                   <div className="flex justify-between items-center text-slate-500">
                                      <p className="text-[10px] font-black uppercase tracking-widest">Sub Total</p>
                                      <p className="font-bold text-sm">Rp {subTotal.toLocaleString('id-ID')}</p>
                                   </div>
                                   
                                   <div className="space-y-1">
                                     <div className="flex justify-between items-center gap-4">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest shrink-0">Discount (%)</label>
                                        <div className="flex items-center gap-2">
                                          <input 
                                            type="number" 
                                            className="w-16 px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-right focus:ring-2 focus:ring-red-500 outline-none"
                                            placeholder="0"
                                            value={poForm.discountPercent}
                                            onChange={e => setPoForm({...poForm, discountPercent: Number(e.target.value)})}
                                          />
                                          <span className="text-[10px] font-bold text-slate-400">%</span>
                                        </div>
                                     </div>
                                     <div className="flex justify-end">
                                        <p className="text-[10px] font-bold text-red-500">- Rp {discountNominal.toLocaleString('id-ID')}</p>
                                     </div>
                                   </div>
                                   
                                   <div className="space-y-1">
                                     <div className="flex justify-between items-center gap-4">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest shrink-0">Pajak / Tax (%)</label>
                                        <div className="flex items-center gap-2">
                                          <input 
                                            type="number" 
                                            className="w-16 px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-right focus:ring-2 focus:ring-indigo-500 outline-none"
                                            placeholder="0"
                                            value={poForm.taxPercent}
                                            onChange={e => setPoForm({...poForm, taxPercent: Number(e.target.value)})}
                                          />
                                          <span className="text-[10px] font-bold text-slate-400">%</span>
                                        </div>
                                     </div>
                                     <div className="flex justify-end">
                                        <p className="text-[10px] font-bold text-indigo-500">+ Rp {taxNominal.toLocaleString('id-ID')}</p>
                                     </div>
                                   </div>
                                   
                                   <div className="flex justify-between items-center gap-4">
                                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest shrink-0">Lain-lain (+)</label>
                                      <input 
                                        type="number" 
                                        className="w-32 px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-right focus:ring-2 focus:ring-indigo-500 outline-none"
                                        placeholder="0"
                                        value={poForm.others}
                                        onChange={e => setPoForm({...poForm, others: Number(e.target.value)})}
                                      />
                                   </div>

                                   <div className="pt-4 mt-2 border-t border-slate-200 flex justify-between items-center">
                                      <p className="text-xs font-black text-slate-800 uppercase tracking-widest">Total Bayar</p>
                                      <p className="text-2xl font-black text-indigo-600">
                                        Rp {grandTotal.toLocaleString('id-ID')}
                                      </p>
                                   </div>
                                 </>
                               );
                             })()}
                        </div>
                    </div>

                    <div className="pt-4 flex gap-4">
                        <button type="submit" disabled={isLoading} className="flex-1 bg-indigo-600 text-white font-black uppercase text-sm py-4 rounded-xl shadow-lg shadow-indigo-100 hover:translate-y-[-2px] hover:bg-indigo-700 transition-all disabled:opacity-50">
                            {isLoading ? 'GENERATING PO...' : 'GENERATE PURCHASE ORDERS'}
                        </button>
                    </div>
                </form>
            </motion.div>
          )}

          {activeTab === 'settings' && user.role?.toUpperCase() === 'ADMIN' && (
            <motion.div key="settings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
              <div className="flex flex-wrap gap-4 mb-6">
                <button onClick={() => setSettingsTab('users')} className={`px-6 py-2 rounded-xl font-bold transition-all ${settingsTab === 'users' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-slate-600 border border-slate-100'}`}>User Management</button>
                <button onClick={() => setSettingsTab('stock')} className={`px-6 py-2 rounded-xl font-bold transition-all ${settingsTab === 'stock' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-slate-600 border border-slate-100'}`}>Inventory Master</button>
                <button onClick={() => setSettingsTab('whatsapp')} className={`px-6 py-2 rounded-xl font-bold transition-all ${settingsTab === 'whatsapp' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-slate-600 border border-slate-100'}`}>WhatsApp Diagnostics</button>
              </div>

              {settingsTab === 'users' && (
                <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                    <h3 className="font-bold text-slate-800">System Users</h3>
                    <button onClick={handleAddUser} className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2"><Plus className="w-4 h-4" /> Add User</button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                       <thead className="bg-slate-50 border-b border-slate-100">
                         <tr>
                           <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Username</th>
                           <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Full Name</th>
                           <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Password</th>
                           <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Role</th>
                           <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Div Code</th>
                           <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">WA</th>
                           <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Access</th>
                           <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Actions</th>
                         </tr>
                       </thead>
                       <tbody className="divide-y divide-slate-100">
                         {adminData.users.map((u) => (
                           <tr key={u.id}>
                             <td className="px-6 py-4 font-bold text-slate-800">{u.username}</td>
                             <td className="px-6 py-4 text-slate-600">{u.fullName}</td>
                             <td className="px-6 py-4 text-slate-400 font-mono text-[10px]">{u.password}</td>
                             <td className="px-6 py-4"><span className="px-2 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-black uppercase">{u.role}</span></td>
                             <td className="px-6 py-4 text-slate-600 text-[10px] font-bold">{u.divCode}</td>
                             <td className="px-6 py-4 text-slate-600 text-[10px]">{u.wa}</td>
                             <td className="px-6 py-4">
                               <div className="flex flex-wrap gap-1 max-w-[150px]">
                                 {(u.access || '').split(',').filter(Boolean).map(a => (
                                   <span key={a} className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[9px] font-bold whitespace-nowrap">{a.trim()}</span>
                                 ))}
                               </div>
                             </td>
                             <td className="px-6 py-4 flex gap-1">
                               <button onClick={() => handleEditUser(u)} className="p-2 text-indigo-500 hover:bg-indigo-50 rounded-lg"><Edit className="w-4 h-4" /></button>
                               <button onClick={() => handleDeleteUser(u.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                             </td>
                           </tr>
                         ))}
                       </tbody>
                    </table>
                  </div>
                </div>
              )}

              {settingsTab === 'stock' && (
                <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                    <h3 className="font-bold text-slate-800">Master Stock</h3>
                    <button onClick={handleAddStock} className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2"><Plus className="w-4 h-4" /> Add Item</button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                       <thead className="bg-slate-50 border-b border-slate-100">
                         <tr>
                           <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Item Name</th>
                           <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Supplier</th>
                           <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Unit</th>
                           <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Category</th>
                           <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Actions</th>
                         </tr>
                       </thead>
                       <tbody className="divide-y divide-slate-100">
                         {adminData.stock.map((s) => (
                           <tr key={s.id}>
                             <td className="px-6 py-4 font-bold text-slate-800">{s.name}</td>
                             <td className="px-6 py-4 text-slate-600">{s.supplier}</td>
                             <td className="px-6 py-4 text-slate-600">{s.unit}</td>
                             <td className="px-6 py-4 font-bold text-indigo-600">{s.category}</td>
                             <td className="px-6 py-4 flex gap-1">
                               <button onClick={() => handleEditStock(s)} className="p-2 text-indigo-500 hover:bg-indigo-50 rounded-lg"><Edit className="w-4 h-4" /></button>
                               <button onClick={() => handleDeleteStock(s.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                             </td>
                           </tr>
                         ))}
                       </tbody>
                    </table>
                  </div>
                </div>
              )}

              {settingsTab === 'whatsapp' && (
                <WhatsAppDiagnosticsPanel apiFetch={apiFetch} />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
