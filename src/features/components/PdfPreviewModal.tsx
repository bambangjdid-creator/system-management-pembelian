import React from 'react';
import Modal from '../../components/ui/Modal';

type Action = {
  label: string;
  className: string;
  onClick: () => void;
};

type Props = {
  open: boolean;
  title: string;
  previewUrl: string;
  originalLink: string;
  meta?: React.ReactNode;
  actions?: Action[];
  onClose: () => void;
};

export default function PdfPreviewModal({ open, title, previewUrl, originalLink, meta, actions = [], onClose }: Props) {
  return (
    <Modal open={open} title={title} widthClassName="max-w-5xl" onClose={onClose}>
      <div className="space-y-4">
        {meta}
        <div className="relative h-[70vh] min-h-[520px] overflow-hidden rounded-xl bg-slate-100 shadow-inner">
          <iframe src={previewUrl} className="h-full w-full border-0" title={title} />
        </div>
        {actions.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2">
            {actions.map(action => (
              <button key={action.label} type="button" onClick={action.onClick} className={action.className}>
                {action.label}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-col items-center gap-1 border-t border-slate-100 pt-4 dark:border-slate-800/80">
          <a href={originalLink} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-bold text-indigo-600 hover:underline dark:text-indigo-400">
            Open Original / Download
          </a>
        </div>
      </div>
    </Modal>
  );
}
