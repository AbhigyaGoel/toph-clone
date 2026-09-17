import { z } from 'zod';

import { currentMonthBounds, type LogQuery, type SortKey } from '@/lib/logQuery';
import { signedAudioUrl } from '@/lib/ingest/storage';
import { findApplicationRecordsForLogs } from '@/lib/repositories/applications';
import { findLogIdsWithTags, findTagsForLogs } from '@/lib/repositories/tags';
import { logger } from '@/lib/logger';
import { findRestrictedFields } from '@/lib/repositories/applications';
import { historyForEntities } from '@/lib/repositories/audit';
import { getSupabase, RepositoryError } from '@/lib/supabase/server';
import type { ActivityLog, ExtractedFields, LogDetail, LogInput } from '@/lib/types';
import { expandWaveform, WAVEFORM_BAR_COUNT } from '@/lib/waveform';

/**
 * Rows come from the `activity_log_rows` view, which pre-joins employee, field
 * and activity names. Views are nullable in the generated types, so each row is
 * validated before it becomes a domain object.
 */
const rowSchema = z.object({
  id: z.string().uuid(),
  employee_name: z.string(),
  activity_name: z.string(),
  field_name: z.string(),
  started_at: z.string(),
  ended_at: z.string(),
  status: z.enum(['new', 'reviewed']),
});

const toActivityLog = (row: z.infer<typeof rowSchema>): ActivityLog => ({
  id: row.id,
  employee: row.employee_name,
  activity: row.activity_name,
  field: row.field_name,
  startedAt: row.started_at,
  endedAt: row.ended_at,
  status: row.status,
});

/**
 * Search runs as ILIKE across the three name columns. The pattern is reduced to
 * letters, digits and a few punctuation marks first: PostgREST's `or` filter
 * is comma-delimited, and `%` / `_` are LIKE wildcards.
 */
