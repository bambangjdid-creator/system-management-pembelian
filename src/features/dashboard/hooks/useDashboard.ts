import { useQuery, useQueryClient } from '@tanstack/react-query';

export const dashboardKeys = {
  stats: ['dashboard', 'stats'] as const,
};

export function useDashboard(apiFetch: (url: string, options?: any) => Promise<Response>, enabled: boolean) {
  const queryClient = useQueryClient();

  const statsQuery = useQuery({
    queryKey: dashboardKeys.stats,
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await apiFetch('/api/stats');
      if (!res.ok) throw new Error(`Failed to load stats (${res.status})`);
      return res.json();
    },
  });

  const fetchStats = () => queryClient.invalidateQueries({ queryKey: dashboardKeys.stats });

  return {
    stats: statsQuery.data ?? null,
    statsLoading: statsQuery.isLoading || statsQuery.isFetching,
    fetchStats,
  };
}
