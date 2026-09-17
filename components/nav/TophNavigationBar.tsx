'use client';

import { LayoutGroup } from 'framer-motion';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition } from 'react';

import { signOut } from '@/app/actions/session';
import { NavButton } from '@/components/nav/NavButton';
import { NavProfile } from '@/components/nav/NavProfile';
import { NavSectionGroup } from '@/components/nav/NavSectionGroup';
import { SwitchUserDialog } from '@/components/nav/SwitchUserDialog';
import { CommandPalette } from '@/components/search/CommandPalette';
import {
  activeNavItemId,
  BADGED_NAV_ITEM_ID,
  NAV_FOOTER_ITEMS,
  NAV_SECTIONS,
  OTHER_SECTION,
} from '@/lib/data/navigation';
import type { Member, NavSection, Organization } from '@/lib/types';

interface TophNavigationBarProps {
  readonly organization: Organization;
  /** New-log count shown in the pill on the Dashboard item; 0 hides it. */
  readonly badgeCount: number;
  /** The same count, on the inbox affordance beside the farm's name. */
  readonly inboxCount: number;
  /** Everyone who can sign in here, for the Switch User picker. */
  readonly members: readonly Member[];
  readonly currentMemberId: string | null;
  readonly className?: string;
  /**
   * Namespaces the travelling highlight's `layoutId`.
   *
   * The rail is rendered twice — pinned at xl and up, and inside the drawer
   * below it — and a bare `layoutId` is global, so both copies would claim the
   * same element and the highlight would try to fly between two rails.
   */
  readonly layoutScope: string;
}

const withBadge = (section: NavSection, badgeCount: number): NavSection => ({
  ...section,
  items: section.items.map((item) =>
    item.id === BADGED_NAV_ITEM_ID && badgeCount > 0
      ? { ...item, badge: String(badgeCount) }
      : item
  ),
});


/**
 * Figma `Toph Navigation Bar` (Light Mode variant).
 *
 * Width is not declared on the component itself — it is derived from the frame:
 * 1676 root - 20 padding - 10 gap - 1366 main column = 280px.
 */
export function TophNavigationBar({
  organization,
  badgeCount,
  inboxCount,
  members,
  currentMemberId,
  className = '',
  layoutScope,
}: TophNavigationBarProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [, startSignOut] = useTransition();
  const pathname = usePathname();
  const router = useRouter();

  // Derived from the URL rather than declared on the item, so the rail cannot
  // disagree with the page it is sitting next to.
  const settledId = useMemo(() => activeNavItemId(pathname), [pathname]);

  /**
   * Where the user has asked to go, before the server has said anything.
   *
   * `usePathname` only changes once the navigation commits, which on these
   * dynamic routes is a few hundred milliseconds after the click. Marking the
   * destination active on that signal alone means the rail sits there looking
   * unchanged for the whole trip — the single clearest way to make an app feel
   * broken. This is set on the click and cleared when the URL agrees with it.
   */
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    setPendingId((current) => (current === settledId ? null : current));
  }, [settledId]);

  const activeId = pendingId ?? settledId;
  const highlightedId = hoveredId ?? activeId;

  const footerActions: Record<string, () => void> = {
    'switch-user': () => setSwitching(true),
    'log-out': () =>
      startSignOut(async () => {
        await signOut();
        router.replace('/sign-in');
      }),
  };

  return (
    <LayoutGroup id={layoutScope}>
      <nav
        className={`nav-gradient-border flex h-full w-[280px] shrink-0 flex-col gap-[10px] self-stretch rounded-[16px] p-[10px] ${className}`}
        onMouseLeave={() => setHoveredId(null)}
      >
        <NavProfile organization={organization} inboxCount={inboxCount} />

        {/*
          Under the farm's identity and above the sections, which is where a
          global search belongs: it reaches every item below it. It was briefly
          in the page header and sat directly beside the Dashboard's own search
          field — two search boxes an inch apart, each doing a different thing,
          which is worse than either alone. That one filters the table you are
          looking at; this one finds the thing you are not.
        */}
        <CommandPalette />

        {NAV_SECTIONS.map((section) => (
          <NavSectionGroup
            key={section.id}
            section={withBadge(section, badgeCount)}
            highlightedId={highlightedId}
            activeId={activeId}
            onHover={setHoveredId}
            onNavigate={setPendingId}
          />
        ))}

        <NavSectionGroup
          section={OTHER_SECTION}
          fillRemainingHeight
          highlightedId={highlightedId}
          activeId={activeId}
          onHover={setHoveredId}
          onNavigate={setPendingId}
        />

        {NAV_FOOTER_ITEMS.map((item) => (
          <NavButton
            key={item.id}
            item={item}
            highlighted={item.id === highlightedId}
            active={false}
            onHover={setHoveredId}
            onSelect={footerActions[item.id]}
          />
        ))}
      </nav>

      <SwitchUserDialog
        open={switching}
        onClose={() => setSwitching(false)}
        members={members}
        currentMemberId={currentMemberId}
      />
    </LayoutGroup>
  );
}
