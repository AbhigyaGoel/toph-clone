'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { Icon } from '@/components/ui/Icon';
import { EASE_QUICK, SPRING_PANEL, SPRING_SOFT } from '@/lib/motion';

interface DrawerApi {
  readonly open: () => void;
}

const DrawerContext = createContext<DrawerApi | null>(null);

/**
 * The drawer rail, hoisted out of the page header.
 *
 * It used to be one component holding both the button and the drawer, sitting
 * in each page's header. That was fine while the whole shell was rebuilt on
 * every navigation; now that the rail lives in a persistent layout, the drawer
 * has to live there too — otherwise it unmounts mid-navigation and closes
 * itself under the user's finger.
 *
 * The button stays in the header, where the design puts it, and reaches the
 * drawer through this context.
 */
export function MobileNavProvider({
  rail,
  children,
}: {
  readonly rail: ReactNode;
  readonly children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // The drawer used to unmount along with the page it was part of, which closed
  // it for free. Now that it outlives the navigation it has to close itself, or
  // picking a destination leaves the rail sitting over the screen you asked for.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <DrawerContext.Provider value={{ open: () => setOpen(true) }}>
      {children}

      <AnimatePresence>
        {open ? (
          <div className="fixed inset-0 z-30 xl:hidden">
            <motion.button
              type="button"
              aria-label="Close navigation"
              onClick={() => setOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={EASE_QUICK}
              className="absolute inset-0 bg-black/20"
            />
            {/* Slides from the edge it is anchored to, so it reads as the rail
                arriving rather than a panel fading in over the page. */}
            <motion.div
              initial={{ x: '-110%' }}
              animate={{ x: 0 }}
              exit={{ x: '-110%' }}
              transition={SPRING_PANEL}
              className="absolute inset-y-[10px] left-[10px] w-[280px] overflow-y-auto"
            >
              {rail}
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    </DrawerContext.Provider>
  );
}

/** The hamburger, for the page header's leading slot. */
export function MobileNavButton() {
  const drawer = useContext(DrawerContext);
  if (!drawer) return null;

  return (
    <motion.button
      type="button"
      aria-label="Open navigation"
      onClick={drawer.open}
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.94 }}
      transition={SPRING_SOFT}
      className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[80px] bg-white text-[#4D4D4D] shadow-chip xl:hidden"
    >
      <Icon name="menu" />
    </motion.button>
  );
}
