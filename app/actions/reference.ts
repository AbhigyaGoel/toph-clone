'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { fail, ok, toUserMessage, type ActionResult } from '@/lib/actionResult';
import { logger } from '@/lib/logger';
import { recordAuditEvent } from '@/lib/repositories/audit';
import {
  DEFAULT_MAP_PLOT,
  FOREIGN_KEY_VIOLATION,
  inUseMessage,
  referenceNameSchema,
  UNIQUE_VIOLATION,
} from '@/lib/referenceInput';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requirePermission } from '@/lib/viewer';
import type { ReferenceItem } from '@/lib/types';

/**
 * CRUD for the four reference collections behind the table's columns.
 *
 * These are what make the dashboard editable rather than a view onto a fixed
 * seed: a farm hires someone, splits a field, starts tracking a new activity.
 * Each collection is small and name-shaped, so they share validation and the
 * same three shapes — create, rename, delete — and differ only in scope:
 * employees, fields and tags belong to an organisation, activity types are
 * global (the guided voice log offers the same closed set to every farm).
 *
 * Deletes are refused while logs still reference the row. The foreign keys are
 * `restrict` rather than `cascade` on purpose — losing eleven logs because
 * someone tidied a field name would be a far worse outcome than being told to
 * reassign them first — and the count is checked up front so the refusal can
 * say how many, rather than surfacing a constraint error.
 */

const idSchema = z.string().uuid();
const flagSchema = z.boolean();

/**
 * Ceiling on each collection.
 *
 * These are unauthenticated create endpoints, so "bounded only by the rate
 * limiter" is bounded at roughly 86,000 rows a day. A farm has tens of workers
 * and fields, not thousands, so a cap well above any real use costs nothing and
 * turns unattended abuse into a refusal rather than an index full of junk.
 */
const MAX_REFERENCE_ROWS = 500;

/**
 * Refuses a create once the collection is already implausibly large.
 *
 * Each branch names its table concretely rather than taking one as a parameter:
 * the generated Supabase types are per-table, and a union of them narrows the
 * selectable columns to those they share — which drops `org_id`, since
 * `activity_types` is global and has none.
 */
async function atCapacity(
  table: 'employees' | 'fields' | 'activity_types',
  orgId: string
): Promise<boolean> {
  const supabase = getSupabaseAdmin();

  const result =
    table === 'employees'
      ? await supabase
          .from('employees')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', orgId)
      : table === 'fields'
        ? await supabase
            .from('fields')
            .select('id', { count: 'exact', head: true })
            .eq('org_id', orgId)
        : // Global table, so the ceiling is global too.
          await supabase.from('activity_types').select('id', { count: 'exact', head: true });

  if (result.error) {
    // A failed count must not block a legitimate create; the write itself is
    // still constrained by the rate limiter and the database's own rules.
    logger.error(`atCapacity:${table}`, result.error.message);
    return false;
  }

  return (result.count ?? 0) >= MAX_REFERENCE_ROWS;
}

const AT_CAPACITY = 'This list is already at its maximum size.';

/** A rename that collides with an existing name, worded per collection. */
const takenMessage = (label: string) => `Another ${label} already has that name.`;

// ---------------------------------------------------------------------------
// Employees
// ---------------------------------------------------------------------------

export async function createEmployee(name: string): Promise<ActionResult<ReferenceItem>> {
  const parsed = referenceNameSchema.safeParse(name);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'That name is not valid.');

  try {
    const { viewer, denial } = await requirePermission('reference:write');
    if (denial) return denial;
    const { organization } = viewer;
    if (await atCapacity('employees', organization.id)) return fail(AT_CAPACITY);

    const { data, error } = await getSupabaseAdmin()
      .from('employees')
      .insert({ org_id: organization.id, full_name: parsed.data, is_active: true })
      .select('id, full_name, is_active')
      .single();

    if (error || !data) {
      logger.error('createEmployee', error?.message ?? 'no row returned');
      return fail('That worker could not be added. Try again.');
    }

    await recordAuditEvent({
      viewer,
      action: 'create',
      entityType: 'employee',
      entityId: data.id,
      summary: `Added ${data.full_name} to the roster`,
    });

    revalidatePath('/', 'layout');
    return ok({ id: data.id, name: data.full_name, logCount: 0, isActive: data.is_active });
  } catch (error: unknown) {
    logger.error('createEmployee', error);
    return fail(toUserMessage(error, 'That worker could not be added. Try again.'));
  }
}

