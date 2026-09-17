'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useState, useTransition } from 'react';

import { Checkbox } from '@/components/ui/Checkbox';
import { Icon } from '@/components/ui/Icon';
import {
  DANGER_BUTTON,
  ERROR_TEXT,
  INPUT,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
} from '@/components/ui/formStyles';
import type { ActionResult } from '@/lib/actionResult';
import { chipVariants, EASE_QUICK, SPRING_SOFT } from '@/lib/motion';
import type { ReferenceItem } from '@/lib/types';

interface ReferenceListProps {
  readonly items: readonly ReferenceItem[];
  /** Singular noun for the empty state and the add field's placeholder. */
  readonly noun: string;
  /** Employees carry an active flag; the other collections do not. */
  readonly withActiveFlag?: boolean;
  /** Noun for the usage count beside each row — "log" for most, "use" for tags. */
  readonly countLabel: string;
  /**
   * Whether a row in use cannot be deleted.
   *
   * True for employees, fields and activities, whose foreign keys restrict:
   * deleting one would leave logs pointing at nothing. False for tags, whose
   * link table cascades — a tag is an annotation, so deleting it costs a label
   * rather than the meaning of the log.
   */
  readonly deleteBlockedByUse: boolean;
  readonly onCreate: (name: string) => Promise<ActionResult<unknown>>;
  readonly onRename: (id: string, name: string, isActive: boolean) => Promise<ActionResult<unknown>>;
  readonly onDelete: (id: string) => Promise<ActionResult<unknown>>;
}

/**
 * One editable reference collection.
 *
 * All four behave the same way — add a name, rename in place, toggle or delete —
 * so they share a component and differ by the three actions passed in. Editing
 * is inline rather than a nested dialog: these are single-field rows, and a
 * second modal to change one string would be more ceremony than the change.
 *
 * A row with logs behind it shows the count and disables its delete, so the
 * constraint is visible before it is hit rather than arriving as an error.
 */
export function ReferenceList({
  items,
  noun,
  withActiveFlag = false,
  countLabel,
  deleteBlockedByUse,
  onCreate,
  onRename,
  onDelete,
}: ReferenceListProps) {
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, startWrite] = useTransition();

  const run = (work: () => Promise<ActionResult<unknown>>, onDone?: () => void) => {
    setError(null);
    startWrite(async () => {
      const result = await work();
      if (!result.success) {
        setError(result.error);
        return;
      }
      onDone?.();
    });
  };

  const beginEdit = (item: ReferenceItem) => {
    setEditingId(item.id);
    setEditValue(item.name);
    setError(null);
  };

  return (
    <div className="flex flex-col gap-[12px]">
      <form
        className="flex items-center gap-[8px]"
        onSubmit={(event) => {
          event.preventDefault();
          if (!draft.trim()) return;
          run(() => onCreate(draft), () => setDraft(''));
        }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={`Add a ${noun}`}
          aria-label={`New ${noun} name`}
          className={INPUT}
        />
        <button type="submit" disabled={busy || !draft.trim()} className={PRIMARY_BUTTON}>
          <Icon name="plus" />
          Add
        </button>
      </form>

      <AnimatePresence>
        {error ? (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={EASE_QUICK}
            role="alert"
            className={ERROR_TEXT}
          >
            {error}
          </motion.p>
        ) : null}
      </AnimatePresence>

      {/*
        A fixed height, not a max. The four tabs hold different numbers of rows,
        and sizing to content made the whole dialog jump as you moved between
        them — the panel is centred, so a height change moves both edges at
        once. A constant height means switching tabs changes only the list.
      */}
      <ul className="flex h-[340px] flex-col gap-[4px] overflow-y-auto overscroll-contain">
        <AnimatePresence mode="popLayout" initial={false}>
          {items.length === 0 ? (
            <motion.li
              key="empty"
              variants={chipVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="px-[4px] py-[10px] text-[14px] font-normal leading-[1.3] text-[#4D4D4D] opacity-50"
            >
              No {noun}s yet.
            </motion.li>
          ) : null}

          {items.map((item) => {
            const editing = editingId === item.id;
            const blocked = deleteBlockedByUse && item.logCount > 0;

            return (
              <motion.li
                key={item.id}
                layout
                variants={chipVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="flex items-center gap-[10px] rounded-[8px] px-[4px] py-[6px] hover:bg-black/[0.03]"
              >
                {withActiveFlag ? (
                  <Checkbox
                    state={item.isActive ? 'checked' : 'unchecked'}
                    disabled={busy}
                    label={`${item.name} is active`}
                    onToggle={() => run(() => onRename(item.id, item.name, !item.isActive))}
                  />
                ) : null}

                {editing ? (
                  <form
                    className="flex flex-1 items-center gap-[8px]"
                    onSubmit={(event) => {
                      event.preventDefault();
                      run(
                        () => onRename(item.id, editValue, item.isActive ?? true),
                        () => setEditingId(null)
                      );
                    }}
                  >
                    <input
                      autoFocus
                      value={editValue}
                      onChange={(event) => setEditValue(event.target.value)}
                      aria-label={`Rename ${item.name}`}
                      className={INPUT}
                    />
                    <button type="submit" disabled={busy} className={PRIMARY_BUTTON}>
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className={SECONDARY_BUTTON}
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <>
                    <span
                      className={`flex-1 text-[14px] font-normal leading-[1.3] ${
                        item.isActive === false ? 'text-[#4D4D4D] line-through opacity-50' : 'text-black'
                      }`}
                    >
                      {item.name}
                    </span>

                    <span className="shrink-0 text-[12px] font-normal leading-[1.3] text-[#B3B3B3]">
                      {item.logCount} {countLabel}
                      {item.logCount === 1 ? '' : 's'}
                    </span>

                    <motion.button
                      type="button"
                      onClick={() => beginEdit(item)}
                      disabled={busy}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      transition={SPRING_SOFT}
                      className={SECONDARY_BUTTON}
                    >
                      Rename
                    </motion.button>

                    <motion.button
                      type="button"
                      onClick={() => run(() => onDelete(item.id))}
                      disabled={busy || blocked}
                      title={
                        blocked
                          ? `In use by ${item.logCount} log${item.logCount === 1 ? '' : 's'}`
                          : undefined
                      }
                      whileHover={blocked ? undefined : { scale: 1.05 }}
                      whileTap={blocked ? undefined : { scale: 0.95 }}
                      transition={SPRING_SOFT}
                      className={DANGER_BUTTON}
                    >
                      Delete
                    </motion.button>
                  </>
                )}
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </div>
  );
}
