import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { MobileNavProvider } from '@/components/nav/MobileNavProvider';
import { TophNavigationBar } from '@/components/nav/TophNavigationBar';
import { findMembers } from '@/lib/repositories/members';
import { findDashboardStats } from '@/lib/repositories/stats';
import { currentViewer, signInAvailable } from '@/lib/viewer';

/**
 * The frame every screen sits in: the rail, and the column beside it.
 *
 * A route-group layout rather than a component each page renders, and the
 * difference is the whole reason this file exists. When the rail was inside
 * every page, switching screens replaced the entire subtree — rail included —
 * so a click produced a measured ~1050ms of nothing at all before the new
 * screen appeared fully formed. Nothing acknowledged the click, because there
 * was no part of the page left standing to acknowledge it with.
 *
 * Here the rail is outside the part that changes. It stays mounted, its
 * highlight moves the instant you click, and only the column beside it
 * suspends — which is what `loading.tsx` next to this file fills.
 *
 * It resolves its own chrome data rather than making every page thread three
 * props it does not otherwise care about. That is cheap because `currentViewer`
 * and the repositories underneath it are wrapped in React's `cache()`: a page
 * that also needs the organisation gets the same promise this did.
 */
export default async function ShellLayout({ children }: { readonly children: ReactNode }) {
  const viewer = await currentViewer();

  // One gate, in the frame every screen sits in, rather than a check repeated
  // at the top of eleven pages — where the eleventh would eventually be the one
  // that forgot. A deployment that cannot hold a session skips this entirely
  // and renders in its unauthenticated read-only state.
  if (!viewer.member && signInAvailable()) {
    redirect('/sign-in');
  }

  const [members, stats] = await Promise.all([
    findMembers(viewer.organization.id),
    findDashboardStats(viewer.organization.id),
  ]);

  const rail = (scope: string, className?: string) => (
    <TophNavigationBar
      organization={viewer.organization}
      badgeCount={stats.newLogs}
      // Unread, not total. An inbox badge has meant "how many you have not
      // read" since the first mail client, and it is a count the layout already
      // holds — assembling the full inbox here would put four queries on the
      // critical path of every screen to draw one dot.
      inboxCount={stats.newLogs}
      members={members}
      currentMemberId={viewer.member?.id ?? null}
      className={className}
      layoutScope={scope}
    />
  );

  return (
    <MobileNavProvider rail={rail('nav-drawer')}>
      {/*
          No `min-h-[955px]` here any more. The Figma is drawn at 1676x955 and
          that minimum was preserving its proportions — but on the 900px-tall
          laptop most people actually use it forced 55px of document overflow,
          so the whole shell crept upwards as you scrolled and took the rail
          with it. The column below scrolls on its own now, so the design's
          height is a target rather than a floor.
        */}
        <div className="flex min-h-screen w-full gap-[10px] bg-white p-[10px] xl:h-screen">
        {rail('nav-rail', 'hidden xl:flex')}

        {/*
          The column scrolls, the rail does not.
          
          At xl the shell is exactly viewport height, and `<main>` had no
          overflow of its own — so any screen taller than the viewport pushed
          the *document* into scrolling and took the navigation with it. Reading
          down the Performance table scrolled the rail off the top of the
          screen, which is not what a fixed sidebar is for. Giving the column
          its own scroll container keeps the rail where it was drawn and moves
          only what the user is reading.
        */}
        <main className="flex min-w-0 flex-1 flex-col items-center gap-[10px] self-stretch px-[16px] sm:px-[30px] xl:min-h-0 xl:overflow-y-auto xl:overflow-x-hidden">
          {children}
        </main>
      </div>
    </MobileNavProvider>
  );
}
