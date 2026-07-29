import React from 'react';

const colorClasses: Record<string, string> = {
  'bg-indigo-500': 'bg-indigo-50 text-indigo-600',
  'bg-amber-500': 'bg-amber-50 text-amber-600',
  'bg-orange-500': 'bg-orange-50 text-orange-600',
  'bg-blue-400': 'bg-blue-50 text-blue-600',
  'bg-blue-500': 'bg-blue-50 text-blue-600',
  'bg-cyan-500': 'bg-cyan-50 text-cyan-600',
  'bg-emerald-500': 'bg-emerald-50 text-emerald-600',
};

type StatCardProps = {
  title: string;
  value: React.ReactNode;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  color?: string;
};

export default function StatCard({ title, value, icon: Icon, color = 'bg-indigo-500' }: StatCardProps) {
  return (
    <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all group">
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 text-left">{title}</p>
      <div className="flex items-center justify-between">
        <h3 className="text-4xl font-black text-slate-900 tracking-tight leading-none">{value}</h3>
        <div className={`p-4 rounded-2xl ${colorClasses[color] || colorClasses['bg-indigo-500']} group-hover:scale-110 transition-transform`}>
          <Icon className="w-6 h-6" strokeWidth={3} />
        </div>
      </div>
    </div>
  );
}
