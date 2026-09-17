import { FIELD_LABELS, type FIELD_ORDER } from '@/lib/extraction';
import type { ExtractedFields } from '@/lib/types';

/**
 * What this farm has taught the extractor.
 *
 * Every inline correction is a labelled example: the machine heard X, a person
 * who knows the farm said it was Y. The product already collects these — the
 * correction has to be stored or the record would not be fixed — and until now
 * it did nothing with them beyond marking the field as human-checked.
 *
 * That is the flywheel worth showing. A farm's vocabulary is small, closed and
 * strange: eleven blocks with invented names, a dozen products whose labels are
 * chemistry rather than English. A general speech model will mishear them the
 * same way forever, and no amount of a better general model fixes "Field K"
 * being heard as "field kay". The farm already knows the answer, and the tenth
 * correction of the same mistake is the product failing to learn something it
 * was told nine times.
 *
 * The lookup below is deliberately an exact match on the string the machine
 * produced, not phonetic matching. It is the version that cannot be wrong: if
 * the extractor emits exactly what a person has already corrected on this farm,
 * apply the correction. Fuzzy matching would start guessing, which is the
 * behaviour this whole screen exists to reduce.
 */

export interface VocabularyVariant {
  readonly heard: string;
  readonly count: number;
}

/**
 * The three fields that hold *terms* rather than measurements.
 *
 * A rate and a weather note are free text: "0.5 gal/acre" and "wind light" are
 * things somebody said, not names this farm has for things. Including them made
 * the panel list every rate the farm has ever applied as vocabulary — and it
 * would let the extractor substitute one person's sentence for another's, which
 * is exactly the failure this feature exists to prevent.
 */
const TERM_FIELDS = ['activityType', 'product', 'field'] as const;

export interface VocabularyTerm {
  /** The value a person typed — the farm's own name for the thing. */
  readonly term: string;
  /** Which extracted field it belongs to: product, field, activity. */
  readonly field: (typeof FIELD_ORDER)[number];
  readonly fieldLabel: string;
  readonly corrections: number;
  /** What the machine produced instead, commonest first. */
  readonly variants: readonly VocabularyVariant[];
  /**
   * Mean confidence the extractor reported on this term when it got it right.
   *
   * Null when it has never produced the term unprompted, which is itself the
   * finding — a term the machine has never once heard correctly.
   */
  readonly confidence: number | null;
}

/** One log's extracted fields, as the aggregation needs them. */
export interface VocabularySource {
  readonly logId: string;
  readonly extracted: ExtractedFields | null;
}

/**
 * Rolls every correction on the farm into a list of learned terms.
 *
 * Corrections *and* clean readings are walked: the clean ones supply the
 * confidence figure, so a term can show that it is now recognised well.
 */
export function buildVocabulary(sources: readonly VocabularySource[]): readonly VocabularyTerm[] {
  const terms = new Map<
    string,
    {
      term: string;
      field: (typeof FIELD_ORDER)[number];
      corrections: number;
      variants: Map<string, number>;
      confidences: number[];
    }
  >();

  const touch = (term: string, field: (typeof FIELD_ORDER)[number]) => {
    const key = `${field}:${term.toLowerCase()}`;
    const held = terms.get(key);
    if (held) return held;
    const made = { term, field, corrections: 0, variants: new Map<string, number>(), confidences: [] };
    terms.set(key, made);
    return made;
  };

  for (const source of sources) {
    if (!source.extracted) continue;

    for (const field of TERM_FIELDS) {
      const entry = source.extracted[field];
      const value = entry?.value;
      if (!value) continue;

      const row = touch(value, field);

      if (entry?.corrected) {
        row.corrections += 1;
        // A correction from nothing teaches the vocabulary no alias — the
        // machine did not mishear the term, it never produced one.
        const heard = entry.original?.trim();
        if (heard) row.variants.set(heard, (row.variants.get(heard) ?? 0) + 1);
      } else if (typeof entry?.confidence === 'number') {
        row.confidences.push(entry.confidence);
      }
    }
  }

  return [...terms.values()]
    .filter((row) => row.corrections > 0 || row.confidences.length > 0)
    .map((row) => ({
      term: row.term,
      field: row.field,
      fieldLabel: FIELD_LABELS[row.field],
      corrections: row.corrections,
      variants: [...row.variants.entries()]
        .map(([heard, count]) => ({ heard, count }))
        .sort((a, b) => b.count - a.count || a.heard.localeCompare(b.heard)),
      confidence:
        row.confidences.length > 0
          ? Math.round(
              (row.confidences.reduce((sum, one) => sum + one, 0) / row.confidences.length) * 100
            ) / 100
          : null,
    }))
    .sort((a, b) => b.corrections - a.corrections || a.term.localeCompare(b.term));
}

/**
 * The correction map the extractor consults: what was heard → what it is.
 *
 * Only aliases a person has actually corrected, lower-cased for the lookup. A
 * term corrected once is enough — the farm said so, and there is no threshold at
 * which a grower's own name for their own block becomes more true.
 */
export function correctionMap(
  vocabulary: readonly VocabularyTerm[]
): ReadonlyMap<string, string> {
  const map = new Map<string, string>();

  for (const term of vocabulary) {
    for (const variant of term.variants) {
      const key = variant.heard.trim().toLowerCase();
      // First writer wins, and the list arrives sorted by correction count, so
      // an alias claimed by two terms resolves to the better-attested one.
      if (!map.has(key)) map.set(key, term.term);
    }
  }

  return map;
}

/**
 * Applies the farm's vocabulary to a freshly extracted value.
 *
 * Exact match only. Returns the value unchanged when nothing is known about it,
 * which is the overwhelmingly common case and has to stay free.
 */
export function applyVocabulary(
  value: string | null,
  corrections: ReadonlyMap<string, string>
): string | null {
  if (!value) return value;
  return corrections.get(value.trim().toLowerCase()) ?? value;
}
