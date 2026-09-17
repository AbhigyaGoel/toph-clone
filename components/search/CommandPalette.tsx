'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { Icon } from '@/components/ui/Icon';
import { EASE_QUICK, SPRING_SOFT } from '@/lib/motion';
import { groupItems, matchScreens, toPaletteItem, type PaletteItem } from '@/lib/palette';
import type { SearchHit } from '@/lib/types';

/**
 * How long the box waits before asking the server.
 *
 * Long enough that typing a worker's name is one query rather than nine, short
 * enough to feel like it is keeping up. The screens are matched locally with no
 * delay at all, so the list is never empty while this is pending.
 */
const DEBOUNCE_MS = 140;

/** Below this the server is not asked; it matches the endpoint's own floor. */
const MIN_QUERY = 2;

/**
 * Everything, one keystroke away.
 *
 * The dashboard is nine screens deep and the things people look for — a worker,
 * a field, something somebody said in a recording — are spread across all of
 * them. Finding "the log where Marco mentioned the pump" previously meant
 * guessing which screen, then filtering, then reading. This is one shortcut and
 * one word.
 *
 * The search itself runs in Postgres over trigram indexes rather than over a
 * payload shipped to the browser. That is not premature: the transcript column
 * is the one people most want to search and the one that grows fastest, and a
 * farm two seasons in would be downloading megabytes of it on every page load
 * to support a feature they might not use.
 */
