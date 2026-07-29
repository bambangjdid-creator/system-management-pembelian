import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppUser, StockItem } from '../../../lib/types';
import { isAdmin } from '../../../lib/permissions';

export const adminKeys = {
  all: ['admin'] as const,
  users: ['admin', 'users'] as const,
  stock: ['admin', 'stock'] as const,
};

export type AdminData = {
  users: AppUser[];
  stock: StockItem[];
};

export function useAdmin(apiFetch: (url: string, options?: any) => Promise<Response>, user: AppUser | null) {
  const queryClient = useQueryClient();
  const enabled = isAdmin(user);

  const usersQuery = useQuery<AppUser[]>({
    queryKey: adminKeys.users,
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await apiFetch('/api/admin/users');
      if (!res.ok) throw new Error(`Failed to load users (${res.status})`);
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const stockQuery = useQuery<StockItem[]>({
    queryKey: adminKeys.stock,
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await apiFetch('/api/admin/stock');
      if (!res.ok) throw new Error(`Failed to load admin stock (${res.status})`);
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const fetchAdminData = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: adminKeys.users }),
    queryClient.invalidateQueries({ queryKey: adminKeys.stock }),
  ]);

  return {
    adminData: {
      users: usersQuery.data ?? [],
      stock: stockQuery.data ?? [],
    },
    adminLoading: usersQuery.isLoading || usersQuery.isFetching || stockQuery.isLoading || stockQuery.isFetching,
    fetchAdminData,
  };
}