export async function updateEmployee(
  id: string,
  name: string,
  isActive: boolean
): Promise<ActionResult<{ id: string }>> {
  const parsedId = idSchema.safeParse(id);
  const parsed = referenceNameSchema.safeParse(name);
  // Validated rather than trusted from its TypeScript annotation: types are
  // erased at runtime, and a Server Action is an ordinary endpoint.
  const parsedActive = flagSchema.safeParse(isActive);

  if (!parsedId.success) return fail('That worker could not be found.');
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'That name is not valid.');
  if (!parsedActive.success) return fail('That worker could not be updated.');

  try {
    const { viewer, denial } = await requirePermission('reference:write');
    if (denial) return denial;
    const { organization } = viewer;

    const supabase = getSupabaseAdmin();

    // Read before writing so a rename says what the old name was. A worker's
    // name appears on every log they filed; changing it is not a cosmetic edit.
    const before = await supabase
      .from('employees')
      .select('full_name, is_active')
      .eq('id', parsedId.data)
      .eq('org_id', organization.id)
      .maybeSingle();

    const { data, error } = await supabase
      .from('employees')
      .update({ full_name: parsed.data, is_active: parsedActive.data })
      .eq('id', parsedId.data)
      .eq('org_id', organization.id)
      .select('id')
      .maybeSingle();

    if (error) {
      logger.error('updateEmployee', error.message);
      return fail('That worker could not be updated. Try again.');
    }
    if (!data) return fail('That worker could not be found.');

    if (before.data && (before.data.full_name !== parsed.data || before.data.is_active !== parsedActive.data)) {
      await recordAuditEvent({
        viewer,
        action: 'update',
        entityType: 'employee',
        entityId: data.id,
        summary:
          before.data.full_name === parsed.data
            ? `Marked ${parsed.data} ${parsedActive.data ? 'active' : 'inactive'}`
            : `Renamed ${before.data.full_name} to ${parsed.data}`,
        changes: {
          Name: { from: before.data.full_name, to: parsed.data },
          Active: { from: before.data.is_active, to: parsedActive.data },
        },
      });
    }

    revalidatePath('/', 'layout');
    return ok({ id: data.id });
  } catch (error: unknown) {
    logger.error('updateEmployee', error);
    return fail(toUserMessage(error, 'That worker could not be updated. Try again.'));
  }
}

export async function deleteEmployee(id: string): Promise<ActionResult<{ id: string }>> {
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return fail('That worker could not be found.');

  try {
    const { viewer, denial } = await requirePermission('reference:delete');
    if (denial) return denial;
    const { organization } = viewer;
    const supabase = getSupabaseAdmin();

    const { count, error: countError } = await supabase
      .from('activity_logs')
      .select('id', { count: 'exact', head: true })
      .eq('employee_id', parsedId.data)
      .eq('org_id', organization.id);

    if (countError) {
      logger.error('deleteEmployee:count', countError.message);
      return fail('That worker could not be removed. Try again.');
    }
    if (count && count > 0) {
      // Deactivating keeps the history intact and is almost always what was
      // actually meant, so the refusal points at it.
      return fail(`${inUseMessage('This worker', count)} You can mark them inactive instead.`);
    }

    const { data, error } = await supabase
      .from('employees')
      .delete()
      .eq('id', parsedId.data)
      .eq('org_id', organization.id)
      .select('id, full_name')
      .maybeSingle();

    if (error) {
      logger.error('deleteEmployee', error.message);
      return fail('That worker could not be removed. Try again.');
    }
    if (!data) return fail('That worker could not be found.');

    await recordAuditEvent({
      viewer,
      action: 'delete',
      entityType: 'employee',
      entityId: data.id,
      summary: `Removed ${data.full_name} from the roster`,
    });

    revalidatePath('/', 'layout');
    return ok({ id: data.id });
  } catch (error: unknown) {
    logger.error('deleteEmployee', error);
    return fail(toUserMessage(error, 'That worker could not be removed. Try again.'));
  }
}

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

export async function createField(name: string): Promise<ActionResult<ReferenceItem>> {
  const parsed = referenceNameSchema.safeParse(name);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'That name is not valid.');

  try {
    const { viewer, denial } = await requirePermission('reference:write');
    if (denial) return denial;
    const { organization } = viewer;
    if (await atCapacity('fields', organization.id)) return fail(AT_CAPACITY);

    const { data, error } = await getSupabaseAdmin()
      .from('fields')
      .insert({ org_id: organization.id, name: parsed.data, map_plot: DEFAULT_MAP_PLOT })
      .select('id, name')
      .single();

    if (error || !data) {
      if (error?.code === UNIQUE_VIOLATION) return fail(takenMessage('field'));
      logger.error('createField', error?.message ?? 'no row returned');
      return fail('That field could not be added. Try again.');
    }

    await recordAuditEvent({
      viewer,
      action: 'create',
      entityType: 'field',
      entityId: data.id,
      summary: `Added the field ${data.name}`,
    });

    revalidatePath('/', 'layout');
    return ok({ id: data.id, name: data.name, logCount: 0 });
  } catch (error: unknown) {
    logger.error('createField', error);
    return fail(toUserMessage(error, 'That field could not be added. Try again.'));
  }
}

