/**
 * Rates that are real but unusual.
 *
 * Every other exception in this product is an *absence* — a product nobody
 * named, a record nobody filed, audio nobody could make out. This one is
 * different in kind: the number is there, it is legible, a person typed it, and
 * it is still probably wrong. Nothing else on the dashboard can catch that,
 * because catching it means knowing what this applicator normally does with
 * this product, which is knowledge the farm has and no single row contains.
 *
 * Why it matters more than it looks: an over-application is a label violation
 * and a residue risk before it is a cost. Four times the usual rate of an
 * insecticide a week before harvest is the kind of thing that fails a residue
 * test months later, when nobody can remember the pass. And the honest failure
 * mode of a voice pipeline is not mishearing "point five" as nothing — it is
 * mishearing it as "two".
 *
 * Deliberately per-person, not per-farm. Applicators run different equipment on
 * different blocks; the useful comparison is against what *this* person has
 * done with *this* product, which is also the comparison they can argue with.
 */

/** Outside this band of the applicator's own average, a rate is worth a look. */
export const HIGH_MULTIPLE = 1.5;
export const LOW_MULTIPLE = 0.5;

/**
 * Fewer than this many past applications and there is no "usual" to compare to.
 *
 * Three is the smallest number that can establish a habit rather than a
 * coincidence. Flagging someone's second-ever pass against their first would be
 * noise wearing the costume of an insight.
 */
export const MIN_HISTORY = 3;

export interface RateObservation {
  readonly applicationId: string;
  readonly logId: string;
  readonly employeeId: string;
  readonly employeeName: string;
  readonly productId: string;
  readonly productName: string;
  readonly rateUnit: string | null;
  readonly rate: number;
  readonly appliedAt: string;
  readonly fieldName: string;
}

export interface RateAnomaly {
  readonly applicationId: string;
  readonly logId: string;
  readonly employeeName: string;
  readonly productName: string;
  readonly fieldName: string;
  readonly appliedAt: string;
  readonly rate: number;
  readonly average: number;
  readonly rateUnit: string | null;
  /** How many of their own past passes the average is drawn from. */
  readonly sampleSize: number;
  /** `rate / average`, so 4.0 reads as "four times". */
  readonly multiple: number;
  readonly direction: 'high' | 'low';
}

/**
 * Compares each application against the same person's earlier ones.
 *
 * Only *earlier* ones. Including the outlier in its own baseline drags the
 * average towards it and shrinks the very deviation being measured — with six
 * passes, one at four times the rest, a naive mean flags it at 2.4x instead of
 * 4x. It also makes the result depend on how much history happens to exist
 * after the event, which would mean the same log flagged differently on
 * different days.
 */
export function findRateAnomalies(
  observations: readonly RateObservation[]
): readonly RateAnomaly[] {
  const byPerson = new Map<string, RateObservation[]>();

  for (const observation of observations) {
    const key = `${observation.employeeId}:${observation.productId}`;
    const bucket = byPerson.get(key);
    if (bucket) bucket.push(observation);
    else byPerson.set(key, [observation]);
  }

  const found: RateAnomaly[] = [];

  for (const bucket of byPerson.values()) {
    const ordered = [...bucket].sort((a, b) => a.appliedAt.localeCompare(b.appliedAt));

    for (let index = 0; index < ordered.length; index += 1) {
      const current = ordered[index];
      const history = ordered.slice(0, index).filter((one) => one.rate > 0);
      if (history.length < MIN_HISTORY || current.rate <= 0) continue;

      const average = history.reduce((sum, one) => sum + one.rate, 0) / history.length;
      if (average <= 0) continue;

      const multiple = current.rate / average;
      if (multiple < HIGH_MULTIPLE && multiple > LOW_MULTIPLE) continue;

      found.push({
        applicationId: current.applicationId,
        logId: current.logId,
        employeeName: current.employeeName,
        productName: current.productName,
        fieldName: current.fieldName,
        appliedAt: current.appliedAt,
        rate: current.rate,
        average: Math.round(average * 1000) / 1000,
        rateUnit: current.rateUnit,
        sampleSize: history.length,
        multiple: Math.round(multiple * 10) / 10,
        direction: multiple >= HIGH_MULTIPLE ? 'high' : 'low',
      });
    }
  }

  return found.sort((a, b) => b.appliedAt.localeCompare(a.appliedAt));
}

/** "4x above his average" / "half his usual" — wording a person would use. */
export function describeAnomaly(anomaly: RateAnomaly): string {
  const unit = anomaly.rateUnit ? ` ${anomaly.rateUnit}` : '';
  const usual = `${anomaly.average}${unit}`;

  return anomaly.direction === 'high'
    ? `${anomaly.rate}${unit} — ${anomaly.multiple}x the ${usual} they normally apply`
    : `${anomaly.rate}${unit} — under half the ${usual} they normally apply`;
}
