'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { fail, ok, toUserMessage, type ActionResult } from '@/lib/actionResult';
import { applicationInputSchema, firstApplicationIssue, type ApplicationInput } from '@/lib/applicationInput';
import { logger } from '@/lib/logger';
import { diffFields, recordAuditEvent } from '@/lib/repositories/audit';
import { UNIQUE_VIOLATION } from '@/lib/referenceInput';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requirePermission } from '@/lib/viewer';

/**
 * Filing the record a log owes.
 *
 * This is what makes the Audit Manager a working screen rather than a report: a
 * gap it finds can be closed from the row that reports it. The write is an
 * ordinary log edit as far as permissions go — `logs:write` — because recording
 * what was sprayed is part of writing the log up, not a separate privilege.
 */

/** Confirms the log and the product both belong to this organisation. */
async function resolveOwnership(
  orgId: string,
  logId: string,
  productId: string
): Promise<string | null> {
  const supabase = getSupabaseAdmin();

  const [log, product] = await Promise.all([
    supabase.from('activity_logs').select('id').eq('id', logId).eq('org_id', orgId).maybeSingle(),
    supabase.from('products').select('id').eq('id', productId).eq('org_id', orgId).maybeSingle(),
  ]);

  const failed = [log, product].find((result) => result.error);
  if (failed?.error) {
    logger.error('resolveOwnership', failed.error.message);
    return 'That record could not be saved. Try again.';
  }

  // Both refusals share a message on purpose: the ids come from a client, and
  // answering "the log exists but the product does not" turns this action into
  // a way to test which ids are real.
  if (!log.data || !product.data) return 'That record could not be saved.';

  return null;
}

/** Field names as a reviewer reads them, not as the columns are spelled. */
const APPLICATION_LABELS: Readonly<Record<string, string>> = {
  rate: 'Rate',
  area_acres: 'Treated area',
  wind_speed_mph: 'Wind speed',
  air_temp_f: 'Air temperature',
};

export async function addApplication(
  input: ApplicationInput
): Promise<ActionResult<{ id: string }>> {
  const parsed = applicationInputSchema.safeParse(input);
  if (!parsed.success) {
    return fail(firstApplicationIssue(parsed.error));
  }


  try {
    const { viewer, denial } = await requirePermission('logs:write');
    if (denial) return denial;

    const invalid = await resolveOwnership(
      viewer.organization.id,
      parsed.data.logId,
      parsed.data.productId
    );
    if (invalid) return fail(invalid);

    const { data, error } = await getSupabaseAdmin()
      .from('applications')
      .insert({
        log_id: parsed.data.logId,
        product_id: parsed.data.productId,
        rate: parsed.data.rate,
        area_acres: parsed.data.areaAcres,
        wind_speed_mph: parsed.data.windSpeedMph,
        air_temp_f: parsed.data.airTempF,
      })
      // The product's name comes back with the insert rather than in a second
      // query, because the trail entry has to read as a sentence and
      // "filed 4f3c..." is not one.
      .select('id, products ( name, rate_unit )')
      .single();

    if (error) {
      if (error.code === UNIQUE_VIOLATION) {
        return fail('That product is already recorded against this log.');
      }
      logger.error('addApplication', error.message);
      return fail('That record could not be saved. Try again.');
    }

    const unit = data.products?.rate_unit ?? '';
    await recordAuditEvent({
      viewer,
      action: 'create',
      entityType: 'application',
      entityId: data.id,
      summary: `Filed ${data.products?.name ?? 'a product'} at ${parsed.data.rate} ${unit}`.trim(),
      changes: {
        Rate: { from: null, to: parsed.data.rate },
        'Treated area': { from: null, to: parsed.data.areaAcres },
        'Wind speed': { from: null, to: parsed.data.windSpeedMph },
        'Air temperature': { from: null, to: parsed.data.airTempF },
      },
    });

    revalidatePath('/', 'layout');

    return ok({ id: data.id });
  } catch (error: unknown) {
    logger.error('addApplication', error);
    return fail(toUserMessage(error, 'That record could not be saved. Try again.'));
  }
}

/**
 * Completes a record that was filed short.
 *
 * Only the four fields that can be missing. The product and the log are not
 * editable here: changing which product a record names is not a correction, it
 * is a different record, and an audit trail that lets one quietly become the
 * other is not an audit trail.
 */
