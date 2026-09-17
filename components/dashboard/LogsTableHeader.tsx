'use client';

import {
  TABLE_ACTION_CELL,
  TABLE_COLUMNS,
  TABLE_DATA_CELL,
  TABLE_ROW,
  TABLE_SELECT_CELL,
} from '@/components/dashboard/tableLayout';
import { Checkbox, type CheckboxState } from '@/components/ui/Checkbox';

interface LogsTableHeaderProps {
  readonly state: CheckboxState;
  readonly onToggleAll: () => void;
  readonly disabled: boolean;
}

/**
 * Figma `Frame 160` — the column headings.
 *
 * The trailing "View All" button is present in the design at zero opacity: it
 * exists only to reserve the width of the action column so the headings line up
 * with the rows below. It is kept (hidden from assistive tech) for exactly that
 * reason.
 *
 * The row is sticky so that, when the expanded panel scrolls its rows, the
 * headings stay put — the same behaviour as when it sat outside the scroll
 * area, now that the table scrolls sideways as one unit.
 */
export function LogsTableHeader({ state, onToggleAll, disabled }: LogsTableHeaderProps) {
  return (
    <div className={`${TABLE_ROW} sticky top-0 z-10 bg-white shadow-divider-strong`}>
      <div className={TABLE_SELECT_CELL}>
        <Checkbox
          state={state}
          onToggle={onToggleAll}
          disabled={disabled}
          label="Select every log in this view"
        />
      </div>

      {TABLE_COLUMNS.map((column) => (
        <div key={column} className={`${TABLE_DATA_CELL} opacity-30`}>
          <span className="text-[14px] font-normal leading-[1.3] text-[#4D4D4D]">{column}</span>
        </div>
      ))}

      <div aria-hidden className={`${TABLE_ACTION_CELL} opacity-0`}>
        <span className="flex shrink-0 items-center justify-center gap-[10px] whitespace-nowrap rounded-[4px] bg-white px-[16px] py-[8px] text-[14px] font-normal leading-[1.3] text-[#4D4D4D] shadow-chip">
          View All
        </span>
      </div>
    </div>
  );
}
