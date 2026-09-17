import { NAV_SECTIONS } from '@/lib/data/navigation';
import type { IconName } from '@/components/ui/Icon';
import type { SearchHit, SearchKind } from '@/lib/types';

/**
 * Where a result goes, and what it looks like on the way.
 *
 * Routing lives here rather than in the search function because a hit is a
 * *thing*, not a page: a worker has no page of their own, so choosing them
 * means filtering the log list by their name. Putting that decision in SQL
 * would make the database responsible for the information architecture, and it
 * would have to change every time a screen moved.
 */

export interface PaletteItem {
  readonly id: string;
  readonly label: string;
  readonly sublabel: string;
  readonly icon: IconName;
  readonly href: string;
  /** Grouping header in the list. */
  readonly group: string;
}

const KIND_ICON: Record<SearchKind, IconName> = {
  log: 'audio-lines',
  worker: 'users',
  field: 'map',
  product: 'files',
  tag: 'star',
  activity: 'list-filter',
};

const KIND_GROUP: Record<SearchKind, string> = {
  log: 'Logs',
  worker: 'Workers',
  field: 'Fields',
  product: 'Products',
  tag: 'Tags',
  activity: 'Activities',
};

/**
 * A hit's destination.
 *
 * Note what each one actually does. Choosing a worker does not open a profile —
 * there is no such screen and inventing one would be a worse answer than the
 * true one, which is "here is everything they have logged". Choosing a log
 * opens it in place on the dashboard, the same URL a shared link would use.
 */
function hrefFor(hit: SearchHit): string {
  const name = encodeURIComponent(hit.label);

  switch (hit.kind) {
    case 'log':
      return `/?range=all&open=${hit.id}`;
    case 'worker':
      return `/activity-logs?range=all&employee=${name}`;
    case 'field':
      return `/activity-logs?range=all&field=${name}`;
    case 'tag':
      return `/activity-logs?range=all&tag=${name}`;
    case 'activity':
      return `/activity-logs?range=all&activity=${name}`;
    case 'product':
      // The register is on Settings, and the product's own row is the thing
      // worth arriving at rather than the top of the page.
      return `/settings#product-${hit.id}`;
  }
}

export const toPaletteItem = (hit: SearchHit): PaletteItem => ({
  id: `${hit.kind}:${hit.id}`,
  label: hit.label,
  sublabel: hit.sublabel,
  icon: KIND_ICON[hit.kind],
  href: hrefFor(hit),
  group: KIND_GROUP[hit.kind],
});

/**
 * The screens, as palette items.
 *
 * Matched in the browser and never sent to the server: thirteen fixed strings
 * are not worth a round trip, and a palette that cannot offer "Settings"
 * instantly feels slower than the rail it is meant to replace.
 */
const SCREENS: readonly PaletteItem[] = [
  ...NAV_SECTIONS.flatMap((section) =>
    section.items.map((item) => ({
      id: `screen:${item.id}`,
      label: item.label,
      sublabel: 'Screen',
      icon: item.icon,
      href: item.href ?? '/',
      group: 'Go to',
    }))
  ),
  { id: 'screen:settings', label: 'Settings', sublabel: 'Screen', icon: 'cog', href: '/settings', group: 'Go to' },
  { id: 'screen:support', label: 'Support', sublabel: 'Screen', icon: 'handshake', href: '/support', group: 'Go to' },
];

/**
 * Screens matching a query, best first.
 *
 * A prefix match outranks a match in the middle, because someone typing "ma"
 * means Map before Audit Manager. Beyond that the list is short enough that
 * ordering barely matters, which is why this is nine lines and not a fuzzy
 * matching library.
 */
export function matchScreens(query: string): readonly PaletteItem[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return SCREENS;

  return SCREENS.filter((item) => item.label.toLowerCase().includes(needle)).sort((a, b) => {
    const aPrefix = a.label.toLowerCase().startsWith(needle);
    const bPrefix = b.label.toLowerCase().startsWith(needle);
    if (aPrefix !== bPrefix) return aPrefix ? -1 : 1;
    return a.label.localeCompare(b.label);
  });
}

/** Items grouped in the order the groups first appear. */
export function groupItems(
  items: readonly PaletteItem[]
): readonly { readonly group: string; readonly items: readonly PaletteItem[] }[] {
  const order: string[] = [];
  const byGroup = new Map<string, PaletteItem[]>();

  for (const item of items) {
    const existing = byGroup.get(item.group);
    if (existing) existing.push(item);
    else {
      order.push(item.group);
      byGroup.set(item.group, [item]);
    }
  }

  return order.map((group) => ({ group, items: byGroup.get(group) ?? [] }));
}
