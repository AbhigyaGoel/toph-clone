'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { fail, ok, toUserMessage, type ActionResult } from '@/lib/actionResult';
import { logger } from '@/lib/logger';
import { diffFields, recordAuditEvent, recordAuditEvents } from '@/lib/repositories/audit';
import { firstIssue, logInputSchema, toInstants } from '@/lib/logInput';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requirePermission } from '@/lib/viewer';
import type { Tables } from '@/lib/supabase/database.types';
import type { LogInput } from '@/lib/types';
import { removeAudio } from '@/lib/ingest/storage';
import { remember, take } from '@/lib/undoBuffer';

/**
 * Reviewing logs.
 *
 * `activity_logs.status` already drives the "1 New" qualifier on the stat card
 * and the green badge in the navigation rail, both through the derived
 * `dashboard_stats` view. So this one column write is what makes those numbers
 * live: mark a row reviewed and the badge counts down on the next render, with
 * no second place to keep in sync.
 */

/** Field names as a reviewer reads them, not as the columns are spelled. */
const LOG_LABELS: Readonly<Record<string, string>> = {
  employee_id: 'Worker',
  activity_type_id: 'Activity',
  field_id: 'Field',
  started_at: 'Started',
  ended_at: 'Ended',
  status: 'Status',
};

/** Bulk selection is capped so one call cannot rewrite the whole table. */
const MAX_LOGS_PER_CALL = 100;

const inputSchema = z.object({
  logIds: z.array(z.string().uuid()).min(1).max(MAX_LOGS_PER_CALL),
  status: z.enum(['new', 'reviewed']),
});

export interface StatusChange {
  readonly updated: number;
  readonly status: 'new' | 'reviewed';
}

/**
 * Sets the review status of one or more logs.
 *
 * Takes the target status rather than only marking reviewed so the UI can offer
 * an undo without a second action.
 */
export async function setLogsStatus(
  logIds: readonly string[],
  status: 'new' | 'reviewed'
): Promise<ActionResult<StatusChange>> {
  const parsed = inputSchema.safeParse({ logIds, status });
  if (!parsed.success) {
    return fail('Those logs could not be updated — the selection was not valid.');
  }


  try {
    const { viewer, denial } = await requirePermission('logs:review');
    if (denial) return denial;
    const { organization } = viewer;

    // The read path scopes every query to the organisation; the write must too.
    // `getSupabaseAdmin` bypasses Row Level Security, so nothing below this line
    // enforces the tenant boundary on our behalf — and log ids are not secret,
    // they are printed straight into the page's URLs. Without this `eq`, a
    // crafted POST to this action (a Server Action is an endpoint, not just a
    // button) could flip the status of a log belonging to another organisation.
    const { data, error } = await getSupabaseAdmin()
      .from('activity_logs')
      .update({ status: parsed.data.status })
      .in('id', parsed.data.logIds)
      .eq('org_id', organization.id)
      .select('id');

    if (error) {
      // The driver's message can name columns and constraints; keep it server-side.
      logger.error('setLogsStatus', error.message);
      return fail('Those logs could not be updated. Try again.');
    }

    /*
      One event per log, not one per batch.

      It was one event for the batch, attached to the first log's id, on the
      reasoning that a reviewer clearing a morning's work performed a single
      act. That reasoning was wrong twice over. A reviewer opening the seventh
      log saw an empty history for a log that had plainly been reviewed — the
      entry was filed against a different record. And `audit_coverage` counts
      changes per record, so ten of eleven rows were correctly reported as
      changed with nothing written down.

      The cost is eleven inserts where there was one, serialised by the chain's
      per-organisation lock. At a farm's write rate that is invisible; if it
      ever is not, the answer is to batch the chain, not to under-record.
    */
    const touched = data ?? [];
    const was = parsed.data.status === 'reviewed' ? 'new' : 'reviewed';

    await recordAuditEvents(
      touched.map((row) => ({
        viewer,
        action: 'update' as const,
        entityType: 'log' as const,
        entityId: row.id,
        summary: `Marked ${parsed.data.status === 'reviewed' ? 'reviewed' : 'unreviewed'}`,
        changes: { Status: { from: was, to: parsed.data.status } },
      }))
    );

    revalidatePath('/', 'layout');

    return ok({ updated: data?.length ?? 0, status: parsed.data.status });
  } catch (error: unknown) {
    logger.error('setLogsStatus', error);
    return fail(toUserMessage(error, 'Those logs could not be updated. Try again.'));
  }
}

