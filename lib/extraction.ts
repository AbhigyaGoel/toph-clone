import type {
  ApplicationRecord,
  ExtractedFields,
  ExtractedValue,
  Product,
} from '@/lib/types';

/**
 * What the AI got out of a recording, and whether it is enough.
 *
 * The compliance manager's job is not to read transcripts. It is to decide,
 * quickly, whether this log will survive an inspection — and if not, what is
 * missing. Everything here serves that one question.
 */

/** The five fields, in the order a reviewer reads them. */
export const FIELD_ORDER = ['activityType', 'product', 'rate', 'field', 'weather'] as const;

export const FIELD_LABELS: Record<(typeof FIELD_ORDER)[number], string> = {
  activityType: 'Activity type',
  product: 'Product used',
  rate: 'Application rate',
  field: 'Target field',
  weather: 'Conditions',
};

/**
 * Below this, a reviewer should listen to the recording before trusting the
 * field. Set at 0.75 rather than something rounder because that is where the
 * seeded transcripts stop being confidently right — a threshold nobody can
 * point at a reason for is a threshold that gets ignored.
 */
export const LISTEN_BELOW = 0.75;

/**
 * Which of the farm's own lists a field should suggest from.
 *
 * Correcting "Product used" means naming something on the register, and
 * correcting "Target field" means naming a real block — typing either freehand
 * is how you get "Glyphosate 41%" and "glyphosate 41" filed as different
 * things. Rate and conditions are measurements, not names, so they stay open
 * text.
 */
export const FIELD_SUGGESTIONS: Partial<
  Record<(typeof FIELD_ORDER)[number], 'products' | 'fields' | 'activities'>
> = {
  activityType: 'activities',
  product: 'products',
  field: 'fields',
};

export const isUncertain = (value: ExtractedValue | undefined): boolean =>
  value?.value !== null && value?.confidence !== null && (value?.confidence ?? 1) < LISTEN_BELOW;

export type CheckState = 'pass' | 'warn' | 'na';

export interface ComplianceCheck {
  readonly id: string;
  readonly label: string;
  readonly state: CheckState;
  /** Shown under the badge when it is not a pass — what to actually do. */
  readonly detail: string;
}

/**
 * The three things an inspector looks for, per log.
 *
 * Derived from the extracted fields and the filed records rather than stored
 * alongside them. A stored badge is a second copy of the truth that drifts from
 * the first: correct the misheard product and a stored badge still says
 * "missing" until something remembers to update it. Deriving means the badge
 * cannot contradict the panel directly above it — and that correcting a field
 * turns it green on the spot, which is the whole loop.
 *
 * Either source satisfies a check. A formally filed record does, and so does a
 * product the worker named in the recording that matches the farm's register —
 * because the recording is the evidence and the register is what gives it an
 * EPA number.
 *
 * `na` is a real state, not a hidden pass. Harvesting does not need an EPA
 * registration, and showing a green tick for a rule that does not apply trains
 * people to read green as "fine" rather than as "checked".
 */
export function complianceChecks(
  extracted: ExtractedFields | null,
  records: readonly ApplicationRecord[],
  requiresProduct: boolean,
  register: readonly Product[] = []
): readonly ComplianceCheck[] {
  const chemical = records.filter((record) => record.kind === 'chemical');
  const usesProduct = requiresProduct || records.length > 0 || Boolean(extracted?.product?.value);

  // A product named in the recording counts, whether or not a formal record has
  // been filed yet. That is the point of the extraction: the words the worker
  // said are evidence, and the admin correcting a misheard product name is
  // completing the record rather than annotating a transcript.
  const named = extracted?.product?.value ?? null;
  const matched = named
    ? register.filter((product) =>
        named.toLowerCase().includes(product.name.toLowerCase().split(' ')[0])
      )
    : [];

  const epaFromRecords = chemical.length > 0 && chemical.every((record) => record.epaRegistration);
  const epaFromNamed =
    matched.length > 0 && matched.every((product) => Boolean(product.epaRegistration));
  const anyChemical = chemical.length > 0 || matched.some((product) => product.kind === 'chemical');

  const nothingCaptured = named === null && records.length === 0;

  const epa: ComplianceCheck = !usesProduct
    ? {
        id: 'epa',
        label: 'EPA registration',
        state: 'na',
        detail: 'No product was applied on this log.',
      }
    : nothingCaptured
      ? {
          // Work that owes a product record and has none is a gap, not an
          // exemption. Reading this as "not applicable" would let the worst
          // case on the farm — nobody knows what was sprayed — show up as the
          // same grey tick as a harvest.
          id: 'epa',
          label: 'EPA registration',
          state: 'warn',
          detail: 'This kind of work needs a product and none was captured.',
        }
      : !anyChemical
        ? {
            id: 'epa',
            label: 'EPA registration',
            state: 'na',
            detail: 'Nothing applied here is a registered pesticide.',
          }
        : epaFromRecords || epaFromNamed
          ? { id: 'epa', label: 'EPA registration documented', state: 'pass', detail: '' }
          : {
              id: 'epa',
              label: 'EPA registration',
              state: 'warn',
              detail: `"${named}" is not on the product register, so it has no EPA number.`,
            };

  const rateRecorded = records.length > 0 && records.every((record) => record.rate > 0);
  const rateHeard = Boolean(extracted?.rate?.value);

  const rate: ComplianceCheck = !usesProduct
    ? { id: 'rate', label: 'Application rate', state: 'na', detail: 'Nothing was applied.' }
    : rateRecorded || rateHeard
      ? { id: 'rate', label: 'Application rate', state: 'pass', detail: '' }
      : {
          id: 'rate',
          label: 'Application rate',
          state: 'warn',
          detail: 'No rate was captured from the recording and none was filed.',
        };

  // Conditions matter for a spray — drift is a wind problem — and not for
  // picking fruit, so this only asks where it can change the answer.
  const needsWeather = anyChemical || requiresProduct;
  const measured = chemical.some(
    (record) => record.windSpeedMph !== null && record.airTempF !== null
  );
  // Wind alone is not conditions; an inspector wants both numbers.
  const heard = extracted?.weather?.value ?? '';
  const weatherHeard = /\d/.test(heard) && /(mph|wind)/i.test(heard) && /°|deg|f\b/i.test(heard);

  const weather: ComplianceCheck = !needsWeather
    ? {
        id: 'weather',
        label: 'Conditions at application',
        state: 'na',
        detail: 'Only required when something is applied.',
      }
    : measured || weatherHeard
      ? { id: 'weather', label: 'Conditions at application', state: 'pass', detail: '' }
      : {
          id: 'weather',
          label: 'Conditions not recorded',
          state: 'warn',
          detail: heard
            ? `Heard "${heard}" — needs a wind speed and a temperature.`
            : 'Wind speed and temperature were not captured.',
        };

  return [epa, rate, weather];
}

/** How many of a log's checks are warnings — the number worth showing on a row. */
export const warningCount = (checks: readonly ComplianceCheck[]): number =>
  checks.filter((check) => check.state === 'warn').length;
