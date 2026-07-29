import React from 'react';
import { motion } from 'framer-motion';
import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Title,
  Tooltip,
} from 'chart.js';
import { Chart } from 'react-chartjs-2';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { CheckCircle2, Clock, FileText, ShoppingBag } from '../../icons';
import { useAppContext } from '../../store/AppContext';
import StatCard from '../components/StatCard';

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

export default function Dashboard() {
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

  return (
    <>
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
    </>
  );
}
