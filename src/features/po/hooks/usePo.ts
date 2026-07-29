import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppUser, PurchaseOrder } from '../../../lib/types';

export const poKeys = {
  all: ['po'] as const,
  list: ['po', 'list'] as const,
};

export function usePoData(apiFetch: (url: string, options?: any) => Promise<Response>, enabled: boolean) {
  const queryClient = useQueryClient();

  const poQuery = useQuery<PurchaseOrder[]>({
    queryKey: poKeys.list,
    enabled,
    staleTime: 20_000,
    queryFn: async () => {
      const res = await apiFetch('/api/po');
      if (!res.ok) throw new Error(`Failed to load POs (${res.status})`);
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const fetchPOs = () => queryClient.invalidateQueries({ queryKey: poKeys.list });

  return {
    poList: poQuery.data ?? [],
    poLoading: poQuery.isLoading || poQuery.isFetching,
    fetchPOs,
  };
}


const POWER_ROLES = ['ADMIN', 'PURCHASE', 'MANAJER', 'MANAGER', 'DIREKTUR', 'DIREKSI', 'DIR', 'MGR', 'KABAG', 'KADIV', 'PURCHASING'];

export function useVisiblePoGroups({
  poList,
  user,
  searchDivision = '',
  searchSupplier = '',
}: {
  poList: PurchaseOrder[];
  user: AppUser | null;
  searchDivision?: string;
  searchSupplier?: string;
}) {
  return useMemo(() => {
    const role = String(user?.role || '').trim().toUpperCase();
    const divCode = String(user?.divisionCode || user?.divCode || '').trim().toUpperCase();
    const userDiv = String(user?.division || '').toLowerCase().trim();
    const isPowerUser = POWER_ROLES.includes(role) || role.includes('MANAGER') || role.includes('MANAJER') || role.includes('DIREKTUR') || role.includes('DIREKSI') || divCode === 'MGR' || divCode === 'DIR';

    return Array.from(new Set((poList || []).map(p => p.poNo)))
      .map(poNo => (poList || []).find(p => p.poNo === poNo))
      .filter(Boolean)
      .filter(po => {
        const poDiv = String(po?.division || '').toLowerCase().trim();
        if (!isPowerUser && userDiv && poDiv !== userDiv && !poDiv.includes(userDiv) && !userDiv.includes(poDiv)) return false;
        const matchesDivision = searchDivision === '' || poDiv.includes(searchDivision.toLowerCase().trim());
        const matchesSupplier = searchSupplier === '' || String(po?.supplier || '').toLowerCase().trim().includes(searchSupplier.toLowerCase().trim());
        return matchesDivision && matchesSupplier;
      }) as PurchaseOrder[];
  }, [poList, user, searchDivision, searchSupplier]);
}