/**
 * Confirms every id in a log's payload belongs to this organisation.
 *
 * The form only ever offers this organisation's employees, fields and
 * activities, but the action is an endpoint and the payload is three foreign
 * keys — so the constraint is re-checked rather than assumed. Activities are
 * global (`activity_types` has no `org_id`), so only its existence is checked.
 */
async function resolveReferences(
  orgId: string,
  input: { employeeId: string; fieldId: string; activityTypeId: string }
): Promise<string | null> {
  const supabase = getSupabaseAdmin();

  const [employee, field, activity] = await Promise.all([
    supabase.from('employees').select('id').eq('id', input.employeeId).eq('org_id', orgId).maybeSingle(),
    supabase.from('fields').select('id').eq('id', input.fieldId).eq('org_id', orgId).maybeSingle(),
    supabase.from('activity_types').select('id').eq('id', input.activityTypeId).maybeSingle(),
  ]);

  const failed = [employee, field, activity].find((result) => result.error);
  if (failed?.error) {
    logger.error('resolveReferences', failed.error.message);
    return 'That log could not be saved. Try again.';
  }

  if (!employee.data) return 'Pick a worker from this farm.';
  if (!field.data) return 'Pick a field from this farm.';
  if (!activity.data) return 'Pick an activity type.';

  return null;
}

/** Creates a log. Recordings arrive separately, so a new log has none yet. */
export async function createLog(input: LogInput): Promise<ActionResult<{ id: string }>> {
  const parsed = logInputSchema.safeParse(input);
  if (!parsed.success) {
    return fail(firstIssue(parsed.error));
  }


  try {
    const { viewer, denial } = await requirePermission('logs:write');
    if (denial) return denial;
    const { organization } = viewer;

    const invalid = await resolveReferences(organization.id, parsed.data);
    if (invalid) return fail(invalid);

    const { startedAt, endedAt } = toInstants(parsed.data);

    const { data, error } = await getSupabaseAdmin()
      .from('activity_logs')
      .insert({
        org_id: organization.id,
        employee_id: parsed.data.employeeId,
        activity_type_id: parsed.data.activityTypeId,
        field_id: parsed.data.fieldId,
        started_at: startedAt,
        ended_at: endedAt,
        status: parsed.data.status,
      })
      .select('id')
      .single();

    if (error || !data) {
      logger.error('createLog', error?.message ?? 'no row returned');
      return fail('That log could not be created. Try again.');
    }

    await recordAuditEvent({
      viewer,
      action: 'create',
      entityType: 'log',
      entityId: data.id,
      summary: 'Created a log by hand',
      changes: {
        Started: { from: null, to: startedAt },
        Ended: { from: null, to: endedAt },
        Status: { from: null, to: parsed.data.status },
      },
    });

    revalidatePath('/', 'layout');

    return ok({ id: data.id });
  } catch (error: unknown) {
    logger.error('createLog', error);
    return fail(toUserMessage(error, 'That log could not be created. Try again.'));
  }
}

