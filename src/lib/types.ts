export type Role = 'USER' | 'Manager' | 'Direktur' | 'Purchase' | 'ADMIN' | string;

export interface AppUser {
  username: string;
  displayName?: string;
  fullName?: string;
  division?: string;
  divisionCode?: string;
  divCode?: string;
  wa?: string;
  role?: Role;
  access?: string;
  hasPassword?: boolean;
}

export interface StockItem {
  id?: number;
  name: string;
  category?: string;
  supplier?: string;
  unit?: string;
  price?: number | string;
}

export interface PrItemForm {
  itemName: string;
  unit: string;
  qty: string | number;
  stockOnhand: string | number;
  b1: string | number;
  b2: string | number;
  b3: string | number;
  avgSales?: number;
}

export interface PrFormState {
  supplier: string;
  notes: string;
  items: PrItemForm[];
}

export interface PoItemForm {
  itemName: string;
  unit: string;
  qty: string | number;
  price: string | number;
}

export interface PoFormState {
  prId: string;
  purchaseName?: string;
  deliveryDate: string;
  supplier: string;
  items: PoItemForm[];
  notes: string;
  discount: number;
  discountPercent: number;
  tax: number;
  taxPercent: number;
  others: number;
  division: string;
}

export type ApiFetch = (url: string, options?: any) => Promise<Response>;

export interface PurchaseRequest {
  rowIndex?: number;
  id: string;
  date?: string;
  requester?: string;
  division?: string;
  supplier?: string;
  itemName?: string;
  unit?: string;
  qty?: string | number;
  stockOnhand?: string | number;
  avgSales?: string | number;
  notes?: string;
  status?: string;
  mgrApp?: string;
  dirApp?: string;
  pdfLink?: string;
  poNumber?: string;
  b1?: string | number;
  b2?: string | number;
  b3?: string | number;
}

export interface PurchaseOrder {
  rowIndex?: number;
  prId: string;
  purchaseName?: string;
  poNo: string;
  date?: string;
  deliveryDate?: string;
  supplier?: string;
  itemName?: string;
  unit?: string;
  qty?: string | number;
  price?: string | number;
  total?: string | number;
  notes?: string;
  pdfLink?: string;
  status?: string;
  division?: string;
  discount?: string | number;
  tax?: string | number;
  others?: string | number;
  grandTotal?: string | number;
  discountPercent?: string | number;
  taxPercent?: string | number;
}

export const WAREHOUSE_ADDRESS_INFO: Record<string, { name: string; address: string }> = {
  'GD PONCOL': {
    name: 'GUDANG PONCOL',
    address: 'JL. RAYA PONCOL NO.17 RT/RW 003/07 KEL. CIRACAS KEC. CIRACAS, KOTA JAKARTA TIMUR, DKI JAKARTA - 13750'
  },
  'GD CIRACAS': {
    name: 'GUDANG CIRACAS',
    address: 'JL. RAYA BOGOR KM 26 NO.2 RT/RW 005/01 KEL. CIRACAS KEC. CIRACAS KOTA JAKARTA TIMUR, DKI JAKARTA - 13750'
  },
  'GD NAGOYA': {
    name: 'GUDANG NAGOYA',
    address: 'JL. SWADAYA V NO. 50 RT/RW. 002/05 KEC. CILANGKAP KEL. CIPAYUNG KOTA JAKARTA TIMUR, DKI JAKARTA - 13870'
  }
};
