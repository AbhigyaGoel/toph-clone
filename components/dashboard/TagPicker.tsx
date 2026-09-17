'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useId, useRef, useState, useTransition } from 'react';

import { addTagToLog, removeTagFromLog } from '@/app/actions/tags';
import { Icon } from '@/components/ui/Icon';
import { Popover } from '@/components/ui/Popover';
import { attempt } from '@/lib/attempt';
import { chipVariants, EASE_QUICK, menuItemVariants, SPRING_SOFT } from '@/lib/motion';
import type { Tag } from '@/lib/types';

interface TagPickerProps {
  readonly logId: string;
  readonly tags: readonly Tag[];
  /** Every tag the organisation has, for the suggestion list. */
  readonly available: readonly string[];
  readonly canWrite: boolean;
}

const TAG_NAME_MAX = 40;

/**
 * Figma `Frame 118` — the green "Add Tag" button, now doing something.
 *
 * Opening it offers the organisation's existing tags first and only then a free
 * text field, which is the ordering that keeps the vocabulary from splintering:
 * the fast path is picking "Follow up", not typing it. A name that is not in
 * the list creates the tag and attaches it in one action, so the set grows from
 * use rather than needing somewhere else to manage it.
 */
export function TagPicker({ logId, tags, available, canWrite }: TagPickerProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, startWrite] = useTransition();

  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      // The panel is portalled, so "inside" is not a DOM-subtree question.
      const insideTrigger = root.current?.contains(target);
      const insidePanel = document.getElementById(panelId)?.contains(target);
      if (!insideTrigger && !insidePanel) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, panelId]);

  const attached = new Set(tags.map((tag) => tag.name));
  const suggestions = available.filter((name) => !attached.has(name));

  const add = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;

    setError(null);
    startWrite(async () => {
      const result = await attempt(() => addTagToLog(logId, trimmed));
      if (result.success) {
        setDraft('');
        return;
      }
      setError(result.error);
    });
  };

  const remove = (tagId: string) => {
    setError(null);
    startWrite(async () => {
      const result = await attempt(() => removeTagFromLog(logId, tagId));
      if (!result.success) setError(result.error);
    });
  };

  return (
    <div ref={root} className="relative flex flex-col gap-[10px] self-stretch">
      <motion.button
        ref={trigger}
        type="button"
        onClick={() => setOpen((current) => !current)}
        disabled={!canWrite}
        aria-expanded={open}
        aria-controls={panelId}
        whileHover={canWrite ? { y: -1, scale: 1.01 } : undefined}
        whileTap={canWrite ? { scale: 0.99 } : undefined}
        transition={SPRING_SOFT}
        className="flex items-center justify-center gap-[10px] self-stretch rounded-[7.04px] bg-[rgba(20,108,68,0.1)] px-[8.8px] py-[10.56px] text-[16px] font-normal leading-[1.3] text-[#146C44] shadow-detail-button-accent outline-none focus-visible:ring-2 focus-visible:ring-[#146C44]/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <motion.span
          initial={false}
          animate={{ rotate: open ? 45 : 0 }}
          transition={SPRING_SOFT}
          className="flex items-center"
        >
          <Icon name={open ? 'plus' : 'star'} />
        </motion.span>
        Add Tag
      </motion.button>

      {/*
        A disabled control with no reason attached is the same dead button this
        rewrite set out to remove, so the read-only deployment says why.
      */}
      {!canWrite ? (
        <p className="text-[12px] font-normal leading-[1.3] text-black opacity-40">
          Tagging needs write credentials — set SUPABASE_SECRET_KEY to enable it.
        </p>
      ) : null}

      {/* Attached tags. They animate in where the write lands, not on reload. */}
      <motion.div layout className="flex flex-wrap items-center gap-[8px]">
        <AnimatePresence mode="popLayout" initial={false}>
          {tags.map((tag) => (
            <motion.button
              key={tag.id}
              layout
              type="button"
              variants={chipVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              disabled={!canWrite || busy}
              onClick={() => remove(tag.id)}
              whileHover={canWrite ? { scale: 1.05 } : undefined}
              whileTap={canWrite ? { scale: 0.95 } : undefined}
              transition={SPRING_SOFT}
              className="group flex items-center gap-[6px] rounded-[80px] bg-[rgba(20,108,68,0.1)] px-[12px] py-[5px] text-[12px] font-normal leading-[1.3] text-[#146C44] disabled:cursor-not-allowed"
              aria-label={`Remove tag ${tag.name}`}
            >
              {tag.name}
              <span className="transition-transform duration-200 group-hover:rotate-90">
                <Icon name="x" size={12} />
              </span>
            </motion.button>
          ))}
        </AnimatePresence>
      </motion.div>

      {/*
        Portalled for the same reason the filter menus are: this panel sits
        inside the expanded detail, which lives in an `overflow-hidden` section
        and a `container-type: inline-size` scroller. Declared in place it gets
        clipped at the panel's edge.
      */}
      <Popover
        open={open}
        anchor={trigger}
        align="start"
        matchWidth
        id={panelId}
        role="menu"
        className="flex flex-col gap-[4px]"
      >
            {suggestions.length > 0 ? (
              <motion.span
                variants={menuItemVariants}
                className="px-[10px] py-[4px] text-[10px] font-medium leading-[1.3] text-[#B3B3B3]"
              >
                EXISTING TAGS
              </motion.span>
            ) : null}

            {suggestions.map((name) => (
              <motion.button
                key={name}
                type="button"
                variants={menuItemVariants}
                onClick={() => add(name)}
                disabled={busy}
                whileHover={{ x: 2 }}
                transition={SPRING_SOFT}
                className="flex w-full items-center justify-between rounded-[4px] px-[10px] py-[8px] text-left text-[14px] font-normal leading-[1.3] text-[#4D4D4D] hover:bg-black/5 disabled:opacity-50"
              >
                {name}
                <Icon name="plus" />
              </motion.button>
            ))}

            <motion.form
              variants={menuItemVariants}
              onSubmit={(event) => {
                event.preventDefault();
                add(draft);
              }}
              className="flex items-center gap-[6px] px-[4px] pt-[4px]"
            >
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={TAG_NAME_MAX}
                placeholder="New tag"
                aria-label="New tag name"
                className="w-full rounded-[4px] bg-black/[0.04] px-[10px] py-[8px] text-[14px] font-normal leading-[1.3] text-black outline-none placeholder:text-[#B3B3B3]"
              />
              <button
                type="submit"
                disabled={busy || draft.trim().length === 0}
                className="shrink-0 rounded-[4px] bg-black px-[10px] py-[8px] text-[14px] font-normal leading-[1.3] text-white disabled:opacity-30"
              >
                Add
              </button>
            </motion.form>

            <AnimatePresence>
              {error ? (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={EASE_QUICK}
                  role="alert"
                  className="px-[10px] text-[12px] font-normal leading-[1.4] text-[#B00020]"
                >
                  {error}
                </motion.p>
              ) : null}
            </AnimatePresence>
      </Popover>
    </div>
  );
}
