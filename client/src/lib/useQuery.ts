import { useCallback, useEffect, useRef, useState } from 'react';
import { bus } from './bus';

export interface QueryState<T> {
  data: T | null;
  error: unknown;
  loading: boolean;
  refetch: () => Promise<void>;
  setData: (updater: T | ((prev: T | null) => T | null)) => void;
}

/** Minimal data hook: refetches when deps change or when `bus.emit('refresh')` fires. */
export function useQuery<T>(fn: () => Promise<T>, deps: unknown[] = [], opts: { enabled?: boolean; refreshOn?: string[] } = {}): QueryState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const enabled = opts.enabled ?? true;

  const refetch = useCallback(async () => {
    if (!enabled) return;
    try {
      const d = await fnRef.current();
      setData(d);
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    setLoading(true);
    void refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled]);

  useEffect(() => {
    const topics = ['refresh', ...(opts.refreshOn ?? [])];
    const offs = topics.map((t) => bus.on(t, () => void refetch()));
    return () => offs.forEach((off) => off());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refetch, (opts.refreshOn ?? []).join('|')]);

  return { data, error, loading, refetch, setData: (u) => setData((prev) => (typeof u === 'function' ? (u as (p: T | null) => T | null)(prev) : u)) };
}
