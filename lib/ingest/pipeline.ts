import 'server-only';

import { revalidatePath } from 'next/cache';

import { safeExtract } from '@/lib/ingest/extract';
import { uploadAudio } from '@/lib/ingest/storage';
import { safeTranscribe } from '@/lib/ingest/transcribe';
import type { Extraction, Vocabulary } from '@/lib/ingest/types';
import { logger } from '@/lib/logger';
import type { ExtractedFields } from '@/lib/types';
import { buildVocabulary, correctionMap } from '@/lib/vocabulary';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { buildWaveform } from '@/lib/waveform';

/**
 * Audio in, log out.
 *
 * The audio is stored before anything is attempted on it, so the only outcome
 * that discards a worker's recording is a failed upload — reported as a 5xx so
 * the device retries.
 *
 * There used to be an `ingest_jobs` row tracking five states through this
 * function. It was observability for a queue that does not exist: the endpoint
 * is synchronous, nothing retries a half-finished job, and no screen a farm
 * manager opens ever showed it. What matters to them is the log at the end.
 *
 * Unresolved fields become warnings rather than errors. A log with a transcript
 * and no product is a gap the dashboard already surfaces; a rejected upload is
 * a gap nobody knows about.
 */

export interface IngestInput {
  readonly orgId: string;
  readonly employeeId: string;
  readonly audio: Blob | null;
  /** Offline path: a device that transcribed locally, or a test. */
  readonly transcript: string | null;
  readonly language: string | null;
  readonly deviceLabel: string | null;
  /** When the work happened, if the device knows. Defaults to now. */
  readonly recordedAt: string | null;
  readonly durationSeconds: number | null;
}

export interface IngestResult {
  readonly status: 'complete' | 'failed';
  readonly logId: string | null;
  readonly warnings: readonly string[];
  readonly error: string | null;
}

async function loadVocabulary(orgId: string): Promise<Vocabulary> {
  const supabase = getSupabaseAdmin();
  const [activities, fields, products, corrected] = await Promise.all([
    supabase.from('activity_types').select('name').order('name'),
    supabase.from('fields').select('name').eq('org_id', orgId).order('name'),
    supabase.from('products').select('name').eq('org_id', orgId).order('name'),
    // Every correction this farm has made, so the extractor stops repeating a
    // mistake it has already been told about. One narrow read of a column the
    // ingest already writes — no new table, no training step.
    supabase
      .from('recordings')
      .select('extracted_fields, activity_logs!inner ( org_id )')
      .eq('activity_logs.org_id', orgId)
      .not('extracted_fields', 'is', null),
  ]);

  return {
    activities: (activities.data ?? []).map((row) => row.name),
    fields: (fields.data ?? []).map((row) => row.name),
    products: (products.data ?? []).map((row) => row.name),
    corrections: correctionMap(
      buildVocabulary(
        (corrected.data ?? []).map((row, index) => ({
          logId: String(index),
          extracted: row.extracted_fields as ExtractedFields | null,
        }))
      )
    ),
  };
}

/** `HH:MM` on a given day, in UTC. */
function instant(day: Date, time: string | null, fallbackHour: number): string {
  const [hours, minutes] = time
    ? time.split(':').map(Number)
    : [fallbackHour, 0];

  return new Date(
    Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hours, minutes)
  ).toISOString();
}

interface Resolved {
  readonly activityTypeId: string | null;
  readonly fieldId: string | null;
  readonly productId: string | null;
}

