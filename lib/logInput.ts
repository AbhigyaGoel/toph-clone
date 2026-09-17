import { z } from 'zod';

/**
 * Validation for the log form, shared by create and update.
 *
 * Lives outside the action files because both use it and because a `'use server'`
 * module may only export async functions — a schema exported from one would be
 * a build error.
 *
 * Dates and times are validated as calendar values and combined into UTC
 * instants. That pairing is deliberate: `lib/format.ts` renders every timestamp
 * in UTC so a shift recorded as 6:00 AM reads as 6:00 AM everywhere, and the
 * form has to write back on the same terms or editing a log would shift it by
 * the editor's offset.
 */

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Whether a `YYYY-MM-DD` string names a day that actually exists.
 *
 * `Date.parse` is not a validator here: it rolls impossible days forward rather
 * than failing, so "2024-02-30" parses happily and comes back as 1 March. A log
 * submitted for 30 February would then be stored two days later than it was
 * entered, with nothing reported. Round-tripping the parsed value back to its
 * components is what catches that.
 */
function isRealDate(value: string): boolean {
  const [year, month, day] = value.split('-').map(Number);
  const at = new Date(Date.UTC(year, month - 1, day));

  return (
    at.getUTCFullYear() === year && at.getUTCMonth() === month - 1 && at.getUTCDate() === day
  );
}

export const logInputSchema = z
  .object({
    employeeId: z.string().uuid(),
    activityTypeId: z.string().uuid(),
    fieldId: z.string().uuid(),
    date: z.string().regex(DATE, 'Pick a date.'),
    startTime: z.string().regex(TIME, 'Start time must be HH:MM.'),
    endTime: z.string().regex(TIME, 'End time must be HH:MM.'),
    status: z.enum(['new', 'reviewed']),
  })
  .refine((value) => isRealDate(value.date), {
    message: 'That date does not exist.',
    path: ['date'],
  })
  .refine((value) => value.endTime > value.startTime, {
    message: 'The shift has to end after it starts.',
    path: ['endTime'],
  });

export type ValidatedLogInput = z.infer<typeof logInputSchema>;

/** The two instants the database stores, built from the form's three fields. */
export function toInstants(input: ValidatedLogInput): {
  readonly startedAt: string;
  readonly endedAt: string;
} {
  return {
    startedAt: new Date(`${input.date}T${input.startTime}:00Z`).toISOString(),
    endedAt: new Date(`${input.date}T${input.endTime}:00Z`).toISOString(),
  };
}

/** The first validation message, for showing next to the form. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Check the form and try again.';
}
