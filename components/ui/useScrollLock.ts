'use client';

import { useEffect } from 'react';

/**
 * Locks page scrolling while an overlay is open.
 *
 * Reference counted on purpose. Each overlay used to save `body.style.overflow`
 * on open and restore it on close, which is correct alone and wrong together:
 * open the manage dialog, open a second overlay from inside it, and the second
 * one captures the *already locked* value. When it closes it restores
 * `hidden` — permanently. The page then looks fine and is completely inert,
 * which is exactly the "suddenly can't click or scroll anything" failure.
 *
 * With a counter, only the first lock records the original value and only the
 * last release restores it.
 */

let locks = 0;
let original: string | null = null;

export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return undefined;

    if (locks === 0) {
      original = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    locks += 1;

    return () => {
      locks -= 1;
      if (locks === 0) {
        document.body.style.overflow = original ?? '';
        original = null;
      }
    };
  }, [active]);
}
