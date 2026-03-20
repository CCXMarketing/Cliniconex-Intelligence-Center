import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/services/api';

interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useApi<T>(
  endpoint: string,
  options?: RequestInit & { autoRefresh?: boolean },
): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const json = await apiFetch<T>(endpoint, options);
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [endpoint, options?.method, options?.body]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 30s when tab is visible
  useEffect(() => {
    const autoRefresh = options?.autoRefresh !== false;
    if (!autoRefresh) return;

    const start = () => {
      intervalRef.current = setInterval(() => {
        if (document.visibilityState === 'visible') {
          fetchData();
        }
      }, 30_000);
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchData();
        if (!intervalRef.current) start();
      } else if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    start();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [fetchData, options?.autoRefresh]);

  return { data, loading, error, refetch: fetchData };
}

/** Imperative fetch for POST actions (not auto-refreshing) */
export async function apiPost<T>(endpoint: string, body?: unknown): Promise<T> {
  return apiFetch<T>(endpoint, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
}
