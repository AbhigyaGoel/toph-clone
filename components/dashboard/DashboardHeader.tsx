import type { ReactNode } from 'react';

import { SearchField } from '@/components/dashboard/SearchField';

interface DashboardHeaderProps {
  /** Rendered before the title; used for the narrow-viewport menu button. */
  readonly leading?: ReactNode;
}

/**
 * Figma `Frame 20` — page title block plus the search pill.
 *
 * Title and search sit side by side from the medium breakpoint; below it the
 * search drops beneath the title and stretches to the column.
 */
export function DashboardHeader({ leading }: DashboardHeaderProps) {
  return (
    <header className="flex flex-col items-stretch gap-[10px] self-stretch py-[20px] md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-[14px]">
        {leading}
        <div className="flex flex-col">
          <h1 className="text-[20px] font-semibold leading-[1.3] text-black">Dashboard</h1>
          <p className="text-[16px] font-normal leading-[1.3] text-[#4D4D4D]">
            An overview of your farm and employee activity
          </p>
        </div>
      </div>

      <div className="flex items-center gap-[10px]">
        <SearchField />
      </div>
    </header>
  );
}
