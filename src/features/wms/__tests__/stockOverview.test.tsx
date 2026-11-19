import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import StockOverview from '../StockOverview';

/**
 * Memastikan halaman Stok Gudang benar-benar menampilkan hal yang dijanjikan:
 * angka satuan dasar, rincian bertingkat, dan panggilan ke endpoint yang tepat.
 */

const rows = [
  {
    itemId: 'ITM-004945',
    itemName: 'A591-K',
    category: 'MAKANAN KUCING',
    iposCode: 'A591-K',
    unitBase: 'PCS',
    trackExpiry: true,
    warehouseId: 'WH-NAG',
    warehouseName: 'Gudang Nagoya',
    qtyBase: 260,
    breakdown: [
      { unit: 'BAL', qty: 1 },
      { unit: 'DUS', qty: 1 },
    ],
    display: '1 BAL + 1 DUS / 260 PCS',
    minStock: 100,
    maxStock: 5000,
    status: 'OK',
    lastTrxDate: '2027-01-10',
  },
  {
    itemId: 'ITM-004916',
    itemName: '511 BRAVO (25 KG)',
    category: 'MAKANAN ANJING',
    iposCode: '',
    unitBase: 'KG',
    trackExpiry: false,
    warehouseId: 'WH-PON',
    warehouseName: 'Gudang Poncol',
    qtyBase: 5,
    breakdown: [{ unit: 'KG', qty: 5 }],
    display: '5 KG',
    minStock: 50,
    maxStock: 0,
    status: 'LOW',
    lastTrxDate: '2027-01-08',
  },
];

const summary = {
  rows: 2,
  items: 2,
  warehouses: 2,
  totalQtyBase: 265,
  lowCount: 1,
  emptyCount: 0,
};

function makeApiFetch() {
  return vi.fn(async (url: string) => {
    if (url.startsWith('/api/wms/warehouses')) {
      return { ok: true, json: async () => [{ warehouseId: 'WH-NAG', warehouseName: 'Gudang Nagoya' }] } as any;
    }
    return {
      ok: true,
      json: async () => ({
        success: true,
        summary,
        filteredSummary: summary,
        total: rows.length,
        limit: 100,
        offset: 0,
        rows,
      }),
    } as any;
  });
}

describe('StockOverview', () => {
  it('memuat saldo dari /api/wms/stock', async () => {
    const apiFetch = makeApiFetch();
    render(<StockOverview apiFetch={apiFetch as any} />);
    await waitFor(() => {
      expect(apiFetch.mock.calls.some((c) => String(c[0]).startsWith('/api/wms/stock?'))).toBe(true);
    });
  });

  it('menampilkan nama barang dan gudang', async () => {
    render(<StockOverview apiFetch={makeApiFetch() as any} />);
    expect(await screen.findByText('A591-K')).toBeTruthy();
    // Nama gudang muncul dua kali: di dropdown filter dan di baris tabel.
    expect((await screen.findAllByText('Gudang Nagoya')).length).toBeGreaterThan(1);
  });

  it('menampilkan angka satuan dasar sebagai angka utama', async () => {
    render(<StockOverview apiFetch={makeApiFetch() as any} />);
    expect(await screen.findByText('260 PCS')).toBeTruthy();
  });

  it('menampilkan rincian bertingkat', async () => {
    render(<StockOverview apiFetch={makeApiFetch() as any} />);
    expect(await screen.findByText('1 BAL + 1 DUS / 260 PCS')).toBeTruthy();
  });

  it('memberi label status di bawah minimum', async () => {
    render(<StockOverview apiFetch={makeApiFetch() as any} />);
    expect(await screen.findByText('Di bawah min.')).toBeTruthy();
  });

  it('menampilkan pesan kosong bila tidak ada data', async () => {
    const empty = { rows: 0, items: 0, warehouses: 0, totalQtyBase: 0, lowCount: 0, emptyCount: 0 };
    const apiFetch = vi.fn(async (url: string) => {
      if (url.startsWith('/api/wms/warehouses')) return { ok: true, json: async () => [] } as any;
      return {
        ok: true,
        json: async () => ({
          success: true,
          summary: empty,
          filteredSummary: empty,
          total: 0,
          limit: 100,
          offset: 0,
          rows: [],
        }),
      } as any;
    });
    render(<StockOverview apiFetch={apiFetch as any} />);
    expect(await screen.findByText(/Belum ada stok tercatat/i)).toBeTruthy();
  });
});