/** Updates a log's extracted fields. */
export async function updateLog(
  logId: string,
  input: LogInput
): Promise<ActionResult<{ id: string }>> {
  const id = z.string().uuid().safeParse(logId);
  const parsed = logInputSchema.safeParse(input);

  if (!id.success) return fail('That log could not be found.');
  if (!parsed.success) return fail(firstIssue(parsed.error));


  try {
    const { viewer, denial } = await requirePermission('logs:write');
    if (denial) return denial;
    const { organization } = viewer;

    const invalid = await resolveReferences(organization.id, parsed.data);
    if (invalid) return fail(invalid);

    const { startedAt, endedAt } = toInstants(parsed.data);

    const supabase = getSupabaseAdmin();

    // Read before writing so the trail can carry both sides of the edit. This
    // is one extra round trip on a hand edit, which is rare; the alternative is
    // a history that says a log changed without saying from what.
    const before = await supabase
      .from('activity_logs')
      .select(
        'employee_id, activity_type_id, field_id, started_at, ended_at, status, employees ( full_name ), fields ( name ), activity_types ( name )'
      )
      .eq('id', id.data)
      .eq('org_id', organization.id)
      .maybeSingle();

    // Scoped by org_id as well as id: the secret key bypasses RLS, so this
    // `eq` is the only thing keeping the write inside the tenant.
    const { data, error } = await supabase
      .from('activity_logs')
      .update({
        employee_id: parsed.data.employeeId,
        activity_type_id: parsed.data.activityTypeId,
        field_id: parsed.data.fieldId,
        started_at: startedAt,
        ended_at: endedAt,
        status: parsed.data.status,
      })
      .eq('id', id.data)
      .eq('org_id', organization.id)
      .select('id')
      .maybeSingle();

    if (error) {
      logger.error('updateLog', error.message);
      return fail('That log could not be updated. Try again.');
    }
    if (!data) return fail('That log could not be found.');

    if (before.data) {
      const changes = diffFields(
        {
          employee_id: before.data.employee_id,
          activity_type_id: before.data.activity_type_id,
          field_id: before.data.field_id,
          started_at: before.data.started_at,
          ended_at: before.data.ended_at,
          status: before.data.status,
        },
        {
          employee_id: parsed.data.employeeId,
          activity_type_id: parsed.data.activityTypeId,
          field_id: parsed.data.fieldId,
          started_at: startedAt,
          ended_at: endedAt,
          status: parsed.data.status,
        },
        LOG_LABELS
      );

      if (Object.keys(changes).length > 0) {
        await recordAuditEvent({
          viewer,
          action: 'update',
          entityType: 'log',
          entityId: data.id,
          summary: `Edited ${before.data.employees?.full_name ?? 'a worker'}'s ${
            before.data.activity_types?.name?.toLowerCase() ?? 'activity'
          } log`,
          changes,
        });
      }
    }

    revalidatePath('/', 'layout');

    return ok({ id: data.id });
  } catch (error: unknown) {
    logger.error('updateLog', error);
    return fail(toUserMessage(error, 'That log could not be updated. Try again.'));
  }
}

export interface LogsDeleted {
  readonly deleted: number;
  /**
   * Reclaims the deleted rows while the undo window is open, or null when
   * nothing was deleted. Opaque: it names rows held on the server.
   */
  readonly undoToken: string | null;
}

/**
 * The three tables a log occupies, captured whole so it can be put back.
 *
 * Read out of the database immediately before the delete rather than
 * reconstructed from what the UI happened to be showing — the panel knows the
 * transcript and the tags, but not `created_at`, `recorded_at` or the
 * confidence score, and an undo that quietly changed those would be a different
 * log wearing the same name.
 */
interface DeletedLogs {
  readonly logs: readonly Tables<'activity_logs'>[];
  readonly recordings: readonly Tables<'recordings'>[];
  readonly links: readonly Tables<'log_tags'>[];
  /**
   * The compliance records the log carried.
   *
   * These cascade with the log like the recording does, and leaving them out of
   * the snapshot made undo quietly lossy: the log came back, its audio and tags
   * came back, and the record of what was sprayed on that field did not. On a
   * screen whose whole argument is "this is audit-ready evidence", an undo that
   * drops the evidence is the worst possible bug.
   */
  readonly applications: readonly Tables<'applications'>[];
}

/**
 * A shape check, not a validation pass.
 *
 * The rows in here were selected by this server minutes earlier and never left
 * it — they are not input, and re-validating every column would be ceremony
 * around data that cannot have changed. What is worth confirming is that the
 * token resolved to a snapshot at all rather than to something left by a
 * different caller of the buffer.
 */
