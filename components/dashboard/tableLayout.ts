/**
 * Shared geometry for the log table.
 *
 * The header row and every body row are the same Figma auto-layout frame
 * (`layout_2SDVJG`), so the column widths only stay aligned if both use the same
 * class strings. They live here rather than being duplicated in two components.
 */

/**
 * Figma `layout_2SDVJG` — the row track itself.
 *
 * The frame records `gap: 30px` alongside `justifyContent: space-between`, but
 * Figma ignores item spacing in space-between mode. Since the five data columns
 * are all set to fill, there is no free space left to distribute either — so the
 * columns sit flush and the correct CSS is no gap at all. Honouring the recorded
 * 30px instead pushes every column 30px right of the design.
 *
 * The minimum width is the narrowest track at which the widest cell text
 * ("6:00 AM - 10:40 AM") still fits its column; below it the table scrolls
 * sideways inside the panel rather than wrapping or dropping columns.
 */
export const TABLE_ROW = 'flex min-w-[900px] items-center justify-between self-stretch px-[20px]';

/** Figma `layout_D337MK` — the leading checkbox cell (hugs its 16px glyph). */
export const TABLE_SELECT_CELL = 'flex items-center gap-[10px] px-[20px]';

/** Figma `layout_46KCD2` — the five equal-width data columns. */
export const TABLE_DATA_CELL = 'flex flex-1 items-center gap-[10px] px-[10px] py-[20px]';

/**
 * Figma `layout_PRKICK` — a fixed 92x58 cell. Its padding is narrower than the
 * button it holds, so the button overflows symmetrically; that is the design's
 * behaviour and is why the child is marked `shrink-0`.
 */
export const TABLE_ACTION_CELL =
  'flex h-[58px] w-[92px] shrink-0 items-center justify-center gap-[10px] px-[30px] py-[20px]';

/** Column headings, in design order. */
export const TABLE_COLUMNS = ['EMPLOYEE', 'ACTIVITY', 'DATE', 'FIELD', 'TIME'] as const;
