import type { ReactNode } from 'react';

import { Icon, type IconName } from '@/components/ui/Icon';

interface PanelProps {
  readonly title?: string;
  readonly icon?: IconName;
  /** The toolbar's right-hand slot: filters, an export button, a count. */
  readonly actions?: ReactNode;
  /**
   * Stretches the panel to the bottom of the viewport at xl and scrolls its
   * body internally, so the rail and the page header stay put.
   */
  readonly fill?: boolean;
  readonly children: ReactNode;
}

/**
 * The white card every screen's content sits in.
 *
 * Lifted straight off the design's "New Employee Logs" panel — 20px corners,
 * the panel shadow, a toolbar band separated by the 1px divider rather than a
 * border — because that frame is the only container the Figma defines, and
 * inventing a second one for the screens the Figma does not draw would make the
 * app look like two products.
 *
 * `overflow-hidden` is what rounds the corners of whatever is inside, and is
 * also why every menu opened from a panel toolbar renders through a portal.
 */
export function Panel({ title, icon, actions, fill = false, children }: PanelProps) {
  const stretch = fill ? 'xl:min-h-0 xl:flex-1' : '';

  return (
    <section
      className={`flex w-full flex-col items-center self-stretch overflow-hidden rounded-[20px] bg-white shadow-panel ${stretch}`}
    >
      {title || actions ? (
        <div className="flex flex-col items-start gap-[10px] self-stretch px-[16px] py-[20px] shadow-divider sm:px-[30px] lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-[10px]">
            {icon ? <Icon name={icon} className="text-black" /> : null}
            {title ? (
              <h2 className="text-[16px] font-normal leading-[1.3] text-black">{title}</h2>
            ) : null}
          </div>
          {actions ? (
            <div className="flex flex-wrap items-center gap-[10px]">{actions}</div>
          ) : null}
        </div>
      ) : null}

      <div
        className={`flex w-full flex-col self-stretch ${stretch} ${fill ? 'xl:overflow-y-auto' : ''}`}
      >
        {children}
      </div>
    </section>
  );
}
