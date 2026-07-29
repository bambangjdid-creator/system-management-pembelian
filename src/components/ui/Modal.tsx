import React from 'react';
import { X } from '../../icons';

type ModalProps = {
  open: boolean;
  title: string;
  children: React.ReactNode;
  widthClassName?: string;
  onClose: () => void;
};

export default function Modal({ open, title, children, widthClassName = 'max-w-2xl', onClose }: ModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={onClose} aria-label="Close modal backdrop" />
      <div className={`relative w-full ${widthClassName} max-h-[90vh] overflow-y-auto rounded-3xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-100 dark:border-slate-800`}>
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 px-6 py-4 backdrop-blur">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-slate-100">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
