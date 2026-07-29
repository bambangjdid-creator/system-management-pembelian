import React from 'react';
import type { PurchaseOrder } from '../../lib/types';

export function getPoPdfUrl(po: PurchaseOrder) {
  const cleanPoNo = String(po.poNo || '').replace(/\//g, '_');
  return po.pdfLink || `/api/pdf/po/${cleanPoNo}.pdf`;
}

type Props = {
  po: PurchaseOrder;
  onOpenPdf?: (po: PurchaseOrder) => void;
};

export default function PoDetail({ po, onOpenPdf }: Props) {
  return (
    <div className="space-y-3 text-left">
      <div>
        <p className="text-[10px] font-black text-slate-400 uppercase">PO Number</p>
        <p className="font-bold text-indigo-600">{po.poNo}</p>
      </div>
      <div>
        <p className="text-[10px] font-black text-slate-400 uppercase">Supplier</p>
        <p className="font-bold text-slate-800">{po.supplier || '-'}</p>
      </div>
      <button type="button" onClick={() => onOpenPdf?.(po)} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold">
        Open PDF
      </button>
    </div>
  );
}
