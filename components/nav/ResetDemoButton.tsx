'use client';

import { useState, useTransition } from 'react';

import { resetDemo } from '@/app/actions/demo';
import { Icon } from '@/components/ui/Icon';
import { attempt } from '@/lib/attempt';

/**
 * Puts the data back, from the one screen where that is not destructive.
 *
 * On the sign-in screen rather than inside the app, because it is the only
 * place where nobody is in the middle of anything — a reset button next to a
 * log somebody is correcting is a trap.
 *
 * It exists because the persistence is real. Everything written here survives a
 * refresh, a redeploy and the next person to open the link, which is the whole
 * point of having a database behind this and also means the interesting states
 * get used up: once the missing product has been corrected and the inbox
 * cleared, the screens built to surface problems have nothing to surface. This
 * rewinds the handful of rows the walkthrough touches.
 */
export function ResetDemoButton() {
  const [done, setDone] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const run = () => {
    setDone(null);
    setFailed(null);

    start(async () => {
      const result = await attempt(() => resetDemo());
      if (!result.success) {
        setFailed(result.error);
        return;
      }
      setDone(`Baseline restored — ${result.data.unread} logs waiting in the inbox again.`);
    });
  };

  return (
    <div className="flex flex-col items-center gap-[8px]">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="flex items-center gap-[7px] rounded-[80px] bg-white px-[14px] py-[8px] text-[13px] font-normal leading-[1.3] text-[#4D4D4D] shadow-chip outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-black/30 disabled:opacity-60"
      >
        <Icon name="arrow-right-left" size={12} />
        {busy ? 'Resetting…' : 'Reset app to baseline'}
      </button>

      <p className="max-w-[360px] text-center text-[12px] font-normal leading-[1.5] text-black opacity-40">
        This app stores everything in a real database, so corrections and reviews
        persist — including anybody else&rsquo;s. Resetting restores the seeded
        farm: the spray log with its product missing, the over-applied rate on
        Field K, and six unread logs in the inbox.
      </p>

      {done ? (
        <span className="text-[12px] font-normal leading-[1.4] text-[#146C44]">{done}</span>
      ) : null}
      {failed ? (
        <span className="text-[12px] font-normal leading-[1.4] text-[#B00020]">{failed}</span>
      ) : null}
    </div>
  );
}
