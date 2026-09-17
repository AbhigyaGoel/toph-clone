import { z } from 'zod';

/**
 * What the "record a product" form submits.
 *
 * Rate is the only required number: a farm that knows it sprayed but has lost
 * the treated area should still be able to file the record and have the Audit
 * Manager tell them it is incomplete. Refusing the write would leave the gap
 * looking identical to "nothing happened here", which is worse for an audit
 * than an honest partial record.
 */
export const applicationInputSchema = z.object({
  logId: z.string().uuid(),
  productId: z.string().uuid(),
  rate: z.coerce.number().positive().max(100_000),
  areaAcres: z.coerce.number().positive().max(1_000_000).nullable(),
  // Wind is bounded by "nobody sprays in this"; the upper end is a typo guard,
  // not meteorology.
  windSpeedMph: z.coerce.number().min(0).max(120).nullable(),
  airTempF: z.coerce.number().min(-60).max(150).nullable(),
});

export type ApplicationInput = z.infer<typeof applicationInputSchema>;

/**
 * Turns an empty form field into null rather than into 0.
 *
 * `Number('')` is 0, which would quietly record a spray at zero gallons per acre
 * or a still day at 0 mph. Absent and zero are different claims, and on a
 * compliance record the difference is the whole point.
 */
export const optionalNumber = (value: string): number | null => {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

/** The first validation problem, phrased for the form. */
export function firstApplicationIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return 'That record could not be saved.';

  const field = String(issue.path[0] ?? '');
  const messages: Record<string, string> = {
    productId: 'Pick a product.',
    rate: 'Enter the rate applied, as a number greater than zero.',
    areaAcres: 'Treated area must be a number greater than zero.',
    windSpeedMph: 'Wind speed must be between 0 and 120 mph.',
    airTempF: 'Air temperature must be between -60 and 150 °F.',
  };

  return messages[field] ?? 'That record could not be saved.';
}
