import type { ReactNode } from 'react';

import { MobileNavButton } from '@/components/nav/MobileNavProvider';
import { PageHeader } from '@/components/shell/PageHeader';
import { PageEntrance } from '@/components/ui/PageEntrance';

interface ScreenProps {
  readonly title: string;
  readonly subtitle: string;
  /** The header's right-hand slot: filters, an export, or nothing. */
  readonly actions?: ReactNode;
  readonly children: ReactNode;
}

/**
 * One screen's header and content, inside the shell the layout already drew.
 *
 * This is what `AppShell` used to be minus the navigation rail — and that
 * subtraction is the point. The rail was inside every page, so switching
 * screens unmounted and rebuilt it along with everything else: a measured
 * ~1050ms in which the rail, the header and the content were all simply the
 * old ones, with no indication that the click had registered. The rail now
 * lives in the route group's layout, where it survives the navigation, and
 * only what is genuinely different about the new screen is replaced.
 */
export function Screen({ title, subtitle, actions, children }: ScreenProps) {
  return (
    <div className="flex w-full min-w-0 flex-1 flex-col items-center gap-[10px] self-stretch">
      <PageEntrance index={0}>
        <PageHeader
          title={title}
          subtitle={subtitle}
          leading={<MobileNavButton />}
          actions={actions}
        />
      </PageEntrance>

      {children}
    </div>
  );
}
