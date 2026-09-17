'use client';

import { AnimatePresence, motion } from 'framer-motion';
import type { MouseEvent } from 'react';

import {
  TABLE_ACTION_CELL,
  TABLE_DATA_CELL,
  TABLE_ROW,
  TABLE_SELECT_CELL,
} from '@/components/dashboard/tableLayout';
import { Checkbox } from '@/components/ui/Checkbox';
import { Icon } from '@/components/ui/Icon';
import { formatLogDate, formatTimeRange } from '@/lib/format';
import { EASE_QUICK, SPRING_SOFT } from '@/lib/motion';
import type { ActivityLog } from '@/lib/types';

interface LogRowProps {
  readonly log: ActivityLog;
  /** True on the row the travelling wash is currently over. */
  readonly highlighted: boolean;
  /** True on the row that wears the wash while the pointer is elsewhere. */
  readonly resting: boolean;
  readonly selected: boolean;
  /** True when this log has a compliance gap or shaky audio. */
  readonly flagged: boolean;
  /** An expanded row's action reads "Close" instead of "View". */
  readonly expanded: boolean;
  /** Id of the panel this row opens, for `aria-controls`. */
  readonly panelId: string;
  readonly onOpen: () => void;
  readonly onToggleSelect: (id: string, event: MouseEvent<HTMLButtonElement>) => void;
  readonly rowRef: (element: HTMLElement | null) => void;
}

/**
 * `relative` matters twice here: the visually-hidden label inside the action is
 * absolutely positioned, and without a positioned parent it resolves against
 * the page and widens the document past the viewport on narrow screens; and the
 * selected tint is an absolutely-positioned child of its row.
 *
 * The surface colour is deliberately *not* in here. It used to be — `bg-white`
 * sat in this shared string and the open state appended `bg-black text-white`,
 * which reads as a black pill but is not one: the two utilities have equal
 * specificity, so the winner is whichever Tailwind emits last, and that is
 * `bg-white`. An open row's button was white text on a white pill, which is
 * exactly the "the View text disappears" it was reported as. Each state now
 * names its own background and neither can quietly outrank the other.
 */
const ACTION_CLASS =
  'relative flex shrink-0 items-center justify-center gap-[10px] whitespace-nowrap rounded-[80px] px-[16px] py-[8px] text-[14px] font-normal leading-[1.3] shadow-chip-soft outline-none focus-visible:ring-2 focus-visible:ring-black/30';

/** Figma `Frame 161`..`171` — one log in the table body. */
export function LogRow({
  log,
  highlighted,
  resting,
  selected,
  flagged,
  expanded,
  panelId,
  onOpen,
  onToggleSelect,
  rowRef,
}: LogRowProps) {
  const cells = [
    log.employee,
    log.activity,
    formatLogDate(log.startedAt),
    log.field,
    formatTimeRange(log.startedAt, log.endedAt),
  ];

  return (
    // `data-log-row` is how a deep link finds this row without holding a
    // reference to it — see ScrollToOpenLog, which outlives this component's
    // several mounts.
    <div ref={rowRef} data-log-row={log.id} className={`${TABLE_ROW} relative shadow-divider`}>
      {/*
        The resting wash. The travelling one is a single element owned by the
        table body; this is the design's default state, on the first row, and it
        only has to be here so that the wash exists before the pointer does.
        Hovering this same row leaves it lit rather than crossfading two
        identical greys over each other.
      */}
      <motion.span
        aria-hidden
        initial={false}
        animate={{ opacity: resting ? 1 : 0 }}
        transition={EASE_QUICK}
        className="pointer-events-none absolute inset-0 bg-[#F8F8F8]"
      />

      {/* A selected row tints on top of the wash so the two states compose. */}
      <motion.span
        aria-hidden
        initial={false}
        animate={{ opacity: selected ? 1 : 0 }}
        transition={EASE_QUICK}
        className="pointer-events-none absolute inset-0 bg-black/[0.04]"
      />

      <div className={`${TABLE_SELECT_CELL} relative`}>
        <Checkbox
          state={selected ? 'checked' : 'unchecked'}
          onToggle={(event) => onToggleSelect(log.id, event)}
          label={`Select ${log.employee}'s log`}
        />
      </div>

      {cells.map((value, index) => (
        <div key={index} className={`${TABLE_DATA_CELL} relative`}>
          <motion.span
            initial={false}
            animate={{ color: highlighted ? '#1A1A1A' : '#4D4D4D' }}
            transition={EASE_QUICK}
            className="flex items-center gap-[8px] whitespace-nowrap text-[14px] font-normal leading-[1.3]"
          >
            {value}
            {/*
              The EMPLOYEE column carries the log's review state. The table never
              showed `status` before, so marking a row reviewed changed only the
              stat card — the row you acted on gave nothing back. The dot is the
              rail badge's green at the rail badge's size, so it reads as the
              same fact in two places.
            */}
            {index === 0 ? (
              <AnimatePresence initial={false}>
                {log.status === 'new' ? (
                  <motion.span
                    key="new"
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={SPRING_SOFT}
                    title="Not yet reviewed"
                    className="h-[6px] w-[6px] shrink-0 rounded-full bg-[rgba(1,156,37,0.5)]"
                  />
                ) : null}

                {/*
                  The exception marker, next to the worker's name where the eye
                  already lands. Without it the table is a list you have to read
                  to triage; with it the problems raise their own hands and the
                  rows that are fine can be skipped. Amber rather than red: this
                  is "look at this", not "something has gone wrong".
                */}
                {flagged ? (
                  <motion.span
                    key="flagged"
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={SPRING_SOFT}
                    title="Needs attention — open the log to see what is missing"
                    className="flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full bg-[rgba(122,91,0,0.14)] text-[#7A5B00]"
                  >
                    <Icon name="clipboard-pen" size={9} />
                  </motion.span>
                ) : null}
              </AnimatePresence>
            ) : null}
          </motion.span>
        </div>
      ))}

      <div className={`${TABLE_ACTION_CELL} relative`}>
        {/*
          Every row opens, including one with no recording. The panel is where a
          log is edited and deleted as well as where its recording is played, so
          gating it on `hasRecording` would leave a hand-entered log with no way
          to change it. What the panel shows adapts instead.

          A button, not a link. This used to navigate to `/logs/<id>`, a route of
          its own — so opening a row tore down the whole client tree and built it
          again, which cleared the tick boxes, shut any open menu, and read as
          the page reloading under the click. The open rows are a search param
          now, applied optimistically, so this opens on the press.
        */}
        <motion.button
          type="button"
          onClick={onOpen}
          aria-expanded={expanded}
          aria-controls={panelId}
          whileHover={{ y: -1, scale: 1.04 }}
          whileTap={{ scale: 0.97 }}
          transition={SPRING_SOFT}
          className={`${ACTION_CLASS} ${expanded ? 'bg-black text-white' : 'bg-white text-[#4D4D4D]'}`}
        >
          {expanded ? 'Close' : 'View'}
          <span className="sr-only">{` ${log.employee}'s log`}</span>
        </motion.button>
      </div>
    </div>
  );
}
