import React from 'react';
import { AlertCircle, Plus, Trash2 } from '../../icons';
import type { ReceiveBatch, ReceiveItem } from '../../lib/types';

type Props = {
  item: ReceiveItem;
  index: number;
  onChange: (patch: Partial<ReceiveItem>) => void;
};

/** Faktor konversi satuan terpilih -> satuan dasar. */
export function unitFactor(item: ReceiveItem): number {
  const unit = (item.unitTerima || '').toUpperCase();
  if (!unit || !item.wms) return 1;
  if (unit === (item.wms.unitBase || '').toUpperCase()) return 1;
  const found = item.wms.allowedUnits.find((u) => u.unit.toUpperCase() === unit);
  return found ? found.toUnitQty : 1;
}

/** Qty terima dikonversi ke satuan dasar. */
export function qtyBaseOf(item: ReceiveItem): number {
  return (Number(item.qtyTerima) || 0) * unitFactor(item);
}

/**
 * Satu baris item pada form terima.
 *
 * Perbedaan penting dengan form lama:
 *  - Satuan terima bisa dipilih (DUS walaupun PO memesan PCS), dengan pratinjau
 *    hasil konversi supaya checker melihat angka stok sebenarnya.
 *  - Item TRACK_EXPIRY=Y wajib mengisi tanggal expired; bisa lebih dari satu
 *    batch bila satu kedatangan punya tanggal berbeda.
 */