export function CommandPalette() {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<readonly SearchHit[]>([]);
  const [pending, setPending] = useState(false);
  /**
   * Why the data half of the list is empty, when it is empty for a reason.
   *
   * Without this a throttled or failed search looks exactly like a search that
   * found nothing, and the user retypes the same query expecting a different
   * answer. The screens keep working either way, so the palette degrades to a
   * navigator rather than dying.
   */
  const [failure, setFailure] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [mounted, setMounted] = useState(false);

  const input = useRef<HTMLInputElement>(null);
  const listbox = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  // ⌘K on a Mac, Ctrl+K elsewhere, and Escape to leave. Bound to the document
  // rather than to a container so it works wherever focus happens to be —
  // which, on a dashboard full of tables, is usually nowhere in particular.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((current) => !current);
        return;
      }
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // Opening resets the query. A palette that remembers what you typed last time
  // shows you stale results for a question you have already answered.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setHits([]);
    setActive(0);
    const id = requestAnimationFrame(() => input.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const needle = query.trim();
    if (needle.length < MIN_QUERY) {
      setHits([]);
      setFailure(null);
      setPending(false);
      return;
    }

    setPending(true);

    // Each query owns an AbortController, so an answer that arrives after the
    // user has typed two more characters is dropped rather than rendered. This
    // is the bug that makes search boxes flicker between results.
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(needle)}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          setHits([]);
          setFailure(
            response.status === 429
              ? 'Searching too fast — pause a moment and try again.'
              : 'Search is unavailable right now. Screens below still work.'
          );
          return;
        }
        const body: unknown = await response.json();
        setHits(readHits(body));
        setFailure(null);
      } catch {
        // An abort is the normal case here, not a failure. A real network
        // error leaves the screens showing, which is still a usable palette.
        if (!controller.signal.aborted) {
          setHits([]);
          setFailure('Search could not reach the server. Screens below still work.');
        }
      } finally {
        if (!controller.signal.aborted) setPending(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [open, query]);

  const items = useMemo<readonly PaletteItem[]>(
    () => [...matchScreens(query), ...hits.map(toPaletteItem)],
    [query, hits]
  );

  const groups = useMemo(() => groupItems(items), [items]);

  // The highlight must never point past the end of a list that just shrank.
  useEffect(() => {
    setActive((current) => (current >= items.length ? Math.max(items.length - 1, 0) : current));
  }, [items.length]);

  const choose = useCallback(
    (item: PaletteItem | undefined) => {
      if (!item) return;
      setOpen(false);
      router.push(item.href);
    },
    [router]
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((current) => (items.length === 0 ? 0 : (current + 1) % items.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((current) => (items.length === 0 ? 0 : (current - 1 + items.length) % items.length));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(items[active]);
    }
  };

  // Keep the highlighted row in view when the arrows walk past the fold.
  useEffect(() => {
    const el = listbox.current?.querySelector(`[data-index="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!mounted) return null;

  return (
    <>
      <PaletteTrigger onOpen={() => setOpen(true)} />

      {createPortal(
        <AnimatePresence>
          {open ? (
            <motion.div
              key="palette"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={EASE_QUICK}
              className="fixed inset-0 z-[150] flex items-start justify-center bg-black/25 px-[20px] pt-[12vh] backdrop-blur-[2px]"
              onClick={() => setOpen(false)}
            >
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-label="Search everything"
                initial={{ opacity: 0, y: -12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.98 }}
                transition={SPRING_SOFT}
                onClick={(event) => event.stopPropagation()}
                className="flex max-h-[min(560px,70vh)] w-full max-w-[620px] flex-col overflow-hidden rounded-[18px] bg-white shadow-panel"
              >
                <div className="flex items-center gap-[12px] px-[20px] py-[16px] shadow-divider">
                  <Icon name="search" className="shrink-0 text-[#B3B3B3]" />
                  <input
                    ref={input}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder="Search workers, fields, products, or anything said in a recording"
                    aria-label="Search"
                    aria-controls="palette-results"
                    aria-activedescendant={items[active] ? `palette-${items[active].id}` : undefined}
                    className="min-w-0 flex-1 bg-transparent text-[15px] font-normal leading-[1.3] text-black outline-none placeholder:text-[#B3B3B3]"
                  />
                  <AnimatePresence>
                    {pending ? (
                      <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="h-[12px] w-[12px] shrink-0 animate-spin rounded-full border-[2px] border-black/15 border-t-black/50"
                      />
                    ) : null}
                  </AnimatePresence>
                </div>

                {failure ? (
                  <p
                    role="status"
                    className="bg-[rgba(176,0,32,0.06)] px-[20px] py-[8px] text-[12px] font-normal leading-[1.4] text-[#B00020]"
                  >
                    {failure}
                  </p>
                ) : null}

                <div
                  ref={listbox}
                  id="palette-results"
                  role="listbox"
                  data-pending={pending ? 'true' : 'false'}
                  className="flex min-h-0 flex-1 flex-col gap-[4px] overflow-y-auto p-[8px]"
                >
                  {items.length === 0 ? (
                    <p className="px-[12px] py-[24px] text-center text-[13px] font-normal leading-[1.4] text-[#B3B3B3]">
                      {query.trim().length < MIN_QUERY
                        ? 'Keep typing to search logs, workers, fields and transcripts.'
                        : pending
                          ? // Never "nothing matches" while the question is
                            // still being asked. A definite negative answer to
                            // an unanswered query is worse than no answer: it
                            // reads as a result and people stop typing.
                            'Searching…'
                          : `Nothing matches “${query.trim()}”.`}
                    </p>
                  ) : (
                    groups.map((group) => (
                      <div key={group.group} className="flex flex-col">
                        <span className="px-[12px] pb-[4px] pt-[8px] text-[10px] font-medium uppercase tracking-[0.04em] text-[#B3B3B3]">
                          {group.group}
                        </span>
                        {group.items.map((item) => {
                          const index = items.indexOf(item);
                          const highlighted = index === active;

                          return (
                            <button
                              key={item.id}
                              id={`palette-${item.id}`}
                              data-index={index}
                              role="option"
                              aria-selected={highlighted}
                              type="button"
                              // Pointer *move*, not enter: an enter fired by the
                              // list scrolling under a stationary cursor would
                              // steal the highlight from the arrow keys.
                              onPointerMove={() => setActive(index)}
                              onClick={() => choose(item)}
                              className={`flex items-center gap-[12px] rounded-[10px] px-[12px] py-[9px] text-left outline-none transition-colors ${
                                highlighted ? 'bg-black/[0.06]' : 'bg-transparent'
                              }`}
                            >
                              <Icon name={item.icon} size={14} className="shrink-0 text-[#4D4D4D]" />
                              <span className="flex min-w-0 flex-1 flex-col">
                                <span className="truncate text-[14px] font-normal leading-[1.3] text-black">
                                  {item.label}
                                </span>
                                <span className="truncate text-[12px] font-normal leading-[1.3] text-[#B3B3B3]">
                                  {item.sublabel}
                                </span>
                              </span>
                              {highlighted ? (
                                <span className="shrink-0 text-[11px] font-normal leading-[1.3] text-[#B3B3B3]">
                                  ↵
                                </span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    ))
                  )}
                </div>

                <div className="flex items-center justify-between gap-[10px] px-[20px] py-[10px] text-[11px] font-normal leading-[1.3] text-[#B3B3B3] shadow-[inset_0_1px_0_rgba(0,0,0,0.06)]">
                  <span>↑↓ to move · ↵ to open · esc to close</span>
                  <span>Transcripts are searched too</span>
                </div>
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}

/**
 * The visible way in, drawn as a rail row.
 *
 * A keyboard shortcut nobody knows about is not a feature, so the trigger wears
 * the shortcut — which is how people learn it and stop needing the trigger. Its
 * geometry is `NavButton`'s (4px corners, 14px gutter, 14px type) rather than
 * anything of its own, because it sits in the rail and a row that is nearly but
 * not quite a nav row reads as a mistake.
 */
function PaletteTrigger({ onOpen }: { readonly onOpen: () => void }) {
  const [mac, setMac] = useState(false);

  // Read after mount: the platform is not knowable on the server, and guessing
  // would render "Ctrl" to a Mac user for one frame.
  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform) || /Mac/.test(navigator.userAgent));
  }, []);

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Search everything"
      aria-keyshortcuts="Meta+K Control+K"
      className="group flex items-center justify-between gap-[14px] self-stretch rounded-[4px] px-[14px] py-[10px] text-left outline-none transition-colors hover:bg-black/[0.04] focus-visible:ring-2 focus-visible:ring-black/30"
    >
      <span className="flex items-center gap-[14px]">
        <Icon name="search" className="text-[#4D4D4D]" />
        <span className="text-[14px] font-normal leading-[1.3] text-[#4D4D4D]">Search</span>
      </span>
      <kbd className="rounded-[5px] bg-black/[0.04] px-[6px] py-[2px] font-sans text-[11px] leading-[1.4] text-[#B3B3B3]">
        {mac ? '⌘K' : 'Ctrl K'}
      </kbd>
    </button>
  );
}

/** The endpoint is ours, but its answer is still parsed rather than trusted. */
function readHits(body: unknown): readonly SearchHit[] {
  if (typeof body !== 'object' || body === null || !('hits' in body)) return [];
  const { hits } = body as { hits: unknown };
  if (!Array.isArray(hits)) return [];

  return hits.filter(
    (hit): hit is SearchHit =>
      typeof hit === 'object' &&
      hit !== null &&
      typeof (hit as SearchHit).kind === 'string' &&
      typeof (hit as SearchHit).id === 'string' &&
      typeof (hit as SearchHit).label === 'string'
  );
}
