'use client';

import { useContext } from 'react';

import { LogQueryContext, type LogQueryContextValue } from '@/components/dashboard/LogQueryProvider';

/**
 * Reads the log query and writes changes back to the URL.
 *
 * `replace` rather than `push` so that typing in the search box or toggling a
 * chip does not bury the user under history entries. The optimistic value and
 * the pending flag come from `LogQueryProvider`, so every consumer sees the
 * same in-flight state.
 */
export function useLogQueryNavigation(): LogQueryContextValue {
  const context = useContext(LogQueryContext);

  if (!context) {
    throw new Error('useLogQueryNavigation must be used inside a LogQueryProvider.');
  }

  return context;
}