export default function ReceiveItemRow({ item, index, onChange }: Props) {
  const wms = item.wms;
  const factor = unitFactor(item);
  const qtyBase = qtyBaseOf(item);
  const qtyTerima = Number(item.qtyTerima) || 0;

  const activeUnit = (item.unitTerima || item.unit || wms?.unitBase || '').toUpperCase();
  const unitOptions = wms?.allowedUnits?.length
    ? wms.allowedUnits
    : [{ unit: item.unit || 'PCS', toUnitQty: 1, isBase: true }];

  const batches: ReceiveBatch[] = item.batches && item.batches.length
    ? item.batches
    : [{ batchNo: '', expiredDate: '', qty: item.qtyTerima ?? '' }];

  const batchTotal = batches.reduce((sum, b) => sum + (Number(b.qty) || 0), 0);
  const batchMismatch =
    wms?.trackExpiry && batches.length > 0 && Math.abs(batchTotal - qtyTerima) > 0.0001;

  const missingExpiry =
    wms?.trackExpiry && qtyTerima > 0 && batches.some((b) => !b.expiredDate);

  const setBatch = (batchIndex: number, patch: Partial<ReceiveBatch>) => {
    const next = batches.map((b, i) => (i === batchIndex ? { ...b, ...patch } : b));
    onChange({ batches: next });
  };

  const addBatch = () => {
    // Batch baru dimulai dengan qty 0 supaya user sadar harus membagi qty.
    onChange({ batches: [...batches, { batchNo: '', expiredDate: '', qty: 0 }] });
  };

  const removeBatch = (batchIndex: number) => {
    onChange({ batches: batches.filter((_, i) => i !== batchIndex) });
  };

  return (
    <>
      <tr className={missingExpiry || batchMismatch ? 'bg-red-50/50' : undefined}>
        <td className="px-3 py-2.5 text-slate-500 align-top">{index + 1}</td>
        <td className="px-3 py-2.5 align-top">
          <p className="font-bold text-slate-800">{item.itemName}</p>
          {wms?.matched ? (
            <p className="text-[10px] text-slate-400 font-mono">
              {wms.itemId} · dasar {wms.unitBase}
              {wms.trackExpiry && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-sans font-bold">
                  EXPIRED
                </span>
              )}
            </p>
          ) : (
            <p className="text-[10px] text-amber-600 font-bold mt-0.5">
              Belum ada di Master Data WMS — stok tidak bertambah
            </p>
          )}
        </td>
        <td className="px-3 py-2.5 align-top">
          <select
            value={activeUnit}
            onChange={(e) => onChange({ unitTerima: e.target.value })}
            className="w-full min-w-[84px] rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
          >
            {unitOptions.map((u) => (
              <option key={u.unit} value={u.unit}>
                {u.unit}
              </option>
            ))}
          </select>
        </td>
        <td className="px-3 py-2.5 text-center align-top">
          <p className="font-bold text-slate-700">{item.qty}</p>
          <p className="text-[10px] text-slate-400">{item.unit}</p>
        </td>
        <td className="px-3 py-2.5 align-top">
          <input
            type="number"
            min={0}
            step="any"
            required
            value={item.qtyTerima ?? ''}
            onChange={(e) => {
              const value = e.target.value;
              // Batch tunggal ikut menyesuaikan agar tidak perlu diisi dua kali.
              if (!item.batches || item.batches.length <= 1) {
                onChange({
                  qtyTerima: value,
                  batches: [{ ...batches[0], qty: value }],
                });
              } else {
                onChange({ qtyTerima: value });
              }
            }}
            className="w-24 rounded-lg border border-slate-200 px-2.5 py-1.5 text-center font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
          />
          {wms?.matched && factor !== 1 && qtyTerima > 0 && (
            <p className="mt-1 text-[10px] font-bold text-indigo-600">
              = {qtyBase.toLocaleString('id-ID')} {wms.unitBase}
            </p>
          )}
        </td>
        <td className="px-3 py-2.5 align-top">
          <input
            type="text"
            value={item.keterangan || ''}
            onChange={(e) => onChange({ keterangan: e.target.value })}
            placeholder="Keterangan (wajib jika kurang)"
            className="w-full min-w-[140px] rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </td>
      </tr>

      {wms?.trackExpiry && qtyTerima > 0 && (
        <tr className="bg-slate-50/60">
          <td />
          <td colSpan={5} className="px-3 pb-3 pt-0">
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Batch & Tanggal Expired
                </p>
                <button
                  type="button"
                  onClick={addBatch}
                  className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-800"
                >
                  <Plus className="w-3 h-3" /> Tambah Batch
                </button>
              </div>

              <div className="space-y-2">
                {batches.map((batch, batchIndex) => (
                  <div key={batchIndex} className="grid grid-cols-12 gap-2 items-center">
                    <input
                      type="text"
                      value={batch.batchNo || ''}
                      onChange={(e) => setBatch(batchIndex, { batchNo: e.target.value })}
                      placeholder="No. Batch (opsional)"
                      className="col-span-4 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs"
                    />
                    <input
                      type="date"
                      required
                      value={batch.expiredDate || ''}
                      onChange={(e) => setBatch(batchIndex, { expiredDate: e.target.value })}
                      className={`col-span-4 rounded-lg border px-2.5 py-1.5 text-xs ${
                        batch.expiredDate ? 'border-slate-200' : 'border-red-300 bg-red-50'
                      }`}
                    />
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={batch.qty ?? ''}
                      onChange={(e) => setBatch(batchIndex, { qty: e.target.value })}
                      placeholder="Qty"
                      className="col-span-3 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-center"
                    />
                    <button
                      type="button"
                      onClick={() => removeBatch(batchIndex)}
                      disabled={batches.length <= 1}
                      className="col-span-1 p-1.5 rounded-lg text-red-500 hover:bg-red-50 disabled:opacity-30"
                      title="Hapus batch"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {batchMismatch && (
                <p className="mt-2 flex items-center gap-1.5 text-[10px] font-bold text-red-600">
                  <AlertCircle className="w-3 h-3" />
                  Total qty batch ({batchTotal}) harus sama dengan Qty Terima ({qtyTerima}).
                </p>
              )}
              {missingExpiry && (
                <p className="mt-2 flex items-center gap-1.5 text-[10px] font-bold text-red-600">
                  <AlertCircle className="w-3 h-3" />
                  Tanggal expired wajib diisi untuk item ini.
                </p>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