const isDeletedLogs = (value: unknown): value is DeletedLogs => {
  if (typeof value !== 'object' || value === null) return false;

  const candidate = value as Partial<DeletedLogs>;
  return (
    Array.isArray(candidate.logs) &&
    candidate.logs.length > 0 &&
    Array.isArray(candidate.recordings) &&
    Array.isArray(candidate.links) &&
    Array.isArray(candidate.applications)
  );
};

/**
 * Deletes logs, and keeps them for a minute in case that was a mistake.
 *
 * The recording and any tag links go with them: both foreign keys are declared
 * `on delete cascade`, because neither has a meaning without its log. The
 * reference rows the log points *at* are untouched — so an undo only has to
 * restore these three tables, and the fields, employees and activities it points
 * at are still where it left them.
 */
export async function deleteLogs(logIds: readonly string[]): Promise<ActionResult<LogsDeleted>> {
  const parsed = z.array(z.string().uuid()).min(1).max(MAX_LOGS_PER_CALL).safeParse(logIds);
  if (!parsed.success) {
    return fail('Those logs could not be deleted — the selection was not valid.');
  }


  try {
    const { viewer, denial } = await requirePermission('logs:delete');
    if (denial) return denial;
    const { organization } = viewer;
    const supabase = getSupabaseAdmin();

    // Scoped by org_id throughout: the secret key bypasses RLS, so these `eq`s
    // are the only thing keeping the snapshot and the delete inside the tenant.
    const owned = await supabase
      .from('activity_logs')
      .select('id')
      .in('id', parsed.data)
      .eq('org_id', organization.id);

    if (owned.error) {
      logger.error('deleteLogs', owned.error.message);
      return fail('Those logs could not be deleted. Try again.');
    }

    const ids = (owned.data ?? []).map((row) => row.id);
    if (ids.length === 0) {
      return ok({ deleted: 0, undoToken: null });
    }

    // Read before deleting, because all three cascade with the log.
    const [recordings, links, applications] = await Promise.all([
      supabase.from('recordings').select('*').in('log_id', ids),
      supabase.from('log_tags').select('*').in('log_id', ids),
      supabase.from('applications').select('*').in('log_id', ids),
    ]);

    const readFailure = [recordings, links, applications].find((result) => result.error);
    if (readFailure?.error) {
      logger.error('deleteLogs', readFailure.error.message);
      return fail('Those logs could not be deleted. Try again.');
    }

    // The snapshot of the logs themselves comes back *from the delete*, not
    // from a select before it. Reading first and deleting second leaves a
    // window in which an edit lands in between — the delete still succeeds,
    // but the held snapshot is the pre-edit row, and an undo would quietly
    // resurrect it over someone else's correction. `delete().select()` returns
    // exactly what it removed.
    const removed = await supabase
      .from('activity_logs')
      .delete()
      .in('id', ids)
      .eq('org_id', organization.id)
      .select('*');

    if (removed.error) {
      logger.error('deleteLogs', removed.error.message);
      return fail('Those logs could not be deleted. Try again.');
    }

    const rows = removed.data ?? [];
    if (rows.length === 0) {
      return ok({ deleted: 0, undoToken: null });
    }

    const deletedIds = new Set(rows.map((row) => row.id));
    const snapshot: DeletedLogs = {
      logs: rows,
      recordings: (recordings.data ?? []).filter((row) => deletedIds.has(row.log_id)),
      links: (links.data ?? []).filter((row) => deletedIds.has(row.log_id)),
      applications: (applications.data ?? []).filter((row) => deletedIds.has(row.log_id)),
    };

    // Held before the revalidation, so that a failure there cannot leave the
    // rows deleted and the way back unreachable. The disposer runs only if the
    // window closes without an undo, which is the first moment the audio is
    // genuinely unreachable rather than merely deleted.
    const undoToken = remember(snapshot, (expired) => {
      if (!isDeletedLogs(expired)) return;
      const paths = expired.recordings
        .map((row) => row.audio_path)
        .filter((path): path is string => Boolean(path));
      void removeAudio(paths);
    });

    // Recorded per log, unlike the status change: a delete removes the row
    // itself, so the event is the only remaining evidence that this particular
    // log existed at all. Collapsing eleven deletions into one entry would lose
    // ten of those.
    await recordAuditEvents(
      rows.map((row) => ({
        viewer,
        action: 'delete' as const,
        entityType: 'log' as const,
        entityId: row.id,
        summary: 'Deleted a log',
        changes: {
          Started: { from: row.started_at, to: null },
          Status: { from: row.status, to: null },
        },
      }))
    );

    revalidatePath('/', 'layout');

    return ok({ deleted: rows.length, undoToken });
  } catch (error: unknown) {
    logger.error('deleteLogs', error);
    return fail(toUserMessage(error, 'Those logs could not be deleted. Try again.'));
  }
}