export async function updateField(id: string, name: string): Promise<ActionResult<{ id: string }>> {
  const parsedId = idSchema.safeParse(id);
  const parsed = referenceNameSchema.safeParse(name);

  if (!parsedId.success) return fail('That field could not be found.');
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'That name is not valid.');

  try {
    const { viewer, denial } = await requirePermission('reference:write');
    if (denial) return denial;
    const { organization } = viewer;

    const supabase = getSupabaseAdmin();

    const before = await supabase
      .from('fields')
      .select('name')
      .eq('id', parsedId.data)
      .eq('org_id', organization.id)
      .maybeSingle();

    const { data, error } = await supabase
      .from('fields')
      .update({ name: parsed.data })
      .eq('id', parsedId.data)
      .eq('org_id', organization.id)
      .select('id')
      .maybeSingle();

    if (error) {
      if (error.code === UNIQUE_VIOLATION) return fail(takenMessage('field'));
      logger.error('updateField', error.message);
      return fail('That field could not be updated. Try again.');
    }
    if (!data) return fail('That field could not be found.');

    if (before.data && before.data.name !== parsed.data) {
      await recordAuditEvent({
        viewer,
        action: 'update',
        entityType: 'field',
        entityId: data.id,
        summary: `Renamed the field ${before.data.name} to ${parsed.data}`,
        changes: { Name: { from: before.data.name, to: parsed.data } },
      });
    }

    revalidatePath('/', 'layout');
    return ok({ id: data.id });
  } catch (error: unknown) {
    logger.error('updateField', error);
    return fail(toUserMessage(error, 'That field could not be updated. Try again.'));
  }
}

export async function deleteField(id: string): Promise<ActionResult<{ id: string }>> {
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return fail('That field could not be found.');

  try {
    const { viewer, denial } = await requirePermission('reference:delete');
    if (denial) return denial;
    const { organization } = viewer;
    const supabase = getSupabaseAdmin();

    const { count, error: countError } = await supabase
      .from('activity_logs')
      .select('id', { count: 'exact', head: true })
      .eq('field_id', parsedId.data)
      .eq('org_id', organization.id);

    if (countError) {
      logger.error('deleteField:count', countError.message);
      return fail('That field could not be removed. Try again.');
    }
    if (count && count > 0) return fail(inUseMessage('This field', count));

    const { data, error } = await supabase
      .from('fields')
      .delete()
      .eq('id', parsedId.data)
      .eq('org_id', organization.id)
      .select('id, name')
      .maybeSingle();

    if (error) {
      if (error.code === FOREIGN_KEY_VIOLATION) return fail(inUseMessage('This field', count ?? 1));
      logger.error('deleteField', error.message);
      return fail('That field could not be removed. Try again.');
    }
    if (!data) return fail('That field could not be found.');

    await recordAuditEvent({
      viewer,
      action: 'delete',
      entityType: 'field',
      entityId: data.id,
      summary: `Removed the field ${data.name}`,
    });

    revalidatePath('/', 'layout');
    return ok({ id: data.id });
  } catch (error: unknown) {
    logger.error('deleteField', error);
    return fail(toUserMessage(error, 'That field could not be removed. Try again.'));
  }
}

// ---------------------------------------------------------------------------
// Activity types
//
// Global rather than per-organisation: the guided voice log reads the same
// closed list to every worker on every farm, so the table has no `org_id`.
// ---------------------------------------------------------------------------

export async function createActivityType(name: string): Promise<ActionResult<ReferenceItem>> {
  const parsed = referenceNameSchema.safeParse(name);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'That name is not valid.');

  try {
    const { viewer, denial } = await requirePermission('reference:write');
    if (denial) return denial;
    const { organization } = viewer;
    if (await atCapacity('activity_types', organization.id)) return fail(AT_CAPACITY);

    const { data, error } = await getSupabaseAdmin()
      .from('activity_types')
      .insert({ name: parsed.data })
      .select('id, name')
      .single();

    if (error || !data) {
      if (error?.code === UNIQUE_VIOLATION) return fail(takenMessage('activity'));
      logger.error('createActivityType', error?.message ?? 'no row returned');
      return fail('That activity could not be added. Try again.');
    }

    await recordAuditEvent({
      viewer,
      action: 'create',
      entityType: 'activity_type',
      entityId: data.id,
      summary: `Added the activity ${data.name}`,
    });

    revalidatePath('/', 'layout');
    return ok({ id: data.id, name: data.name, logCount: 0 });
  } catch (error: unknown) {
    logger.error('createActivityType', error);
    return fail(toUserMessage(error, 'That activity could not be added. Try again.'));
  }
}

