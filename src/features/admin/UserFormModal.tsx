import React, { useEffect, useState } from 'react';
import Modal from '../../components/ui/Modal';
import type { AppUser } from '../../lib/types';

const menuOptions = ['DASHBOARD', 'CREATE PR', 'PR HISTORY', 'PO HISTORY', 'PURCHASE', 'APPROVAL'];
const roles = ['USER', 'Manager', 'Direktur', 'Purchase', 'ADMIN'];

type UserForm = {
  username: string;
  password: string;
  fullName: string;
  role: string;
  division: string;
  divCode: string;
  wa: string;
  access: string;
};

type Props = {
  open: boolean;
  mode: 'add' | 'edit';
  user?: AppUser | null;
  isSubmitting?: boolean;
  onClose: () => void;
  onSubmit: (values: UserForm) => void;
};

const emptyForm: UserForm = {
  username: '',
  password: '',
  fullName: '',
  role: 'USER',
  division: '',
  divCode: '',
  wa: '',
  access: '',
};

export default function UserFormModal({ open, mode, user, isSubmitting, onClose, onSubmit }: Props) {
  const [form, setForm] = useState<UserForm>(emptyForm);

  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && user) {
      setForm({
        username: user.username || '',
        password: '',
        fullName: user.fullName || user.displayName || '',
        role: String(user.role || 'USER'),
        division: user.division || '',
        divCode: user.divCode || user.divisionCode || '',
        wa: user.wa || '',
        access: user.access || '',
      });
    } else {
      setForm(emptyForm);
    }
  }, [open, mode, user]);

  const toggleAccess = (menu: string) => {
    const current = form.access.split(',').map(v => v.trim()).filter(Boolean);
    const next = current.includes(menu) ? current.filter(v => v !== menu) : [...current, menu];
    setForm({ ...form, access: next.join(', ') });
  };

  const accessList = form.access.split(',').map(v => v.trim()).filter(Boolean);

  return (
    <Modal open={open} title={mode === 'add' ? 'Add New User' : 'Edit User'} onClose={onClose}>
      <form
        className="grid grid-cols-1 gap-4 text-left"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(form);
        }}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="space-y-1">
            <span className="text-[10px] font-black uppercase text-slate-400">Username</span>
            <input className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" required value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-black uppercase text-slate-400">{mode === 'edit' ? 'New Password (optional)' : 'Password'}</span>
            <input className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" type="password" required={mode === 'add'} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-black uppercase text-slate-400">Full Name</span>
            <input className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-black uppercase text-slate-400">Role</span>
            <select className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
              {roles.map(role => <option key={role} value={role}>{role}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-black uppercase text-slate-400">Division</span>
            <input className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" value={form.division} onChange={e => setForm({ ...form, division: e.target.value })} />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-black uppercase text-slate-400">Division Code</span>
            <input className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" value={form.divCode} onChange={e => setForm({ ...form, divCode: e.target.value })} />
          </label>
          <label className="space-y-1 md:col-span-2">
            <span className="text-[10px] font-black uppercase text-slate-400">WhatsApp Number</span>
            <input className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" placeholder="628..." value={form.wa} onChange={e => setForm({ ...form, wa: e.target.value })} />
          </label>
        </div>

        <div>
          <p className="mb-2 text-[10px] font-black uppercase text-slate-400">Menu Access Permissions</p>
          <div className="grid grid-cols-2 gap-2">
            {menuOptions.map(menu => (
              <label key={menu} className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">
                <input type="checkbox" checked={accessList.includes(menu)} onChange={() => toggleAccess(menu)} />
                {menu}
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <button type="button" onClick={onClose} className="rounded-xl bg-slate-100 px-5 py-2 text-sm font-bold text-slate-600">Cancel</button>
          <button disabled={isSubmitting} type="submit" className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-60">{isSubmitting ? 'Saving...' : 'Save User'}</button>
        </div>
      </form>
    </Modal>
  );
}