/** Maps extracted names back onto rows. Unmatched names stay null. */
async function resolveNames(orgId: string, extraction: Extraction): Promise<Resolved> {
  const supabase = getSupabaseAdmin();

  const [activity, field, product] = await Promise.all([
    extraction.activity
      ? supabase.from('activity_types').select('id').ilike('name', extraction.activity).maybeSingle()
      : Promise.resolve({ data: null }),
    extraction.field
      ? supabase.from('fields').select('id').eq('org_id', orgId).ilike('name', extraction.field).maybeSingle()
      : Promise.resolve({ data: null }),
    extraction.product
      ? supabase.from('products').select('id').eq('org_id', orgId).ilike('name', extraction.product).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return {
    activityTypeId: activity.data?.id ?? null,
    fieldId: field.data?.id ?? null,
    productId: product.data?.id ?? null,
  };
}

/** The farm's first field and activity, used when the worker did not say. */
async function fallbacks(orgId: string): Promise<{ fieldId: string | null; activityTypeId: string | null }> {
  const supabase = getSupabaseAdmin();
  const [field, activity] = await Promise.all([
    supabase.from('fields').select('id').eq('org_id', orgId).order('name').limit(1).maybeSingle(),
    supabase.from('activity_types').select('id').order('name').limit(1).maybeSingle(),
  ]);

  return { fieldId: field.data?.id ?? null, activityTypeId: activity.data?.id ?? null };
}

export async function runIngestion(input: IngestInput): Promise<IngestResult> {
  const supabase = getSupabaseAdmin();
  const warnings: string[] = [];
  const uploadId = crypto.randomUUID();

  const fail = (error: string): IngestResult => ({
    status: 'failed',
    logId: null,
    warnings,
    error,
  });

  try {
    // 1. Store the audio first, so nothing downstream can lose it.
    let audioPath: string | null = null;
    if (input.audio) {
      const stored = await uploadAudio(input.orgId, uploadId, input.audio);
      if (!stored.ok) return fail(stored.error);
      audioPath = stored.path;
    }

    // 2. Transcribe.
    let transcript = input.transcript?.trim() ?? '';
    let confidence = input.transcript ? 0.99 : 0.5;
    let language = input.language ?? 'en';
    let duration = input.durationSeconds ?? 0;

    if (input.audio) {
      const heard = await safeTranscribe(input.audio, input.language ?? undefined);
      if (!heard.ok) return fail(heard.error);

      if (heard.value.text) {
        transcript = heard.value.text;
        confidence = heard.value.confidence;
        language = heard.value.language;
        duration = heard.value.durationSeconds || duration;
      } else if (!transcript) {
        return fail('Nothing could be transcribed from that recording.');
      } else {
        warnings.push('No transcription provider configured; used the supplied transcript.');
      }
    }

    if (!transcript) return fail('No audio and no transcript were supplied.');

    // 3. Extract.
    const vocabulary = await loadVocabulary(input.orgId);
    const extracted = await safeExtract(transcript, vocabulary);
    if (extracted.degraded) {
      warnings.push('Structured extraction fell back to the local parser.');
    }

    const resolved = await resolveNames(input.orgId, extracted.value);
    const spare = await fallbacks(input.orgId);

    const fieldId = resolved.fieldId ?? spare.fieldId;
    const activityTypeId = resolved.activityTypeId ?? spare.activityTypeId;
    if (!fieldId || !activityTypeId) {
      return fail('This farm has no fields or activity types to file a log against.');
    }

    if (!resolved.fieldId) warnings.push('Field could not be identified; used the first field.');
    if (!resolved.activityTypeId) {
      warnings.push('Activity could not be identified; used the first activity type.');
    }

    // 4. Create the log.
    const day = input.recordedAt ? new Date(input.recordedAt) : new Date();
    const startedAt = instant(day, extracted.value.startTime, 6);
    let endedAt = instant(day, extracted.value.endTime, 10);
    // `ended_at > started_at` is a check constraint, not a suggestion.
    if (new Date(endedAt) <= new Date(startedAt)) {
      endedAt = new Date(new Date(startedAt).getTime() + Math.max(duration, 60) * 1000).toISOString();
    }

    const log = await supabase
      .from('activity_logs')
      .insert({
        org_id: input.orgId,
        employee_id: input.employeeId,
        field_id: fieldId,
        activity_type_id: activityTypeId,
        started_at: startedAt,
        ended_at: endedAt,
        status: 'new',
      })
      .select('id')
      .single();

    if (log.error || !log.data) {
      logger.error('ingest:log', log.error?.message ?? 'no row');
      return fail('Could not create the log.');
    }

    // 5. Attach the recording. The waveform is derived from the audio's own
    //    bytes when present, so the drawing corresponds to the sound.
    const bytes = input.audio ? new Uint8Array(await input.audio.arrayBuffer()) : null;
    const recording = await supabase.from('recordings').insert({
      log_id: log.data.id,
      audio_path: audioPath,
      audio_url: null,
      duration_seconds: Math.max(1, Math.round(duration)),
      recorded_at: day.toISOString(),
      transcript,
      transcription_confidence: Number(confidence.toFixed(3)),
      language,
      waveform: buildWaveform(bytes, transcript),
      map_pin: { x: 300, y: 160 },
      extracted_fields: toExtractedFields(extracted.value, confidence),
    });

    if (recording.error) {
      logger.error('ingest:recording', recording.error.message);
      warnings.push('The log was created but the recording could not be attached.');
    }

    // 6. File the compliance record, if the worker said enough to build one.
    if (resolved.productId && extracted.value.rate) {
      const application = await supabase.from('applications').insert({
        log_id: log.data.id,
        product_id: resolved.productId,
        rate: extracted.value.rate,
        area_acres: extracted.value.areaAcres,
        wind_speed_mph: extracted.value.windSpeedMph,
        air_temp_f: extracted.value.airTempF,
      });

      if (application.error) {
        logger.error('ingest:application', application.error.message);
        warnings.push('The product could not be recorded against this log.');
      }
    } else if (extracted.value.product && !resolved.productId) {
      warnings.push(`"${extracted.value.product}" is not on the product register.`);
    }

    revalidatePath('/', 'layout');

    return { status: 'complete', logId: log.data.id, warnings, error: null };
  } catch (error: unknown) {
    logger.error('ingest', error);
    return fail('Ingestion failed.');
  }
}

/**
 * The extractor's output in the shape the log detail renders.
 *
 * Per-field confidence is approximated from the transcription's own score,
 * because the extractor reports one number for the whole pass rather than one
 * per field. A value the extractor did not find is null with a null confidence
 * — "not mentioned" and "heard badly" are different things to a reviewer, and
 * collapsing them would send people hunting for words nobody said.
 */
function toExtractedFields(extraction: Extraction, confidence: number) {
  const heard = (value: string | number | null | undefined) =>
    value === null || value === undefined || value === ''
      ? { value: null, confidence: null }
      : { value: String(value), confidence: Number(confidence.toFixed(2)) };

  const conditions = [
    extraction.windSpeedMph === null ? null : `Wind ${extraction.windSpeedMph} mph`,
    extraction.airTempF === null ? null : `${extraction.airTempF} °F`,
  ]
    .filter(Boolean)
    .join(', ');

  return {
    activityType: heard(extraction.activity),
    product: heard(extraction.product),
    rate: heard(extraction.rate),
    field: heard(extraction.field),
    weather: heard(conditions || null),
  };
}
