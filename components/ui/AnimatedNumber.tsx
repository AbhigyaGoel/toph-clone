'use client';

import { useMotionValueEvent, useReducedMotion, useSpring } from 'framer-motion';
import { useEffect, useState } from 'react';

interface AnimatedNumberProps {
  readonly value: number;
  /** Where the first render counts up from. Cards start at 0; chips do not. */
  readonly from?: number;
  readonly className?: string;
}

/** Matches SPRING_SOFT, restated because `useSpring` takes the options directly. */
const SPRING = { stiffness: 320, damping: 34, mass: 0.9 } as const;

/**
 * A number that travels to its new value instead of cutting to it.
 *
 * The stat cards, the range chip's count and the rail badge are all derived
 * from the rows, so they change whenever a filter changes or a log is marked
 * reviewed. Animating the transition is what connects cause to effect —
 * marking four logs reviewed and watching the "New" count fall is the whole
 * point of the write.
 *
 * Rendered from state rather than by writing to the DOM node directly, so the
 * value is server-rendered and readable before hydration.
 */
export function AnimatedNumber({ value, from = value, className }: AnimatedNumberProps) {
  const reduceMotion = useReducedMotion();
  const spring = useSpring(from, SPRING);
  const [display, setDisplay] = useState(from);

  useEffect(() => {
    if (reduceMotion) {
      setDisplay(value);
      spring.jump(value);
      return;
    }

    spring.set(value);
  }, [value, spring, reduceMotion]);

  useMotionValueEvent(spring, 'change', (latest) => {
    if (!reduceMotion) setDisplay(Math.round(latest));
  });

  return <span className={className}>{display}</span>;
}