/**
 * Puts back what the matching delete removed.
 *
 * Insert order follows the foreign keys: the logs first, then the recordings and
 * tag links that reference them. Ids are preserved, so a row that was open when
 * it was deleted is the same row again afterwards rather than a copy — which is
 * what lets the URL's `open` list survive an undo.
 *
 * The token is single-use and the rows never left the server, so there is no
 * payload here to validate beyond the token's shape; the organisation is still
 * re-checked, because a token issued before a tenant switch should not write
 * across it.
 */
export async function restoreLogs(token: string): Promise<ActionResult<{ restored: number }>> {
  const parsed = z.string().uuid().safeParse(token);
  if (!parsed.success) {
    return fail('That delete can no longer be undone.');
  }


  try {
    const snapshot = take(parsed.data);
    if (!isDeletedLogs(snapshot)) {
      // Expired, already used, or lost with the process. Nothing to apologise
      // for — say what is true and leave the list as it is.
      return fail('That delete can no longer be undone.');
    }

    const { viewer, denial } = await requirePermission('logs:delete');
    if (denial) return denial;
    const { organization } = viewer;
    const logs = snapshot.logs.filter((row) => row.org_id === organization.id);
    if (logs.length === 0) {
      return fail('That delete can no longer be undone.');
    }

    const supabase = getSupabaseAdmin();
    const restored = await supabase.from('activity_logs').insert(logs).select('id');

    if (restored.error) {
      logger.error('restoreLogs', restored.error.message);
      return fail('Those logs could not be restored. Try again.');
    }

    const ids = new Set((restored.data ?? []).map((row) => row.id));
    const recordings = snapshot.recordings.filter((row) => ids.has(row.log_id));
    const links = snapshot.links.filter((row) => ids.has(row.log_id));
    const applications = snapshot.applications.filter((row) => ids.has(row.log_id));

    const [recordingResult, linkResult, applicationResult] = await Promise.all([
      recordings.length ? supabase.from('recordings').insert(recordings) : Promise.resolve({ error: null }),
      links.length ? supabase.from('log_tags').insert(links) : Promise.resolve({ error: null }),
      applications.length
        ? supabase.from('applications').insert(applications)
        : Promise.resolve({ error: null }),
    ]);

    // The logs are back either way; a failure here loses the audio, the tags or
    // the compliance records, which is worth recording but not worth telling the
    // user the undo failed.
    const partial = [recordingResult, linkResult, applicationResult].find((result) => result.error);
    if (partial?.error) {
      logger.error('restoreLogs', partial.error.message);
    }

    // The undo is its own event rather than a retraction of the delete. An
    // append-only trail never unsays anything: it says the log was deleted and
    // then says it came back, which is the truthful account of what happened.
    await recordAuditEvents(
      [...ids].map((logId) => ({
        viewer,
        action: 'restore' as const,
        entityType: 'log' as const,
        entityId: logId,
        summary: 'Restored a deleted log',
      }))
    );

    revalidatePath('/', 'layout');

    return ok({ restored: ids.size });
  } catch (error: unknown) {
    logger.error('restoreLogs', error);
    return fail(toUserMessage(error, 'Those logs could not be restored. Try again.'));
  }
}
