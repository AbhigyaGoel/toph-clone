import { z } from 'zod';

/**
 * Validation shared by the four reference collections.
 *
 * Employees, fields, activity types and tags are all "a name, unique within its
 * scope", so they validate identically. The character set matches the filter
 * values in `lib/logQuery.ts`: these names *become* filter values the moment a
 * log references them, and a name that could not survive a round trip through
 * the URL would be a name you could create but never filter by.
 */

export const REFERENCE_NAME_MAX = 60;

export const referenceNameSchema = z
  .string()
  .transform((value) => value.replace(/\s+/g, ' ').trim())
  .pipe(
    z
      .string()
      .min(1, 'Give it a name.')
      .max(REFERENCE_NAME_MAX, `Keep it under ${REFERENCE_NAME_MAX} characters.`)
      .regex(/^[\p{L}\p{N} '&/.\-_]+$/u, 'Names use letters, numbers and spaces.')
  );

/**
 * Where a new field sits on the satellite tile, in the design's 594x335 space.
 *
 * `fields.map_plot` is `not null` and the management screen does not draw a map
 * editor, so a new field gets a centred placeholder plot. It is honest about
 * being a placeholder rather than inventing coordinates that look surveyed, and
 * it keeps the expanded panel's map renderable for logs on that field.
 */
export const DEFAULT_MAP_PLOT = { x: 210, y: 110, width: 174, height: 115 } as const;

/** Postgres's foreign-key violation, raised when a referenced row is deleted. */
export const FOREIGN_KEY_VIOLATION = '23503';

/** Postgres's unique violation, raised when a name is already taken. */
export const UNIQUE_VIOLATION = '23505';

/** Wording for a delete blocked by rows that still point at it. */
export function inUseMessage(label: string, count: number): string {
  const plural = count === 1 ? 'log' : 'logs';
  return `${label} is used by ${count} ${plural}. Reassign or delete ${
    count === 1 ? 'it' : 'them'
  } first.`;
}