export async function updateApplication(
  applicationId: string,
  input: Omit<ApplicationInput, 'logId' | 'productId'>
): Promise<ActionResult<{ id: string }>> {
  const id = z.string().uuid().safeParse(applicationId);
  if (!id.success) return fail('That record could not be found.');

  const parsed = applicationInputSchema
    .omit({ logId: true, productId: true })
    .safeParse(input);
  if (!parsed.success) return fail(firstApplicationIssue(parsed.error));


  try {
    const { viewer, denial } = await requirePermission('logs:write');
    if (denial) return denial;

    const supabase = getSupabaseAdmin();

    // `applications` has no org_id of its own — it inherits the tenant through
    // its log — so ownership is established before the update rather than
    // expressed as an `eq` on it.
    // The previous values are read in the same query that proves ownership, so
    // the trail can say what the record *was*. Without this an edit could only
    // be recorded as "someone changed something", which is the part of an audit
    // trail that has no value.
    const existing = await supabase
      .from('applications')
      .select(
        'id, rate, area_acres, wind_speed_mph, air_temp_f, products ( name ), activity_logs!inner ( org_id )'
      )
      .eq('id', id.data)
      .eq('activity_logs.org_id', viewer.organization.id)
      .maybeSingle();

    if (existing.error) {
      logger.error('updateApplication:lookup', existing.error.message);
      return fail('That record could not be updated. Try again.');
    }
    if (!existing.data) return fail('That record could not be found.');

    const { error } = await supabase
      .from('applications')
      .update({
        rate: parsed.data.rate,
        area_acres: parsed.data.areaAcres,
        wind_speed_mph: parsed.data.windSpeedMph,
        air_temp_f: parsed.data.airTempF,
      })
      .eq('id', id.data);

    if (error) {
      logger.error('updateApplication', error.message);
      return fail('That record could not be updated. Try again.');
    }

    const changes = diffFields(
      {
        rate: existing.data.rate,
        area_acres: existing.data.area_acres,
        wind_speed_mph: existing.data.wind_speed_mph,
        air_temp_f: existing.data.air_temp_f,
      },
      {
        rate: parsed.data.rate,
        area_acres: parsed.data.areaAcres,
        wind_speed_mph: parsed.data.windSpeedMph,
        air_temp_f: parsed.data.airTempF,
      },
      APPLICATION_LABELS
    );

    // A save that changed nothing is not an event. Recording it would bury the
    // edits that matter under a pile of no-ops.
    if (Object.keys(changes).length > 0) {
      await recordAuditEvent({
        viewer,
        action: 'update',
        entityType: 'application',
        entityId: id.data,
        summary: `Edited the ${existing.data.products?.name ?? 'product'} record`,
        changes,
      });
    }

    revalidatePath('/', 'layout');

    return ok({ id: id.data });
  } catch (error: unknown) {
    logger.error('updateApplication', error);
    return fail(toUserMessage(error, 'That record could not be updated. Try again.'));
  }
}

/** Removes a record filed in error. Destructive, so it needs `logs:delete`. */
export async function deleteApplication(
  applicationId: string
): Promise<ActionResult<{ id: string }>> {
  const id = z.string().uuid().safeParse(applicationId);
  if (!id.success) return fail('That record could not be found.');


  try {
    const { viewer, denial } = await requirePermission('logs:delete');
    if (denial) return denial;

    const supabase = getSupabaseAdmin();

    const existing = await supabase
      .from('applications')
      .select('id, rate, products ( name ), activity_logs!inner ( org_id )')
      .eq('id', id.data)
      .eq('activity_logs.org_id', viewer.organization.id)
      .maybeSingle();

    if (existing.error) {
      logger.error('deleteApplication:lookup', existing.error.message);
      return fail('That record could not be removed. Try again.');
    }
    if (!existing.data) return fail('That record could not be found.');

    const { error } = await supabase.from('applications').delete().eq('id', id.data);

    if (error) {
      logger.error('deleteApplication', error.message);
      return fail('That record could not be removed. Try again.');
    }

    // The retracted record's own row is gone; this event is the only remaining
    // evidence that it ever existed, which is exactly why it carries the rate.
    await recordAuditEvent({
      viewer,
      action: 'delete',
      entityType: 'application',
      entityId: id.data,
      summary: `Retracted the ${existing.data.products?.name ?? 'product'} record`,
      changes: { Rate: { from: existing.data.rate, to: null } },
    });

    revalidatePath('/', 'layout');

    return ok({ id: id.data });
  } catch (error: unknown) {
    logger.error('deleteApplication', error);
    return fail(toUserMessage(error, 'That record could not be removed. Try again.'));
  }
}
