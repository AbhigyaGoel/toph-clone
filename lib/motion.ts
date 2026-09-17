import type { SpringOptions, Transition, Variants } from 'framer-motion';

/**
 * The dashboard's motion vocabulary.
 *
 * Every animated component pulls its timing from here rather than declaring its
 * own, so the page moves as one system: the row highlight, the filter chips and
 * the expanding panel all settle with the same weight. Springs are used for
 * anything that follows a pointer or changes layout, because a spring carries
 * momentum from wherever the element currently is — a duration-based tween
 * restarts from zero and reads as a stutter when the pointer moves quickly
 * between rows.
 */

/** Follows the pointer. Fast, barely any overshoot — it should feel attached. */
export const SPRING_SNAP: Transition = {
  type: 'spring',
  stiffness: 520,
  damping: 42,
  mass: 0.7,
};

/** Reflows: chips entering a row, the bulk bar arriving, the map growing. */
export const SPRING_SOFT: Transition = {
  type: 'spring',
  stiffness: 320,
  damping: 34,
  mass: 0.9,
};

/**
 * Opening and closing the expanded panel, which moves a lot of height.
 *
 * Settles inside ~400ms rather than the ~900ms it used to. An accordion is a
 * direct response to a click, and a spring slower than the gesture that caused
 * it reads as lag rather than as weight. It also keeps the whole travel inside
 * the 500ms window in which the browser attributes layout shift to user input —
 * not because the measurement was failing (it scores 0.000), but because a
 * motion that finishes inside its own input window cannot start failing it
 * later when the panel grows.
 */
export const SPRING_PANEL: Transition = {
  type: 'spring',
  stiffness: 520,
  damping: 40,
  mass: 0.75,
  restDelta: 0.5,
};

/** Fades and colour changes, where a spring would be noise. */
export const EASE_QUICK: Transition = { duration: 0.18, ease: [0.16, 1, 0.3, 1] };

/**
 * For `useSpring`, which takes spring options rather than a `Transition`.
 *
 * Used where one element chases another's measured position — the row highlight
 * travelling down the table, a popover staying attached to a chip that moves.
 * Same weight as `SPRING_SNAP`, kept separate because the two types do not
 * overlap: a `Transition` carries `type: 'spring'`, which `SpringOptions`
 * rejects.
 */
export const SPRING_FOLLOW: SpringOptions = { stiffness: 520, damping: 42, mass: 0.7 };

/** A menu growing from the chip that opened it. */
export const menuVariants: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: -6 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { ...SPRING_SOFT, staggerChildren: 0.018, delayChildren: 0.02 },
  },
  exit: { opacity: 0, scale: 0.97, y: -4, transition: { duration: 0.12 } },
};

/** One row inside an opening menu. */
export const menuItemVariants: Variants = {
  hidden: { opacity: 0, y: -4 },
  visible: { opacity: 1, y: 0, transition: EASE_QUICK },
  exit: { opacity: 0, transition: { duration: 0.08 } },
};

/**
 * A chip appearing in or leaving the toolbar.
 *
 * Opacity only, because this pair goes on the element that also carries
 * `layout`. Framer measures layout from bounding rects, so animating `scale` on
 * the same element makes it animate towards a box that is itself mid-transform —
 * which is what made the chip row shudder as filters were applied. The pop lives
 * on `chipPopVariants`, one level in, where nothing measures it.
 */
export const chipVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: EASE_QUICK },
  exit: { opacity: 0, transition: { duration: 0.12 } },
};

/** The scale half of a chip's entrance, for a child of the layout element. */
export const chipPopVariants: Variants = {
  hidden: { scale: 0.82 },
  visible: { scale: 1, transition: SPRING_SOFT },
  exit: { scale: 0.82, transition: { duration: 0.12 } },
};

/**
 * Shared `layoutId`s. Collected here because a typo in one of these fails
 * silently — the element cross-fades instead of travelling, which is easy to
 * miss and exactly the bug this work set out to fix.
 */
export const LAYOUT_ID = {
  /** The rail's hover wash. */
  navHighlight: 'nav-item-highlight',
} as const;
