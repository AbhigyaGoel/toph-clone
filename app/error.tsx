'use client';

import { useEffect } from 'react';

interface DashboardErrorProps {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}

/**
 * Shown when a repository throws — a missing environment variable, an
 * unreachable database, a row that fails validation. The detail goes to the
 * server log; the viewer gets a plain explanation and a retry.
 */
export default function DashboardError({ error, reset }: DashboardErrorProps) {
  useEffect(() => {
    console.error('Dashboard failed to load', error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-white p-[30px]">
      <div className="flex w-full max-w-[420px] flex-col items-start gap-[20px] rounded-[14px] p-[20px] shadow-card">
        <div className="flex flex-col gap-[4px]">
          <h1 className="text-[20px] font-semibold leading-[1.3] text-black">
            The dashboard could not load
          </h1>
          <p className="text-[16px] font-normal leading-[1.3] text-[#4D4D4D]">
            We could not reach the log database. Check your connection and try again.
          </p>
        </div>
        <button
          type="button"
          onClick={reset}
          className="flex items-center justify-center gap-[10px] rounded-[80px] bg-black px-[16px] py-[8px] text-[14px] font-normal leading-[1.3] text-white shadow-chip"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
