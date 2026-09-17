import type { CheckboxState } from '@/components/ui/Checkbox';

/**
 * Row selection, as pure functions over a readonly list of ids.
 *
 * Selection is deliberately *not* in the URL, unlike search and the filters. It
 * is a scratch gesture — you tick rows, act on them, and the selection is spent.
 * Putting it in the address bar would make it survive a refresh, which is
 * exactly wrong for a destructive-ish bulk action, and would make every tick a
 * navigation.
 *
 * Every function returns a new array; none mutates its input.
 */

export type Selection = readonly string[];

export const isSelected = (selection: Selection, id: string): boolean => selection.includes(id);

export const toggle = (selection: Selection, id: string): Selection =>
  selection.includes(id) ? selection.filter((item) => item !== id) : [...selection, id];

/** Adds every id in the range without disturbing selections outside it. */
export const selectRange = (selection: Selection, ids: Selection): Selection => [
  ...selection,
  ...ids.filter((id) => !selection.includes(id)),
];

/**
 * The ids between two rows inclusive, in table order.
 *
 * Returns an empty range when either anchor has scrolled out of the current
 * result set, which happens if a filter changed between the two clicks.
 */
export function rangeBetween(ordered: Selection, from: string, to: string): Selection {
  const start = ordered.indexOf(from);
  const end = ordered.indexOf(to);

  if (start === -1 || end === -1) return [];

  return start <= end ? ordered.slice(start, end + 1) : ordered.slice(end, start + 1);
}

/** The header checkbox reflects the whole visible page, not the whole table. */
export function headerState(selection: Selection, visible: Selection): CheckboxState {
  if (visible.length === 0) return 'unchecked';

  const selectedHere = visible.filter((id) => selection.includes(id)).length;

  if (selectedHere === 0) return 'unchecked';
  return selectedHere === visible.length ? 'checked' : 'indeterminate';
}

/** Select-all toggles only the rows currently on screen. */
export function toggleAll(selection: Selection, visible: Selection): Selection {
  return headerState(selection, visible) === 'checked'
    ? selection.filter((id) => !visible.includes(id))
    : selectRange(selection, visible);
}

/** Drops ids that the current query no longer returns. */
export const prune = (selection: Selection, visible: Selection): Selection =>
  selection.filter((id) => visible.includes(id));
