'use client';

import { useEffect } from 'react';

interface ScrollToOpenLogProps {
  /** The first log id the URL asks to be open, or null. */
  readonly logId: string | null;
}

/**
 * Already scrolled for, so a remount does not yank the page again.
 *
 * Module scope rather than component state because the thing being guarded
 * against *is* the remount: the table re-mounts several times while the route
 * settles, and per-instance state resets with it.
 */
let handled: string | null = null;

/**
 * Brings a deep-linked row into view.
 *
 * Arriving from the Audit Manager, the map or the exceptions queue lands on
 * `/?open=<id>`. The row genuinely opens — but on an all-time list it can be a
 * thousand pixels down, so the screen looks exactly like the plain dashboard
 * and the link reads as "it just took me to the dashboard". Which is precisely
 * what it was reported as.
 *
 * This lives outside the table on purpose. The first attempt put the scroll in
 * `LogsTable`, keyed on its row registry — and that component mounts four times
 * while the route settles, so every effect's cleanup cancelled the scroll
 * before its frame could fire. Polling the DOM for a data attribute does not
 * care how many times anything mounts.
 */
export function ScrollToOpenLog({ logId }: ScrollToOpenLogProps) {
  useEffect(() => {
    if (!logId || handled === logId) return;

    let frame = 0;
    let tries = 0;

    const find = () => {
      const row = document.querySelector<HTMLElement>(`[data-log-row="${logId}"]`);

      if (row) {
        handled = logId;
        // `start`, not `center`: the row is the lid of a tall panel, and
        // centring the lid leaves most of the panel below the fold — which
        // would be the same complaint again, one scroll further down.
        row.scrollIntoView({ block: 'start', behavior: 'smooth' });
        return;
      }

      // ~2s of frames. A row that never appears is one this view filters out,
      // and scrolling to nothing is the right outcome.
      if (tries < 120) {
        tries += 1;
        frame = requestAnimationFrame(find);
      }
    };

    frame = requestAnimationFrame(find);
    return () => cancelAnimationFrame(frame);
  }, [logId]);

  return null;
}
