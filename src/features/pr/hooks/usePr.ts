import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppUser, PurchaseRequest, StockItem } from '../../../lib/types';

export const prKeys = {
  all: ['pr'] as const,
  list: ['pr', 'list'] as const,
  stock: ['pr', 'stock'] as const,
};

export function usePrData(apiFetch: (url: string, options?: any) => Promise<Response>, enabled: boolean) {
  const queryClient = useQueryClient();

  const prQuery = useQuery<PurchaseRequest[]>({
    queryKey: prKeys.list,
    enabled,
    staleTime: 20_000,
    queryFn: async () => {
      const res = await apiFetch('/api/pr');
      if (!res.ok) throw new Error(`Failed to load PRs (${res.status})`);
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const stockQuery = useQuery<StockItem[]>({
    queryKey: prKeys.stock,
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await apiFetch('/api/stock');
      if (!res.ok) throw new Error(`Failed to load stock (${res.status})`);
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const fetchPRs = () => queryClient.invalidateQueries({ queryKey: prKeys.list });
  const fetchStock = () => queryClient.invalidateQueries({ queryKey: prKeys.stock });

  return {
    prList: prQuery.data ?? [],
    stockMaster: stockQuery.data ?? [],
    prLoading: prQuery.isLoading || prQuery.isFetching,
    stockLoading: stockQuery.isLoading || stockQuery.isFetching,
    fetchPRs,
    fetchStock,
  };
}


const POWER_ROLES = ['ADMIN', 'PURCHASE', 'MANAJER', 'MANAGER', 'DIREKTUR', 'DIREKSI', 'DIR', 'MGR', 'KABAG', 'KADIV', 'PURCHASING'];

export function useVisiblePrs({
  prList,
  user,
  canSee,
  searchStatus = '',
  searchDivision = '',
  searchSupplier = '',
}: {
  prList: PurchaseRequest[];
  user: AppUser | null;
  canSee: (menu: string) => boolean;
  searchStatus?: string;
  searchDivision?: string;
  searchSupplier?: string;
}) {
  return useMemo(() => {
    const role = String(user?.role || '').trim().toUpperCase();
    const divCode = String(user?.divisionCode || user?.divCode || '').trim().toUpperCase();
    const userDiv = String(user?.division || '').toLowerCase().trim();
    const isPowerUser = POWER_ROLES.includes(role) || role.includes('MANAGER') || role.includes('MANAJER') || role.includes('DIREKTUR') || role.includes('DIREKSI') || canSee('APPROVAL') || divCode === 'MGR' || divCode === 'DIR';

    const unique = Array.from(new Set((prList || []).map(p => p.id)))
      .map(id => (prList || []).find(p => p.id === id))
      .filter(Boolean) as PurchaseRequest[];

    return unique.filter(pr => {
      const prDiv = String(pr.division || '').toLowerCase().trim();
      if (!isPowerUser && userDiv && prDiv !== userDiv && !prDiv.includes(userDiv) && !userDiv.includes(prDiv)) return false;

      const matchesStatus = searchStatus === '' || String(pr.status || '').trim().toUpperCase() === searchStatus.toUpperCase().trim();
      const matchesDivision = searchDivision === '' || prDiv.includes(searchDivision.toLowerCase().trim());
      const matchesSupplier = searchSupplier === '' || String(pr.supplier || '').toLowerCase().trim().includes(searchSupplier.toLowerCase().trim());
      return matchesStatus && matchesDivision && matchesSupplier;
    });
  }, [prList, user, canSee, searchStatus, searchDivision, searchSupplier]);
}
