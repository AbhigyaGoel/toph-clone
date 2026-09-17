'use client';

import { AnimatePresence, motion } from 'framer-motion';

import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { EASE_QUICK, SPRING_SOFT } from '@/lib/motion';

interface BulkActionBarProps {
  readonly count: number;
  readonly busy: boolean;
  /**
   * Why this viewer cannot act, when they cannot. A standing condition rather
   * than an event — failures of an action they *were* allowed to take go to the
   * toast, which can still be read after the bar has gone.
   */
  readonly refusal: string | null;
  readonly onMarkReviewed: () => void;
  readonly onMarkNew: () => void;
  readonly onDelete: () => void;
  readonly onClear: () => void;
}

const ACTION_CLASS =
  'flex shrink-0 items-center justify-center gap-[10px] whitespace-nowrap rounded-[80px] px-[16px] py-[8px] text-[14px] font-normal leading-[1.3] shadow-chip disabled:cursor-not-allowed disabled:opacity-50';

/**
 * The bar that arrives when rows are ticked.
 *
 * Pinned to the bottom of the panel's visible width rather than the viewport,
 * and sized in container-query units for the same reason the expanded detail
 * is: the table scrolls sideways underneath it, and a bar that slid away with
 * the rows would be unreachable at the widths where the table needs scrolling.
 *
 * Both directions are offered. "Mark as reviewed" is the real action, but
 * without its inverse the demo is one-way — you can spend the one unreviewed
 * log and never get it back — and `status` is a field, not an event.
 */
export function BulkActionBar({
  count,
  busy,
  refusal,
  onMarkReviewed,
  onMarkNew,
  onDelete,
  onClear,
}: BulkActionBarProps) {
  return (
    <AnimatePresence>
      {count > 0 ? (
        <motion.div
          initial={{ y: '110%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '110%', opacity: 0 }}
          transition={SPRING_SOFT}
          className="sticky bottom-0 left-0 z-20 flex w-[100cqw] flex-col gap-[10px] border-t border-black/5 bg-white/95 px-[16px] py-[14px] backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-[30px]"
        >
          <div className="flex items-center gap-[10px]">
            <span className="text-[14px] font-normal leading-[1.3] text-black">
              <AnimatedNumber value={count} /> selected
            </span>

            <AnimatePresence mode="wait">
              {refusal ? (
                <motion.span
                  key={refusal}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={EASE_QUICK}
                  className="text-[14px] font-normal leading-[1.3] text-[#B00020]"
                >
                  {refusal}
                </motion.span>
              ) : null}
            </AnimatePresence>
          </div>

          {/*
            The two status actions stay live while a write is in flight, and
            that is the whole point of making them optimistic.

            They used to carry `disabled={busy}` like the delete does, and
            `busy` spans the action *and* the `revalidatePath` round trip it
            triggers — well over a second. Anyone reviewing a morning's logs
            ticks, presses, ticks, presses, and the second press landed on a
            button that was still disabled: no request, no error, nothing. The
            row simply did not change and there was no way to tell why.

            Overlapping writes are safe here because each click captures its own
            ids and its own before-state, so a failure rolls back exactly the
            rows it touched. The delete keeps its guard — it is destructive, it
            is not optimistic, and a double press there means two batches gone.
          */}
          <div className="flex flex-wrap items-center gap-[10px]">
            <motion.button
              type="button"
              onClick={onMarkReviewed}
              whileHover={{ y: -1, scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              transition={SPRING_SOFT}
              className={`${ACTION_CLASS} bg-black text-white`}
            >
              Mark as reviewed
            </motion.button>

            <motion.button
              type="button"
              onClick={onMarkNew}
              whileHover={{ y: -1, scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              transition={SPRING_SOFT}
              className={`${ACTION_CLASS} bg-white text-[#4D4D4D]`}
            >
              Mark as new
            </motion.button>

            {/*
              One click. This used to arm on the first press and fire on the
              second, which makes every deliberate delete pay for the occasional
              accidental one. The rows are held on the server for a minute
              instead and an undo is offered, so the accident is one click to
              reverse and the deliberate case is not taxed at all.
            */}
            <motion.button
              type="button"
              disabled={busy}
              onClick={onDelete}
              whileHover={busy ? undefined : { y: -1, scale: 1.03 }}
              whileTap={busy ? undefined : { scale: 0.97 }}
              transition={SPRING_SOFT}
              className={`${ACTION_CLASS} bg-[rgba(176,0,32,0.08)] text-[#B00020]`}
            >
              Delete
            </motion.button>

            <button
              type="button"
              onClick={onClear}
              className="px-[6px] text-[14px] font-normal leading-[1.3] text-[#4D4D4D] opacity-50 transition-opacity hover:opacity-100"
            >
              Clear
            </button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
