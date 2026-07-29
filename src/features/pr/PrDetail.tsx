import React from 'react';
import type { PurchaseRequest } from '../../lib/types';

export function getPrPdfUrl(pr: PurchaseRequest) {
  const cleanId = String(pr.id || '').replace(/\//g, '_');
  return pr.pdfLink || `/api/pdf/pr/${cleanId}.pdf`;
}

type Props = {
  pr: PurchaseRequest;
  onOpenPdf?: (pr: PurchaseRequest) => void;
};

export default function PrDetail({ pr, onOpenPdf }: Props) {
  return (
    <div className="space-y-3 text-left">
      <div>
        <p className="text-[10px] font-black text-slate-400 uppercase">PR ID</p>
        <p className="font-bold text-indigo-600">{pr.id}</p>
      </div>
      <div>
        <p className="text-[10px] font-black text-slate-400 uppercase">Requester</p>
        <p className="font-bold text-slate-800">{pr.requester || '-'}</p>
      </div>
      <button type="button" onClick={() => onOpenPdf?.(pr)} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold">
        Open PDF
      </button>
    </div>
  );
}
