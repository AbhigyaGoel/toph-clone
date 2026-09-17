'use client';

import { motion } from 'framer-motion';
import { useEffect, useState, type ReactNode } from 'react';

import { EASE_QUICK, SPRING_SOFT } from '@/lib/motion';

interface PageEntranceProps {
  readonly children: ReactNode;
  /** Position in the stagger: header, then the cards, then the panel. */
  readonly index: number;
  /** The log panel stretches to the viewport when a row is open. */
  readonly fill?: boolean;
}

/** Each band is offset by this much, so the page assembles top-down. */
const STEP_SECONDS = 0.06;

/**
 * Has anything in this tab finished its entrance yet?
 *
 * Module scope, so it survives the unmount of every component that reads it and
 * is false exactly once per tab — on the first paint after a cold load. Set
 * from an effect rather than during render so that every band of the *first*
 * page still reads `false` and animates together.
 */
let hasLoadedOnce = false;

/**
 * Settles one band of the page into place.
 *
 * A wrapper rather than motion props on each component: these are server
 * components, and the animation is a property of their arrival on the page, not
 * of what they are. `useReducedMotion` inside Framer's MotionConfig turns it off
 * for anyone who has asked for that.
 *
 * The stagger runs on a cold load and **not** on a navigation, which is a
 * correction rather than an optimisation. Its job was to make a page arriving
 * out of nothing feel composed rather than flashed. Since screens began
 * rendering a skeleton the instant you click, a navigation no longer arrives
 * out of nothing — the shape is already on screen, and re-assembling that same
 * shape band by band added roughly 750ms of watching furniture slide into
 * positions it was already occupying. Between screens the content simply
 * crossfades over the placeholder it replaces.
 */
export function PageEntrance({ children, index, fill = false }: PageEntranceProps) {
  const [cold] = useState(() => !hasLoadedOnce);

  useEffect(() => {
    hasLoadedOnce = true;
  }, []);

  return (
    <motion.div
      initial={cold ? { opacity: 0, y: 8 } : { opacity: 0 }}
      animate={cold ? { opacity: 1, y: 0 } : { opacity: 1 }}
      transition={cold ? { ...SPRING_SOFT, delay: index * STEP_SECONDS } : EASE_QUICK}
      className={`flex w-full flex-col self-stretch ${fill ? 'xl:min-h-0 xl:flex-1' : ''}`}
    >
      {children}
    </motion.div>
  );
}
