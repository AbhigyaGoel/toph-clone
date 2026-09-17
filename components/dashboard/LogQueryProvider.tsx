'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from 'react';

import { parseLogQuery, toSearchString, type LogQuery, type StatedKey } from '@/lib/logQuery';

export interface LogQueryContextValue {
  /** What the toolbar should draw — the optimistic value while one is in flight. */
  readonly query: LogQuery;
  /** True while the server is re-running the query behind an optimistic change. */
  readonly isPending: boolean;
  readonly replace: (next: LogQuery) => void;
}

export const LogQueryContext = createContext<LogQueryContextValue | null>(null);

interface LogQueryProviderProps {
  readonly children: ReactNode;
  /**
   * Query keys this screen writes even at their default value.
   *
   * Only screens whose defaults differ from the model's need this — see
   * `StatedKey`. Without it the Activity Logs archive could not select "This
   * Month" at all.
   */
  readonly always?: readonly StatedKey[];
}

/**
 * Holds the log query for everything that reads or writes it.
 *
 * The URL stays the source of truth — that is what makes a refresh and a shared
 * link reproduce the view — but a round trip to the server sits between
 * clicking a chip and seeing it change, and at that latency the chip feels
 * broken. So a change is applied to local state immediately and the navigation
 * runs inside a transition; when the new URL arrives the local copy is dropped
 * and the URL takes over again. `isPending` is what the table uses to show the
 * rows are being re-queried rather than freezing.
 *
 * One provider rather than a hook per component: the search box, the chips and
 * the table all have to agree about the optimistic value, and separate
 * `useState` calls would each hold their own.
 */
export function LogQueryProvider({ children, always = [] }: LogQueryProviderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState<LogQuery | null>(null);

  const search = searchParams.toString();
  const urlQuery = useMemo(() => parseLogQuery(searchParams), [searchParams]);

  // Once the URL catches up, stop overriding it. Keyed on the serialised params
  // because `urlQuery` is a fresh object on every render.
  useEffect(() => {
    setOptimistic(null);
  }, [search]);

  const replace = useCallback(
    (next: LogQuery) => {
      setOptimistic(next);
      startTransition(() => {
        router.replace(`${pathname}${toSearchString(next, always)}`, { scroll: false });
      });
    },
    [router, pathname, always]
  );

  const value = useMemo<LogQueryContextValue>(
    () => ({ query: optimistic ?? urlQuery, isPending, replace }),
    [optimistic, urlQuery, isPending, replace]
  );

  return <LogQueryContext.Provider value={value}>{children}</LogQueryContext.Provider>;
}
