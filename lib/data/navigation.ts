import type { NavItem, NavSection } from '@/lib/types';

/**
 * The navigation rail is application chrome, not data: the pages it links to
 * are fixed by the product, so the list stays in code. The one dynamic piece —
 * the count pill on Dashboard — is supplied by `TophNavigationBar` from the
 * database's new-log count.
 *
 * `href` is the route each item owns. The active item is derived from the
 * current path rather than declared here, so there is one source of truth for
 * "where am I" and it cannot drift from the URL.
 */

/** The three labelled groups of the navigation rail, in design order. */
export const NAV_SECTIONS: readonly NavSection[] = [
  {
    id: 'overview',
    label: 'OVERVIEW',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: 'chart-line', href: '/' },
      { id: 'activity-logs', label: 'Activity Logs', icon: 'audio-lines', href: '/activity-logs' },
      { id: 'map', label: 'Map', icon: 'map', href: '/map' },
    ],
  },
  {
    id: 'compliance',
    label: 'COMPLIANCE',
    items: [
      { id: 'audit-manager', label: 'Audit Manager', icon: 'book-check', href: '/audit-manager' },
      { id: 'reports', label: 'Reports', icon: 'files', href: '/reports' },
    ],
  },
  {
    id: 'team-management',
    label: 'TEAM MANAGEMENT',
    items: [
      { id: 'employees', label: 'Employees', icon: 'users', href: '/employees' },
      { id: 'performance', label: 'Performance', icon: 'chart-pie', href: '/performance' },
    ],
  },
];

/**
 * The nav item that carries the new-log count pill — now nothing.
 *
 * The Figma puts a count on Dashboard, and that was right when the dashboard was
 * the only place unread logs were dealt with. The inbox affordance above this
 * list now carries the same number, and two identical badges 150px apart is a
 * reader working out whether they mean different things. The count sits on the
 * control that acts on it.
 */
export const BADGED_NAV_ITEM_ID: string | null = null;

/**
 * "OTHER" is a section like the three above, but its Figma frame is the one set
 * to fill the remaining height, which is what pushes the two trailing buttons to
 * the bottom of the rail. It is kept separate so that layout intent stays
 * explicit rather than hiding in a positional check.
 */
export const OTHER_SECTION: NavSection = {
  id: 'other',
  label: 'OTHER',
  items: [
    { id: 'settings', label: 'Settings', icon: 'cog', href: '/settings' },
  ],
};

/**
 * Ungrouped buttons pinned below the "OTHER" section.
 *
 * No `href`: these act on the session rather than navigating, so they stay
 * buttons. A link that does not go anywhere is a worse lie than a button that
 * does something.
 */
export const NAV_FOOTER_ITEMS: readonly NavItem[] = [
  { id: 'switch-user', label: 'Switch User', icon: 'arrow-right-left' },
  { id: 'log-out', label: 'Log Out', icon: 'log-out' },
];

/** Every route the rail links to, for the active-item lookup and for tests. */
export const NAV_ROUTES: readonly string[] = [...NAV_SECTIONS, OTHER_SECTION]
  .flatMap((section) => section.items)
  .map((item) => item.href)
  .filter((href): href is string => Boolean(href));

/**
 * The rail item that owns a path.
 *
 * Longest match wins, so `/activity-logs` is not claimed by `/`. Sub-paths of a
 * section (a future `/employees/<id>`) keep that section lit.
 */
export function activeNavItemId(pathname: string): string | null {
  let match: { id: string; length: number } | null = null;

  for (const section of [...NAV_SECTIONS, OTHER_SECTION]) {
    for (const item of section.items) {
      if (!item.href) continue;

      const owns = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
      if (owns && (!match || item.href.length > match.length)) {
        match = { id: item.id, length: item.href.length };
      }
    }
  }

  return match?.id ?? null;
}
