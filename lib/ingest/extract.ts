import 'server-only';

import { logger } from '@/lib/logger';
import { applyVocabulary } from '@/lib/vocabulary';
import {
  EMPTY_EXTRACTION,
  extractionSchema,
  type Extraction,
  type Extractor,
  type Vocabulary,
} from '@/lib/ingest/types';

/**
 * Transcript to structured log.
 *
 * An LLM when a key is present, a deterministic parser when not. The parser is
 * not a toy: the guided voice log asks fixed questions in a fixed order, so the
 * answers are findable without a model, and it is what keeps the pipeline
 * testable and the demo honest.
 */

const CHAT_URL = 'https://api.openai.com/v1/chat/completions';

const SYSTEM = `You extract structured farm work logs from a worker's spoken recording.
Return ONLY the fields you are confident about. Use null for anything the worker did not say.
Never guess a rate, an area, or weather. Never invent an activity or field that is not in the supplied lists.
Times are 24-hour UTC "HH:MM". The recording may be in Spanish or English; reply with English field names and the list values as given.`;

const responseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    activity: { type: ['string', 'null'] },
    field: { type: ['string', 'null'] },
    startTime: { type: ['string', 'null'] },
    endTime: { type: ['string', 'null'] },
    product: { type: ['string', 'null'] },
    rate: { type: ['number', 'null'] },
    rateUnit: { type: ['string', 'null'] },
    areaAcres: { type: ['number', 'null'] },
    windSpeedMph: { type: ['number', 'null'] },
    airTempF: { type: ['number', 'null'] },
    notes: { type: ['string', 'null'] },
  },
  required: [
    'activity',
    'field',
    'startTime',
    'endTime',
    'product',
    'rate',
    'rateUnit',
    'areaAcres',
    'windSpeedMph',
    'airTempF',
    'notes',
  ],
} as const;

const openai = (apiKey: string): Extractor => ({
  name: 'openai:gpt-4o-mini',
  async extract(transcript, vocabulary) {
    const response = await fetch(CHAT_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_EXTRACT_MODEL ?? 'gpt-4o-mini',
        temperature: 0,
        messages: [
          { role: 'system', content: SYSTEM },
          {
            role: 'user',
            content: [
              `Activities: ${vocabulary.activities.join(', ') || '(none)'}`,
              `Fields: ${vocabulary.fields.join(', ') || '(none)'}`,
              `Products: ${vocabulary.products.join(', ') || '(none)'}`,
              '',
              'Transcript:',
              transcript,
            ].join('\n'),
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'work_log', strict: true, schema: responseSchema },
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`extract ${response.status}`);
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new Error('extract: empty response');

    // Still validated locally: a strict schema is the model's promise, not a
    // guarantee, and this value goes on to become a compliance record.
    return extractionSchema.parse(JSON.parse(content));
  },
});

/** Matches a spoken phrase against the farm's own list, case- and space-loose. */
function findInVocabulary(text: string, options: readonly string[]): string | null {
  const haystack = text.toLowerCase();
  const hits = options.filter((option) => haystack.includes(option.toLowerCase()));
  if (hits.length === 0) return null;
  // Longest wins: "FIELD K" should not be beaten by a bare "field".
  return hits.reduce((longest, option) => (option.length > longest.length ? option : longest));
}

const NUMBER = '(\\d+(?:\\.\\d+)?)';

function firstNumber(text: string, patterns: readonly RegExp[]): number | null {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) {
      const value = Number(match[1]);
      if (Number.isFinite(value)) return value;
    }
  }
  return null;
}

/**
 * The deterministic path.
 *
 * Reads the guided log's shape: it asks what activity, where, and anything else
 * to record, so those answers appear near known vocabulary. Numbers are only
 * taken when a unit is spoken next to them, because "about forty crates" is not
 * an acre count.
 */
const heuristic: Extractor = {
  name: 'heuristic',
  async extract(transcript, vocabulary) {
    const text = transcript.replace(/\s+/g, ' ');
    const lower = text.toLowerCase();

    const rate = firstNumber(lower, [
      new RegExp(`${NUMBER}\\s*(?:gal|gallons?)\\s*(?:per|/)\\s*acre`),
      new RegExp(`${NUMBER}\\s*(?:lb|lbs|pounds?)\\s*(?:per|/)\\s*acre`),
      new RegExp(`${NUMBER}\\s*(?:oz|ounces?)\\s*(?:per|/)\\s*acre`),
    ]);

    const rateUnit = /gal|gallon/.test(lower)
      ? 'gal/acre'
      : /lb|pound/.test(lower)
        ? 'lb/acre'
        : /oz|ounce/.test(lower)
          ? 'oz/acre'
          : null;

    return {
      ...EMPTY_EXTRACTION,
      activity: findInVocabulary(text, vocabulary.activities),
      field: findInVocabulary(text, vocabulary.fields),
      product: findInVocabulary(text, vocabulary.products),
      rate,
      rateUnit: rate === null ? null : rateUnit,
      areaAcres: firstNumber(lower, [new RegExp(`${NUMBER}\\s*acres?\\b`)]),
      windSpeedMph: firstNumber(lower, [
        new RegExp(`wind[^.]{0,20}?${NUMBER}\\s*(?:mph|miles)`),
        new RegExp(`${NUMBER}\\s*mph`),
      ]),
      airTempF: firstNumber(lower, [
        new RegExp(`${NUMBER}\\s*(?:degrees|°f|f\\b)`),
      ]),
      notes: text.length > 0 ? text.slice(0, 2000) : null,
    };
  },
};

export function extractor(): Extractor {
  const apiKey = process.env.OPENAI_API_KEY;
  return apiKey ? openai(apiKey) : heuristic;
}

export function extractionAvailable(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

/**
 * Extracts, falling back to the parser if the model fails.
 *
 * A failed model call must not lose the recording: the transcript is the
 * evidence, and a log with a transcript and no structure is recoverable by a
 * human in ten seconds. Dropping the upload is not.
 */
export async function safeExtract(
  transcript: string,
  vocabulary: Vocabulary
): Promise<{ readonly value: Extraction; readonly provider: string; readonly degraded: boolean }> {
  const primary = extractor();

  try {
    const value = await primary.extract(transcript, vocabulary);
    return { value: taught(value, vocabulary), provider: primary.name, degraded: false };
  } catch (error: unknown) {
    logger.error('extract', error);
    const value = await heuristic.extract(transcript, vocabulary);
    return { value: taught(value, vocabulary), provider: `${primary.name}→heuristic`, degraded: true };
  }
}

/**
 * Applies what the farm has already corrected, to the fields worth correcting.
 *
 * Only the three closed-list fields — activity, field, product. A rate or a
 * weather note is free text and matching one against a correction table would
 * be substituting somebody's sentence for somebody else's.
 *
 * Exact match on the string the extractor produced. If this farm has seen the
 * machine emit "field kay" and a person has said that is FIELD K, then the next
 * "field kay" is FIELD K — no phonetics, no distance threshold, nothing that
 * can be wrong in a way a grower cannot predict.
 */
function taught(extraction: Extraction, vocabulary: Vocabulary): Extraction {
  const fix = (value: string | null) => applyVocabulary(value, vocabulary.corrections);

  return {
    ...extraction,
    activity: fix(extraction.activity),
    field: fix(extraction.field),
    product: fix(extraction.product),
  };
}
