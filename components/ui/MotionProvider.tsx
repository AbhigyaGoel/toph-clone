'use client';

import { MotionConfig } from 'framer-motion';
import type { ReactNode } from 'react';

/**
 * Applies one motion policy to the whole page.
 *
 * `reducedMotion="user"` makes Framer honour the operating system's
 * "reduce motion" setting everywhere at once: transforms and layout animations
 * are dropped, opacity changes are kept. Setting it here rather than checking
 * the preference in each component means a new animated component cannot forget
 * to — which, for a dashboard that now moves this much, is the difference
 * between an accessible page and a hostile one.
 */
export function MotionProvider({ children }: { readonly children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
