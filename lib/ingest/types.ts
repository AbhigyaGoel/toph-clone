import { z } from 'zod';

/** What a transcription provider returns. */
export interface Transcription {
  readonly text: string;
  /** 0–1. Providers that do not report one should estimate, not invent 1.0. */
  readonly confidence: number;
  /** BCP-47-ish, e.g. `en`, `es`. */
  readonly language: string;
  readonly durationSeconds: number;
}

/**
 * The structured log an extractor pulls out of a transcript.
 *
 * Every field is nullable because a real voice log frequently does not contain
 * it — the worker says "sprayed field K this morning" and never mentions the
 * rate. Nulls flow through to the Audit Manager as gaps, which is the correct
 * outcome; guessing would put invented numbers on a compliance record.
 */
export const extractionSchema = z.object({
  activity: z.string().max(80).nullable(),
  field: z.string().max(80).nullable(),
  /** `HH:MM` 24h, UTC, as spoken ("started at six"). */
  startTime: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  product: z.string().max(80).nullable(),
  rate: z.number().positive().max(100_000).nullable(),
  rateUnit: z.string().max(24).nullable(),
  areaAcres: z.number().positive().max(1_000_000).nullable(),
  windSpeedMph: z.number().min(0).max(120).nullable(),
  airTempF: z.number().min(-60).max(150).nullable(),
  notes: z.string().max(2000).nullable(),
});

export type Extraction = z.infer<typeof extractionSchema>;

export const EMPTY_EXTRACTION: Extraction = {
  activity: null,
  field: null,
  startTime: null,
  endTime: null,
  product: null,
  rate: null,
  rateUnit: null,
  areaAcres: null,
  windSpeedMph: null,
  airTempF: null,
  notes: null,
};

export interface Transcriber {
  readonly name: string;
  transcribe(audio: Blob, hintLanguage?: string): Promise<Transcription>;
}

export interface Extractor {
  readonly name: string;
  /** Vocabularies are passed in so the model picks existing rows, not synonyms. */
  extract(transcript: string, vocabulary: Vocabulary): Promise<Extraction>;
}

/** The farm's own words, so extraction resolves to rows rather than free text. */
export interface Vocabulary {
  readonly activities: readonly string[];
  readonly fields: readonly string[];
  readonly products: readonly string[];
  /**
   * What this farm has already corrected: lower-cased mishearing → real term.
   *
   * Applied after extraction rather than fed to the model, so it holds whether
   * the LLM ran or the offline parser did — and so a farm that has taught the
   * system "field kay" means FIELD K gets that correction even with no API key.
   */
  readonly corrections: ReadonlyMap<string, string>;
}
