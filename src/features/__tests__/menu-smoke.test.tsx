import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppContext, type AppContextValue } from '../../store/AppContext';
import Dashboard from '../dashboard/Dashboard';
import PrList from '../pr/PrList';
import PoList from '../po/PoList';
import PurchaseQueue from '../po/PurchaseQueue';
import ApprovalsView from '../pr/approvals/ApprovalsView';

vi.mock('react-chartjs-2', () => ({
  Chart: () => <div data-testid="mock-chart" />,
}));

const pr = {
  rowIndex: 2,
  id: 'PR0001/ADMIN/VI/2026',
  date: '2026-06-20',
  requester: 'Administrator',
  division: 'ADMIN',
  supplier: 'PT SUPPLIER CONTOH',
  itemName: 'KARDUS A',
  unit: 'PCS',
  qty: 10,
  stockOnhand: 5,
  avgSales: 3,
  notes: 'test note',
  status: 'WAITING MANAGER APPROVAL',
  mgrApp: '',
  dirApp: '',
  pdfLink: '/api/pdf/pr/PR0001.pdf',
  poNumber: '',
  b1: 1,
  b2: 2,
  b3: 3,
};

const po = {
  rowIndex: 2,
  prId: pr.id,
  purchaseName: 'Administrator',
  poNo: 'PO/SAU/06/2026/0001',
  date: '2026-06-20',
  deliveryDate: '2026-06-25',
  supplier: pr.supplier,
  itemName: pr.itemName,
  unit: pr.unit,
  qty: 10,
  price: 10000,
  total: 100000,
  notes: 'po note',
  pdfLink: '/api/pdf/po/PO0001.pdf',
  status: 'WAITING RECEIVE',
  division: 'ADMIN',
  grandTotal: 100000,
};

function makeCtx(activeTab: string, overrides: Partial<AppContextValue> = {}): AppContextValue {
  return {
    activeTab,
    setActiveTab: vi.fn(),
    canSee: vi.fn(() => true),
    user: {
      username: 'ADMIN',
      displayName: 'Administrator',
      fullName: 'Administrator',
      division: 'ADMIN',
      divisionCode: 'ADMIN',
      divCode: 'ADMIN',
      role: 'ADMIN',
      access: 'DASHBOARD, CREATE PR, PR HISTORY, PO HISTORY, PURCHASE, APPROVAL',
    },
    stats: {
      totalPR: 1,
      waitingManager: 1,
      waitingDirector: 0,
      waitingPO: 0,
      waitingReceive: 0,
      finish: 0,
      chartData: { labels: ['Jun'], datasets: [] },
      topItems: [{ name: 'KARDUS A', count: 1, totalQty: 10 }],
      topSuppliers: [{ name: 'PT SUPPLIER CONTOH', count: 1, totalQty: 10 }],
      topDivisions: [{ name: 'ADMIN', count: 1, totalQty: 10 }],
    },
    statsLoading: false,
    fetchStats: vi.fn(),
    prList: [pr],
    poList: [po],
    stockMaster: [],
    adminData: { users: [], stock: [] },
    settingsTab: 'users',
    setSettingsTab: vi.fn(),
    searchStatus: '',
    setSearchStatus: vi.fn(),
    searchDivision: '',
    setSearchDivision: vi.fn(),
    searchSupplierPR: '',
    setSearchSupplierPR: vi.fn(),
    searchDivisionPO: '',
    setSearchDivisionPO: vi.fn(),
    searchSupplierPO: '',
    setSearchSupplierPO: vi.fn(),
    searchDivisionApproval: '',
    setSearchDivisionApproval: vi.fn(),
    prForm: { supplier: '', notes: '', items: [] },
    setPrForm: vi.fn(),
    poForm: {
      prId: '',
      deliveryDate: '',
      supplier: '',
      items: [],
      notes: '',
      discount: 0,
      discountPercent: 0,
      tax: 0,
      taxPercent: 0,
      others: 0,
      division: 'ADMIN',
    },
    setPoForm: vi.fn(),
    suppliers: [],
    suppliersFromPR: [pr.supplier],
    divisionsFromPR: ['ADMIN'],
    calculateAvg: vi.fn(() => 2),
    calculateEstimasi: vi.fn(() => 30),
    addItem: vi.fn(),
    removeItem: vi.fn(),
    updateItem: vi.fn(),
    isLoading: false,
    apiFetch: vi.fn(),
    handleAddUser: vi.fn(),
    handleEditUser: vi.fn(),
    handleDeleteUser: vi.fn(),
    handleAddStock: vi.fn(),
    handleEditStock: vi.fn(),
    handleDeleteStock: vi.fn(),
    handleDeletePR: vi.fn(),
    handleEditPR: vi.fn(),
    handleSubmitPR: vi.fn(),
    handleSubmitPO: vi.fn(),
    handleAction: vi.fn(),
    handleFinishPR: vi.fn(),
    openPRDetail: vi.fn(),
    openPODetail: vi.fn(),
    openPOForm: vi.fn(),
    ...overrides,
  } as AppContextValue;
}

function renderWithCtx(ui: React.ReactElement, activeTab: string, overrides?: Partial<AppContextValue>) {
  return render(<AppContext.Provider value={makeCtx(activeTab, overrides)}>{ui}</AppContext.Provider>);
}

describe('menu smoke tests', () => {
  it('renders dashboard metrics and chart area', () => {
    renderWithCtx(<Dashboard />, 'dashboard');
    expect(screen.getByText('Total PR')).toBeInTheDocument();
    expect(screen.getByText('Monthly Procurement Volume')).toBeInTheDocument();
    expect(screen.getByTestId('mock-chart')).toBeInTheDocument();
  });

  it('renders PR History with normalized PR rows', () => {
    renderWithCtx(<PrList />, 'history');
    expect(screen.getByText('PR History Log')).toBeInTheDocument();
    expect(screen.getByText(pr.id)).toBeInTheDocument();
    expect(screen.getByText('Administrator')).toBeInTheDocument();
  });

  it('renders PO History with normalized PO rows', () => {
    renderWithCtx(<PoList />, 'po-history');
    expect(screen.getByText('PO History Log')).toBeInTheDocument();
    expect(screen.getByText(po.poNo)).toBeInTheDocument();
    expect(screen.getByText(po.prId)).toBeInTheDocument();
  });

  it('renders Purchase Queue for PRs waiting PO creation', () => {
    renderWithCtx(<PurchaseQueue />, 'purchase-queue', {
      prList: [{ ...pr, status: 'WAITING CREATED PO' }],
    });
    expect(screen.getByText('PR NUMBER')).toBeInTheDocument();
    expect(screen.getByText('Process PO')).toBeInTheDocument();
  });

  it('renders Approvals for pending PRs', () => {
    renderWithCtx(<ApprovalsView />, 'approvals');
    expect(screen.getByText(pr.id)).toBeInTheDocument();
    expect(screen.getByText(/Requested by Administrator/)).toBeInTheDocument();
    expect(screen.getByText('WAITING MANAGER APPROVAL')).toBeInTheDocument();
  });
});
