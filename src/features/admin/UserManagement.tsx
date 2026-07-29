import React from 'react';
import { Edit, Plus, Trash2 } from '../../icons';

type Props = {
  users: any[];
  onAddUser: () => void;
  onEditUser: (user: any) => void;
  onDeleteUser: (id: number) => void;
};

export default function UserManagement({ users, onAddUser, onEditUser, onDeleteUser }: Props) {
  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-slate-100 flex justify-between items-center">
        <h3 className="font-bold text-slate-800">System Users</h3>
        <button onClick={onAddUser} className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2"><Plus className="w-4 h-4" /> Add User</button>
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
            {users.map((u) => (
              <tr key={u.id || u.username}>
                <td className="px-6 py-4 font-bold text-slate-800">{u.username}</td>
                <td className="px-6 py-4 text-slate-600">{u.fullName || u.displayName}</td>
                <td className="px-6 py-4 text-slate-400 text-[10px] font-bold uppercase">{u.hasPassword ? 'Set' : 'Unset'}</td>
                <td className="px-6 py-4"><span className="px-2 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-black uppercase">{u.role}</span></td>
                <td className="px-6 py-4 text-slate-600 text-[10px] font-bold">{u.divCode || u.divisionCode}</td>
                <td className="px-6 py-4 text-slate-600 text-[10px]">{u.wa}</td>
                <td className="px-6 py-4">
                  <div className="flex flex-wrap gap-1 max-w-[150px]">
                    {(u.access || '').split(',').filter(Boolean).map((a: string) => (
                      <span key={a} className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[9px] font-bold whitespace-nowrap">{a.trim()}</span>
                    ))}
                  </div>
                </td>
                <td className="px-6 py-4 flex gap-1">
                  <button onClick={() => onEditUser(u)} className="p-2 text-indigo-500 hover:bg-indigo-50 rounded-lg"><Edit className="w-4 h-4" /></button>
                  <button onClick={() => onDeleteUser(u.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