export async function updateActivityType(
  id: string,
  name: string
): Promise<ActionResult<{ id: string }>> {
  const parsedId = idSchema.safeParse(id);
  const parsed = referenceNameSchema.safeParse(name);

  if (!parsedId.success) return fail('That activity could not be found.');
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'That name is not valid.');

  try {
    const { viewer, denial } = await requirePermission('reference:write');
    if (denial) return denial;
    const { organization } = viewer;
    const supabase = getSupabaseAdmin();

    /*
     * Renaming a global row rewrites how it reads for everyone who has used it.
     * Deleting one is already refused while any log references it; renaming had
     * no such guard, so one farm could rename "Spraying" and silently change
     * what every other farm's recorded, reviewed logs say they did.
     *
     * The guard is ownership by use: a rename is allowed while the activity is
     * unused, or used only by this organisation. Once another organisation has
     * logged against it, the name is shared history and stops being one
     * tenant's to change.
     */
    const { count: foreign, error: foreignError } = await supabase
      .from('activity_logs')
      .select('id', { count: 'exact', head: true })
      .eq('activity_type_id', parsedId.data)
      .neq('org_id', organization.id);

    if (foreignError) {
      logger.error('updateActivityType:scope', foreignError.message);
      return fail('That activity could not be updated. Try again.');
    }
    if (foreign && foreign > 0) {
      return fail('This activity is used by other farms, so its name cannot be changed here.');
    }

    const before = await supabase
      .from('activity_types')
      .select('name')
      .eq('id', parsedId.data)
      .maybeSingle();

    const { data, error } = await supabase
      .from('activity_types')
      .update({ name: parsed.data })
      .eq('id', parsedId.data)
      .select('id')
      .maybeSingle();

    if (error) {
      if (error.code === UNIQUE_VIOLATION) return fail(takenMessage('activity'));
      logger.error('updateActivityType', error.message);
      return fail('That activity could not be updated. Try again.');
    }
    if (!data) return fail('That activity could not be found.');

    if (before.data && before.data.name !== parsed.data) {
      await recordAuditEvent({
        viewer,
        action: 'update',
        entityType: 'activity_type',
        entityId: data.id,
        summary: `Renamed the activity ${before.data.name} to ${parsed.data}`,
        changes: { Name: { from: before.data.name, to: parsed.data } },
      });
    }

    revalidatePath('/', 'layout');
    return ok({ id: data.id });
  } catch (error: unknown) {
    logger.error('updateActivityType', error);
    return fail(toUserMessage(error, 'That activity could not be updated. Try again.'));
  }
}

export async function deleteActivityType(id: string): Promise<ActionResult<{ id: string }>> {
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return fail('That activity could not be found.');

  try {
    // `activity_types` is global rather than per-organisation, so there is no
    // tenant to resolve here — but the role check still applies, and it is the
    // only thing standing between a worker and the shared vocabulary.
    // The viewer is still needed, though: the trail records who removed a row
    // from the shared vocabulary even where the row itself has no tenant.
    const { viewer, denial } = await requirePermission('reference:delete');
    if (denial) return denial;

    const supabase = getSupabaseAdmin();

    const { count, error: countError } = await supabase
      .from('activity_logs')
      .select('id', { count: 'exact', head: true })
      .eq('activity_type_id', parsedId.data);

    if (countError) {
      logger.error('deleteActivityType:count', countError.message);
      return fail('That activity could not be removed. Try again.');
    }
    if (count && count > 0) return fail(inUseMessage('This activity', count));

    const { data, error } = await supabase
      .from('activity_types')
      .delete()
      .eq('id', parsedId.data)
      .select('id, name')
      .maybeSingle();

    if (error) {
      if (error.code === FOREIGN_KEY_VIOLATION) {
        return fail(inUseMessage('This activity', count ?? 1));
      }
      logger.error('deleteActivityType', error.message);
      return fail('That activity could not be removed. Try again.');
    }
    if (!data) return fail('That activity could not be found.');

    await recordAuditEvent({
      viewer,
      action: 'delete',
      entityType: 'activity_type',
      entityId: data.id,
      summary: `Removed the activity ${data.name}`,
    });

    revalidatePath('/', 'layout');
    return ok({ id: data.id });
  } catch (error: unknown) {
    logger.error('deleteActivityType', error);
    return fail(toUserMessage(error, 'That activity could not be removed. Try again.'));
  }
}
