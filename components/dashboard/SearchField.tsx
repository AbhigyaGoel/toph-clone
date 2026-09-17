'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

import { useLogQueryNavigation } from '@/components/dashboard/useLogQueryNavigation';
import { Icon } from '@/components/ui/Icon';
import { EASE_QUICK, SPRING_SOFT } from '@/lib/motion';

const DEBOUNCE_MS = 300;

/**
 * Figma `Frame 176` in the page header — a 370px pill.
 *
 * The input is controlled locally and pushed to the URL after a short pause, so
 * every keystroke does not trigger a server round-trip but the address bar (and
 * therefore a refresh) always ends up reflecting the search.
 *
 * Between the last keystroke and the results arriving there is a window where
 * the box looks settled and the table is stale. The ring and the spinning glyph
 * cover exactly that window, so the pause reads as work rather than as the
 * search having missed the last few characters.
 */
export function SearchField() {
  const { query, replace, isPending } = useLogQueryNavigation();
  const [value, setValue] = useState(query.q);
  const [debouncing, setDebouncing] = useState(false);

  const latestQuery = useRef(query);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    latestQuery.current = query;
    // Adopt an external change (back button, a shared link) unless the user is
    // mid-keystroke, in which case their pending value wins.
    if (pending.current === null) {
      setValue(query.q);
    }
  }, [query]);

  useEffect(
    () => () => {
      if (pending.current !== null) clearTimeout(pending.current);
    },
    []
  );

  const handleChange = (next: string) => {
    setValue(next);
    setDebouncing(true);
    if (pending.current !== null) clearTimeout(pending.current);
    pending.current = setTimeout(() => {
      pending.current = null;
      setDebouncing(false);
      replace({ ...latestQuery.current, q: next.trim() });
    }, DEBOUNCE_MS);
  };

  const busy = debouncing || isPending;
  const hasValue = value.length > 0;

  const clear = () => {
    if (pending.current !== null) clearTimeout(pending.current);
    pending.current = null;
    setDebouncing(false);
    setValue('');
    replace({ ...latestQuery.current, q: '' });
  };

  return (
    <motion.div
      initial={false}
      animate={{
        boxShadow: busy
          ? '0 0 0 1.5px rgba(0,0,0,0.18), 0px 1px 2px rgba(0,0,0,0.06)'
          : '0 0 0 0px rgba(0,0,0,0), 0px 1px 2px rgba(0,0,0,0.06)',
      }}
      transition={EASE_QUICK}
      className="flex w-full items-center gap-[10px] rounded-[30px] bg-white px-[16px] py-[8px] shadow-chip md:w-[370px]"
    >
      <motion.span
        animate={busy ? { rotate: 360 } : { rotate: 0 }}
        transition={
          busy
            ? { duration: 0.9, repeat: Infinity, ease: 'linear' }
            : { duration: 0.2 }
        }
        className="flex shrink-0 items-center text-[#CCCCCC]"
      >
        <Icon name="search" />
      </motion.span>

      <input
        type="search"
        placeholder="Search"
        aria-label="Search logs"
        value={value}
        onChange={(event) => handleChange(event.target.value)}
        className="w-full bg-transparent text-[14px] font-normal leading-[1.3] text-black outline-none placeholder:text-[#CCCCCC] [&::-webkit-search-cancel-button]:hidden"
      />

      <AnimatePresence>
        {hasValue ? (
          <motion.button
            type="button"
            onClick={clear}
            aria-label="Clear search"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            whileHover={{ rotate: 90 }}
            transition={SPRING_SOFT}
            className="flex shrink-0 items-center text-[#CCCCCC] hover:text-[#4D4D4D]"
          >
            <Icon name="x" />
          </motion.button>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}
