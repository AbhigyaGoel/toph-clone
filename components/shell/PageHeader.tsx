import type { ReactNode } from 'react';

interface PageHeaderProps {
  readonly title: string;
  readonly subtitle: string;
  /** Rendered before the title; used for the narrow-viewport menu button. */
  readonly leading?: ReactNode;
  /** The right-hand slot: a search field, a set of actions, or nothing. */
  readonly actions?: ReactNode;
}

/**
 * Figma `Frame 20` — page title block plus whatever the screen puts on the right.
 *
 * The design draws this once, on the Dashboard, with a search pill on the right.
 * Every other screen reuses the same band at the same measurements and supplies
 * its own right-hand control, because "a title, a line of explanation, and the
 * one thing you most want to do here" is the shape the design established and
 * there is no reason for a second one.
 *
 * Title and actions sit side by side from the medium breakpoint; below it the
 * actions drop beneath the title and stretch to the column.
 */
export function PageHeader({ title, subtitle, leading, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-col items-stretch gap-[10px] self-stretch py-[20px] md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-[14px]">
        {leading}
        <div className="flex flex-col">
          <h1 className="text-[20px] font-semibold leading-[1.3] text-black">{title}</h1>
          <p className="text-[16px] font-normal leading-[1.3] text-[#4D4D4D]">{subtitle}</p>
        </div>
      </div>

      {/*
        Wraps, and may shrink. A screen can put three controls here — the
        Dashboard has a replay link, an export and a search field — and at a
        narrow width three rigid chips in a `flex` row do not overflow their own
        container, they push the *document* wider and give the whole page a
        horizontal scrollbar. `min-w-0` lets the search field give way rather
        than the page.
      */}
      {actions ? (
        <div className="flex min-w-0 flex-wrap items-center gap-[10px] md:justify-end">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
