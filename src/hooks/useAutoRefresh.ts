import { useCallback, useEffect, useRef, useState } from 'react';
import { getUserFriendlyError } from '../utils/networkErrors';

interface UseAutoRefreshResult<T> {
  isRefreshing: boolean;
  lastUpdated: Date | null;
  error: string | null;
  refresh: (showSpinner?: boolean) => Promise<void>;
  statusText: string;
}

function formatLastUpdated(date: Date) {
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function useAutoRefresh<T>(
  callback: () => Promise<T>,
  deps: readonly unknown[] = [],
  intervalMs = 8000,
  enabled = true,
): UseAutoRefreshResult<T> {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasAutoLoaded = useRef(false);

  const refresh = useCallback(async (showSpinner = true) => {
    if (!enabled) return;

    if (isRunningRef.current) return;
    isRunningRef.current = true;

    if (showSpinner) setIsRefreshing(true);
    try {
      await callback();
      setLastUpdated(new Date());
      setError(null);
    } catch (err: any) {
      const message = err?.message || 'Unable to refresh data';
      const friendly = getUserFriendlyError(message);
      setError(friendly || null);
    } finally {
      isRunningRef.current = false;
      if (showSpinner) setIsRefreshing(false);
    }
  }, [callback, enabled]);

  const isRunningRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      hasAutoLoaded.current = false;
      return;
    }

    if (!hasAutoLoaded.current) {
      hasAutoLoaded.current = true;
      void refresh(false);
    }

    const interval = setInterval(() => {
      void refresh(false);
    }, intervalMs);

    return () => {
      clearInterval(interval);
    };
  }, [enabled, intervalMs, refresh, ...deps]);

  const statusText = error
    ? `Refresh issue: ${error}`
    : isRefreshing
      ? 'Refreshing…'
      : lastUpdated
        ? `Last refreshed ${formatLastUpdated(lastUpdated)}`
        : 'Pull down to refresh';

  return { isRefreshing, lastUpdated, error, refresh, statusText };
}
