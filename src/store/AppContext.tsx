import React from 'react';
import type { ApiFetch, AppUser, PoFormState, PurchaseOrder, PurchaseRequest, PrFormState, StockItem } from '../lib/types';

export type AppContextValue = {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  canSee: (menu: string) => boolean;
  user: AppUser;
  stats: any;
  statsLoading: boolean;
  fetchStats: () => unknown;
  prList: PurchaseRequest[];
  poList: PurchaseOrder[];
  stockMaster: StockItem[];
  adminData: { users: AppUser[]; stock: StockItem[] };
  settingsTab: string;
  setSettingsTab: (tab: string) => void;
  searchStatus: string;
  setSearchStatus: (value: string) => void;
  searchDivision: string;
  setSearchDivision: (value: string) => void;
  searchSupplierPR: string;
  setSearchSupplierPR: (value: string) => void;
  searchDivisionPO: string;
  setSearchDivisionPO: (value: string) => void;
  searchSupplierPO: string;
  setSearchSupplierPO: (value: string) => void;
  searchDivisionApproval: string;
  setSearchDivisionApproval: (value: string) => void;
  prForm: PrFormState;
  setPrForm: React.Dispatch<React.SetStateAction<PrFormState>>;
  poForm: PoFormState;
  setPoForm: React.Dispatch<React.SetStateAction<PoFormState>>;
  suppliers: string[];
  suppliersFromPR: string[];
  divisionsFromPR: string[];
  calculateAvg: (item: { b1?: string | number; b2?: string | number; b3?: string | number }) => number;
  calculateEstimasi: (item: { qty?: string | number; b1?: string | number; b2?: string | number; b3?: string | number }) => number;
  addItem: () => void;
  removeItem: (index: number) => void;
  updateItem: (index: number, field: string, value: string | number) => void;
  isLoading: boolean;
  apiFetch: ApiFetch;
  handleAddUser: () => void;
  handleEditUser: (user: AppUser) => void;
  handleDeleteUser: (id: number) => void;
  handleAddStock: () => void;
  handleEditStock: (stock: StockItem) => void;
  handleDeleteStock: (id: number) => void;
  handleDeletePR: (index: number) => void;
  handleEditPR: (pr: PurchaseRequest) => void;
  handleSubmitPR: (event: React.FormEvent) => void;
  handleSubmitPO: (event: React.FormEvent) => void;
  handleAction: (prId: string, action: 'APPROVE' | 'REJECT' | 'PENDING') => void;
  handleFinishPR: (prId: string) => void;
  openPRDetail: (pr: PurchaseRequest) => void;
  openPODetail: (po: PurchaseOrder) => void;
  openPOForm: (items: PurchaseRequest[]) => void;
};

export const AppContext = React.createContext<AppContextValue | null>(null);

export function useAppContext() {
  const ctx = React.useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used inside AppContext.Provider');
  return ctx;
}