const toSearchPattern = (q: string): string | null => {
  const cleaned = q.replace(/[^\p{L}\p{N}\s'-]/gu, '').trim();
  return cleaned ? `%${cleaned}%` : null;
};

type Ordering = { readonly column: string; readonly ascending: boolean };

const ORDERINGS: Record<SortKey, Ordering> = {
  date: { column: 'started_at', ascending: true },
  'date-desc': { column: 'started_at', ascending: false },
  employee: { column: 'employee_name', ascending: true },
  activity: { column: 'activity_name', ascending: true },
  /** "No sort" is arrival order, which is what the design lists. */
  none: { column: 'created_at', ascending: true },
};

/** Signs every distinct storage path in one pass. */
async function signAll(paths: readonly (string | null)[]): Promise<ReadonlyMap<string, string>> {
  const distinct = [...new Set(paths.filter((path): path is string => Boolean(path)))];
  const signed = await Promise.all(distinct.map((path) => signedAudioUrl(path)));

  return new Map(
    distinct.flatMap((path, index) => {
      const url = signed[index];
      return url ? [[path, url] as const] : [];
    })
  );
}

/** Lists the logs the panel should show for one organisation. */
export async function findLogs(orgId: string, query: LogQuery): Promise<readonly ActivityLog[]> {
  let request = getSupabase().from('activity_log_rows').select('*').eq('org_id', orgId);

  const pattern = toSearchPattern(query.q);
  if (pattern) {
    request = request.or(
      `employee_name.ilike.${pattern},activity_name.ilike.${pattern},field_name.ilike.${pattern}`
    );
  }

  if (query.range === 'month') {
    const { start, end } = currentMonthBounds();
    request = request.gte('started_at', start.toISOString()).lt('started_at', end.toISOString());
  }

  if (query.activity.length) request = request.in('activity_name', [...query.activity]);
  if (query.field.length) request = request.in('field_name', [...query.field]);
  if (query.employee.length) request = request.in('employee_name', [...query.employee]);

  if (query.tag.length) {
    // A log has many tags, so the tag filter resolves to log ids first rather
    // than joining rows that would then need de-duplicating. An empty result
    // is a real answer — no log carries those tags — not a reason to skip it.
    const tagged = await findLogIdsWithTags(orgId, query.tag);
    if (tagged.length === 0) return [];
    request = request.in('id', [...tagged]);
  }

  const ordering = ORDERINGS[query.sort];
  const { data, error } = await request
    .order(ordering.column, { ascending: ordering.ascending })
    .order('created_at', { ascending: true });

  if (error) {
    throw new RepositoryError('findLogs', error.message);
  }

  return z.array(rowSchema).parse(data).map(toActivityLog);
}

const editableSchema = z.object({
  id: z.string().uuid(),
  employee_id: z.string().uuid(),
  activity_type_id: z.string().uuid(),
  field_id: z.string().uuid(),
  started_at: z.string(),
  ended_at: z.string(),
  status: z.enum(['new', 'reviewed']),
});

/** `2026-04-19T06:00:00+00:00` -> `["2026-04-19", "06:00"]`, in UTC. */
const splitUtc = (iso: string): { date: string; time: string } => {
  const at = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return {
    date: `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}`,
    time: `${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())}`,
  };
};

/**
 * One log in the shape the edit form takes.
 *
 * Foreign keys rather than the joined names the table shows: the form picks
 * from the reference lists, and renaming a field should not silently repoint a
 * log at a different one. Times are split into a date and two clock values in
 * UTC, matching `lib/format.ts` — the stored "6:00 AM" reads and edits as 06:00
 * regardless of where the browser is.
 */
export async function findLogInputs(
  orgId: string,
  logIds: readonly string[]
): Promise<ReadonlyMap<string, LogInput>> {
  if (logIds.length === 0) return new Map();

  const { data, error } = await getSupabase()
    .from('activity_logs')
    .select('id, employee_id, activity_type_id, field_id, started_at, ended_at, status')
    .in('id', [...logIds])
    .eq('org_id', orgId);

  if (error) {
    throw new RepositoryError('findLogInputs', error.message);
  }

  const byId = new Map<string, LogInput>();
  for (const row of z.array(editableSchema).parse(data ?? [])) {
    const start = splitUtc(row.started_at);
    const end = splitUtc(row.ended_at);

    byId.set(row.id, {
      employeeId: row.employee_id,
      activityTypeId: row.activity_type_id,
      fieldId: row.field_id,
      date: start.date,
      startTime: start.time,
      endTime: end.time,
      status: row.status,
    });
  }

  return byId;
}

const pointSchema = z.object({ x: z.number(), y: z.number() });
const plotSchema = pointSchema.extend({ width: z.number().positive(), height: z.number().positive() });

const waveformSchema = z.object({
  amplitudes: z.array(z.number().min(0).max(1)).length(WAVEFORM_BAR_COUNT),
  voiced_bars: z.number().int().min(0).max(WAVEFORM_BAR_COUNT),
});

const extractedValueSchema = z.object({
  value: z.string().nullable().catch(null),
  confidence: z.number().min(0).max(1).nullable().catch(null),
  corrected: z.boolean().optional().catch(undefined),
  /** What the machine heard before a person fixed it — the vocabulary's input. */
  original: z.string().nullable().optional().catch(undefined),
});

/**
 * The extractor's output, parsed rather than trusted.
 *
 * This is the only column in the schema a language model writes. `.catch()` on
 * every branch means a field that comes back in an unexpected shape degrades to
 * "not captured" — which the panel already knows how to show — instead of
 * throwing and taking the whole log detail down with it.
 */
const extractedSchema = z
  .object({
    activityType: extractedValueSchema.optional().catch(undefined),
    product: extractedValueSchema.optional().catch(undefined),
    rate: extractedValueSchema.optional().catch(undefined),
    field: extractedValueSchema.optional().catch(undefined),
    weather: extractedValueSchema.optional().catch(undefined),
  })
  .catch({});

const detailSchema = z.object({
  field_id: z.string(),
  id: z.string().uuid(),
  fields: z.object({ map_plot: plotSchema }),
  activity_types: z.object({ requires_product: z.boolean() }),
  // Nullable: the join is a left join, and a log created on the dashboard has
  // no recording until one is uploaded.
  recordings: z
    .object({
      id: z.string(),
      transcript: z.string(),
      transcript_en: z.string().nullable().default(null),
      language: z.string().default('en'),
      extracted_fields: extractedSchema.nullable().default(null),
      duration_seconds: z.number().int().nonnegative(),
      audio_url: z.string().nullable(),
      audio_path: z.string().nullable(),
      waveform: waveformSchema,
      map_pin: pointSchema,
    })
    .nullable(),
});

/**
 * Loads the expanded panel for every open row, in one round trip.
 *
 * A missing *recording* is not a missing log. The panel opens either way and
 * shows the recording section's empty state, because the log's own fields —
 * which the panel is also where you edit and delete — exist regardless. An id
 * with no matching log is simply absent from the result; the table draws no
 * panel for it rather than the page failing.
 *
 * Scoped to the organisation like every other read. The current RLS grants
 * `select` to everyone, so this filter changes nothing today — but this and
 * `findLogInputs` build the same panel from the same URL param, and one of them
 * silently ignoring the tenant boundary is how `?open=<any-uuid>` starts
 * returning another farm's transcript the day that policy tightens.
 */
export async function findLogDetails(
  orgId: string,
  logIds: readonly string[]
): Promise<readonly LogDetail[]> {
  if (logIds.length === 0) return [];

  const { data, error } = await getSupabase()
    .from('activity_logs')
    .select(
      'id, field_id, fields ( map_plot, name ), activity_types!inner ( requires_product ), recordings ( id, transcript, transcript_en, language, extracted_fields, duration_seconds, audio_url, audio_path, waveform, map_pin )'
    )
    .in('id', [...logIds])
    .eq('org_id', orgId);

  if (error) {
    throw new RepositoryError('findLogDetails', error.message);
  }

  const rows = z.array(detailSchema).parse(data ?? []);
  const [tagsByLog, records, audioUrls] = await Promise.all([
    findTagsForLogs(orgId, rows.map((row) => row.id)),
    findApplicationRecordsForLogs(orgId, rows.map((row) => row.id)),
    // Ingested audio lives in a private bucket, so its URL is minted per
    // request and expires. A static file under /public keeps its plain path.
    signAll(rows.map((row) => row.recordings?.audio_path ?? null)),
  ]);

  // Both run after the query above — a log's history includes its application
  // records and its recording, and those ids are only known once it returns —
  // but they do not depend on each other, so they go together. They were
  // sequential, which made opening a row three round trips deep instead of two.
  const [restrictions, history] = await Promise.all([
    findRestrictedFields(orgId),
    historyForEntities(
      orgId,
      new Map(
        rows.map((row) => [
          row.id,
          [
            { type: 'log' as const, id: row.id },
            ...(records.get(row.id) ?? []).map((record) => ({
              type: 'application' as const,
              id: record.id,
            })),
            ...(row.recordings ? [{ type: 'recording' as const, id: row.recordings.id }] : []),
          ],
        ])
      )
    ),
  ]);

  const byField = new Map(restrictions.map((entry) => [entry.fieldId, entry]));

  return rows.map((row) => {
    const recording = row.recordings;

    return {
      logId: row.id,
      tags: tagsByLog.get(row.id) ?? [],
      applications: records.get(row.id) ?? [],
      requiresProduct: row.activity_types.requires_product,
      restriction: byField.get(row.field_id) ?? null,
      history: history.get(row.id) ?? [],
      recording: recording
        ? {
            summary: recording.transcript,
            language: recording.language,
            translation: recording.transcript_en,
            extracted: recording.extracted_fields,
            durationSeconds: recording.duration_seconds,
            audioUrl: recording.audio_path
              ? (audioUrls.get(recording.audio_path) ?? null)
              : recording.audio_url,
            waveform: expandWaveform({
              amplitudes: recording.waveform.amplitudes,
              voicedBars: recording.waveform.voiced_bars,
            }),
          }
        : null,
      location: {
        plot: row.fields.map_plot,
        // The pin is the worker's position, which only a recording knows.
        pin: recording?.map_pin ?? null,
      },
    };
  });
}

/** Enough of each recent log to decide whether it needs attention. */
export interface ExceptionInput {
  readonly logId: string;
  readonly employeeName: string;
  readonly activityName: string;
  readonly fieldName: string;
  readonly confidence: number | null;
  readonly extracted: ExtractedFields | null;
  readonly requiresProduct: boolean;
  /** Whether anyone has reviewed it yet — what makes an inbox item unread. */
  readonly status: 'new' | 'reviewed';
  readonly startedAt: string;
}

/**
 * The recent logs, with what triage needs and nothing else.
 *
 * Deliberately a window rather than the whole table. Morning triage is about
 * what the crew did lately; a log from March that was never reviewed is a
 * backlog problem for the Audit Manager, not something to put in front of
 * someone deciding how to spend the next ten minutes.
 */
export async function findExceptionInputs(
  orgId: string,
  limit = 40
): Promise<readonly ExceptionInput[]> {
  const { data, error } = await getSupabase()
    .from('activity_logs')
    .select(
      'id, started_at, status, employees ( full_name ), fields ( name ), activity_types ( name, requires_product ), recordings ( transcription_confidence, extracted_fields )'
    )
    .eq('org_id', orgId)
    .order('started_at', { ascending: false })
    .limit(limit);

  if (error) {
    logger.error('findExceptionInputs', error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    logId: row.id,
    employeeName: row.employees?.full_name ?? 'Someone',
    activityName: row.activity_types?.name ?? 'Work',
    fieldName: row.fields?.name ?? 'a field',
    confidence: row.recordings?.transcription_confidence ?? null,
    extracted: (row.recordings?.extracted_fields ?? null) as ExtractedFields | null,
    requiresProduct: row.activity_types?.requires_product ?? false,
    status: row.status === 'reviewed' ? 'reviewed' : 'new',
    startedAt: row.started_at,
  }));
}

/**
 * Every log's extracted fields, for the farm vocabulary.
 *
 * Two columns off one table. The aggregation is pure and lives in
 * `lib/vocabulary.ts`, so the shape of "what this farm has taught the
 * extractor" is decided in one place and read by both the Settings panel and
 * the ingest pipeline.
 */
export async function findVocabularySources(
  orgId: string
): Promise<readonly { readonly logId: string; readonly extracted: ExtractedFields | null }[]> {
  const { data, error } = await getSupabase()
    .from('recordings')
    .select('log_id, extracted_fields, activity_logs!inner ( org_id )')
    .eq('activity_logs.org_id', orgId)
    .not('extracted_fields', 'is', null);

  if (error) {
    logger.error('findVocabularySources', error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    logId: row.log_id as string,
    extracted: (row.extracted_fields ?? null) as ExtractedFields | null,
  }));
}
