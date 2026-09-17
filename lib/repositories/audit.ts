import 'server-only';

import { logger } from '@/lib/logger';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type { Json } from '@/lib/supabase/database.types';
import { getSupabase } from '@/lib/supabase/server';
import type {
  AuditAction,
  AuditEntityType,
  AuditEvent,
  ChangeValue,
  Viewer,
} from '@/lib/types';

/**
 * The change log.
 *
 * Who changed what, and when. An inspector asking "was this record edited after
 * the fact?" gets the ordinary answer — here is the edit, here is who made it —
 * which is the answer a paper logbook's crossings-out give and the one a bare
 * database row cannot.
 *
 * The write is deliberately the last thing an action does and never fails the
 * action it describes. A farm losing a spray record because the history table
 * blinked would be a far worse outcome than a history with a gap in it.
 */

/** `{ rate: { from: 1.5, to: 2 } }`, only for fields that actually moved. */
export type FieldChanges = Readonly<
  Record<string, { readonly from: ChangeValue; readonly to: ChangeValue }>
>;

interface AuditDraft {
  readonly viewer: Viewer;
  readonly action: AuditAction;
  readonly entityType: AuditEntityType;
  readonly entityId: string;
  readonly summary: string;
  readonly changes?: FieldChanges;
}

/**
 * Appends one event.
 *
 * Swallows its own failure on purpose, having logged it — see the note above.
 * This is the one place in the codebase where an error is not propagated, and
 * it is a considered trade rather than an oversight.
 */
export async function recordAuditEvent(...drafts: readonly AuditDraft[]): Promise<void> {
  if (drafts.length === 0) return;

  const rows = drafts.map((draft) => ({
    org_id: draft.viewer.organization.id,
    actor_id: draft.viewer.member?.id ?? null,
    actor_label: draft.viewer.member?.displayName ?? 'Automated ingestion',
    action: draft.action,
    entity_type: draft.entityType,
    entity_id: draft.entityId,
    summary: draft.summary,
    changes: (draft.changes ?? {}) as Json,
  }));

  try {
    const { error } = await getSupabaseAdmin().from('audit_events').insert(rows);
    if (error) logger.error('recordAuditEvent', error.message);
  } catch (error: unknown) {
    logger.error('recordAuditEvent', error);
  }
}

/** Several events in one insert — marking eleven logs reviewed is one round trip. */
export const recordAuditEvents = (drafts: readonly AuditDraft[]): Promise<void> =>
  recordAuditEvent(...drafts);

interface AuditRow {
  readonly id: string;
  readonly actor_id: string | null;
  readonly actor_label: string;
  readonly action: AuditAction;
  readonly entity_type: string;
  readonly entity_id: string;
  readonly summary: string;
  readonly changes: unknown;
  readonly created_at: string;
}

const COLUMNS = 'id, actor_id, actor_label, action, entity_type, entity_id, summary, changes, created_at';

const toEvent = (row: AuditRow): AuditEvent => ({
  id: row.id,
  actorId: row.actor_id,
  actorLabel: row.actor_label,
  action: row.action,
  entityType: row.entity_type as AuditEntityType,
  entityId: row.entity_id,
  summary: row.summary,
  changes: isChanges(row.changes) ? row.changes : {},
  createdAt: row.created_at,
});

/** `changes` comes back as `unknown` from the driver; narrow before trusting it. */
function isChanges(value: unknown): value is FieldChanges {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** One record's history, newest first. */
export async function eventsForEntity(
  orgId: string,
  entityType: AuditEntityType,
  entityId: string,
  limit = 20
): Promise<readonly AuditEvent[]> {
  const { data, error } = await getSupabase()
    .from('audit_events')
    .select(COLUMNS)
    .eq('org_id', orgId)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    logger.error('eventsForEntity', error.message);
    return [];
  }

  return (data ?? []).map(toEvent);
}

/** The whole farm's trail, newest first. */
export async function recentEvents(orgId: string, limit = 50): Promise<readonly AuditEvent[]> {
  const { data, error } = await getSupabase()
    .from('audit_events')
    .select(COLUMNS)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    logger.error('recentEvents', error.message);
    return [];
  }

  return (data ?? []).map(toEvent);
}

/**
 * The fields that differ between two versions of a record.
 *
 * Only what moved: an edit that changed a rate should not produce an event
 * claiming the product, the area and the wind speed were all rewritten too.
 */
function scalar(value: unknown): ChangeValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  // Anything else would be unreadable in a one-line history entry; say so
  // rather than dropping the field and pretending it did not change.
  return String(value);
}

export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
  labels: Readonly<Record<string, string>>
): FieldChanges {
  const changes: Record<string, { from: ChangeValue; to: ChangeValue }> = {};

  for (const [key, next] of Object.entries(after)) {
    if (next === undefined) continue;
    const previous = before[key];
    if (Object.is(previous, next)) continue;
    changes[labels[key] ?? key] = { from: scalar(previous), to: scalar(next) };
  }

  return changes;
}

/**
 * History for a set of logs, keyed by log id.
 *
 * A log's history is not only the events that name the log. From a reviewer's
 * point of view, "the rate on this spray was changed" and "this transcript was
 * corrected" are things that happened *to this log*, even though they are
 * recorded against the application and the recording. So the query takes the
 * log's children too and the caller supplies the mapping back.
 */
export async function historyForEntities(
  orgId: string,
  entities: ReadonlyMap<string, readonly { readonly type: AuditEntityType; readonly id: string }[]>
): Promise<ReadonlyMap<string, readonly AuditEvent[]>> {
  const ids = [...entities.values()].flat().map((entity) => entity.id);
  if (ids.length === 0) return new Map();

  const { data, error } = await getSupabase()
    .from('audit_events')
    .select(COLUMNS)
    .eq('org_id', orgId)
    .in('entity_id', ids)
    .order('created_at', { ascending: false })
    // A log with hundreds of edits is a story in itself, but the panel shows a
    // handful; the rest are reachable from the farm-wide trail.
    .limit(200);

  if (error) {
    logger.error('historyForEntities', error.message);
    return new Map();
  }

  const owner = new Map<string, string>();
  for (const [key, children] of entities) {
    for (const child of children) owner.set(`${child.type}:${child.id}`, key);
  }

  const grouped = new Map<string, AuditEvent[]>();
  for (const row of data ?? []) {
    const event = toEvent(row);
    const key = owner.get(`${event.entityType}:${event.entityId}`);
    if (!key) continue;
    const list = grouped.get(key);
    if (list) list.push(event);
    else grouped.set(key, [event]);
  }

  return grouped;
}
