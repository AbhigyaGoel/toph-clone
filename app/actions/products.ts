'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { fail, ok, toUserMessage, type ActionResult } from '@/lib/actionResult';
import { logger } from '@/lib/logger';
import { diffFields, recordAuditEvent } from '@/lib/repositories/audit';
import { FOREIGN_KEY_VIOLATION, UNIQUE_VIOLATION } from '@/lib/referenceInput';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requirePermission } from '@/lib/viewer';

/**
 * The product register.
 *
 * REI and PHI are entered here rather than per application because they are
 * properties of the registered label — the same for every use of that product.
 * Editing them re-grades every record that references the product, which is
 * exactly right: if the label's interval was entered wrong, every field it was
 * applied to was calculated wrong too.
 */

const MAX_PRODUCTS = 300;

/**
 * Names and registration numbers are attacker-controlled strings that end up in
 * CSV exports and in `in.(...)` filters, so they are held to a tight alphabet
 * rather than trimmed and hoped for.
 */
const productSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Give the product a name.')
    .max(80, 'That name is too long.')
    .regex(/^[\p{L}\p{N} '&/.\-_%()+,]+$/u, 'That name has characters we cannot store.'),
  kind: z.enum(['chemical', 'fertilizer', 'amendment']),
  epaRegistration: z
    .string()
    .trim()
    .max(40)
    .regex(/^[0-9A-Za-z-]*$/, 'An EPA registration number is digits, letters and dashes.')
    .transform((value) => (value === '' ? null : value))
    .nullable(),
  activeIngredient: z.string().trim().max(120).transform((value) => (value === '' ? null : value)).nullable(),
  rateUnit: z
    .string()
    .trim()
    .min(1, 'Give the rate a unit, e.g. gal/acre.')
    .max(24)
    .regex(/^[\p{L}/ .-]+$/u, 'A unit is letters and a slash, e.g. lb/acre.'),
  reiHours: z.coerce.number().int().min(0).max(2000).nullable(),
  phiDays: z.coerce.number().int().min(0).max(400).nullable(),
});

export type ProductInput = z.infer<typeof productSchema>;

const firstIssue = (error: z.ZodError): string =>
  error.issues[0]?.message ?? 'That product could not be saved.';

/**
 * Field names as a reviewer reads them.
 *
 * `rei_hours` and `phi_days` are the two that matter most: changing either one
 * retroactively changes when every past application of this product was safe to
 * re-enter or to harvest, which is why the register is audited at all.
 */
const PRODUCT_LABELS: Readonly<Record<string, string>> = {
  name: 'Name',
  kind: 'Kind',
  epa_registration: 'EPA registration',
  active_ingredient: 'Active ingredient',
  rate_unit: 'Rate unit',
  rei_hours: 'Re-entry interval (hours)',
  phi_days: 'Pre-harvest interval (days)',
};

export async function createProduct(input: ProductInput): Promise<ActionResult<{ id: string }>> {
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));


  try {
    const { viewer, denial } = await requirePermission('reference:write');
    if (denial) return denial;

    const supabase = getSupabaseAdmin();

    const { count, error: countError } = await supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', viewer.organization.id);

    if (countError) {
      logger.error('createProduct:count', countError.message);
      return fail('That product could not be added. Try again.');
    }
    if ((count ?? 0) >= MAX_PRODUCTS) {
      return fail(`A farm can hold ${MAX_PRODUCTS} products. Remove one before adding another.`);
    }

    const { data, error } = await supabase
      .from('products')
      .insert({
        org_id: viewer.organization.id,
        name: parsed.data.name,
        kind: parsed.data.kind,
        epa_registration: parsed.data.epaRegistration,
        active_ingredient: parsed.data.activeIngredient,
        rate_unit: parsed.data.rateUnit,
        rei_hours: parsed.data.reiHours,
        phi_days: parsed.data.phiDays,
      })
      .select('id')
      .single();

    if (error) {
      if (error.code === UNIQUE_VIOLATION) return fail('That product is already on the list.');
      logger.error('createProduct', error.message);
      return fail('That product could not be added. Try again.');
    }

    await recordAuditEvent({
      viewer,
      action: 'create',
      entityType: 'product',
      entityId: data.id,
      summary: `Added ${parsed.data.name} to the product register`,
      changes: {
        Kind: { from: null, to: parsed.data.kind },
        'EPA registration': { from: null, to: parsed.data.epaRegistration },
        'Re-entry interval (hours)': { from: null, to: parsed.data.reiHours },
        'Pre-harvest interval (days)': { from: null, to: parsed.data.phiDays },
      },
    });

    revalidatePath('/', 'layout');
    return ok({ id: data.id });
  } catch (error: unknown) {
    logger.error('createProduct', error);
    return fail(toUserMessage(error, 'That product could not be added. Try again.'));
  }
}

export async function updateProduct(
  productId: string,
  input: ProductInput
): Promise<ActionResult<{ id: string }>> {
  const id = z.string().uuid().safeParse(productId);
  if (!id.success) return fail('That product could not be found.');

  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));


  try {
    const { viewer, denial } = await requirePermission('reference:write');
    if (denial) return denial;

    const supabase = getSupabaseAdmin();

    // Read first: an edit to a product's REI silently re-dates every re-entry
    // window derived from it, so the trail has to carry the old figure.
    const before = await supabase
      .from('products')
      .select('name, kind, epa_registration, active_ingredient, rate_unit, rei_hours, phi_days')
      .eq('id', id.data)
      .eq('org_id', viewer.organization.id)
      .maybeSingle();

    const { data, error } = await supabase
      .from('products')
      .update({
        name: parsed.data.name,
        kind: parsed.data.kind,
        epa_registration: parsed.data.epaRegistration,
        active_ingredient: parsed.data.activeIngredient,
        rate_unit: parsed.data.rateUnit,
        rei_hours: parsed.data.reiHours,
        phi_days: parsed.data.phiDays,
      })
      .eq('id', id.data)
      .eq('org_id', viewer.organization.id)
      .select('id')
      .maybeSingle();

    if (error) {
      if (error.code === UNIQUE_VIOLATION) return fail('Another product already has that name.');
      logger.error('updateProduct', error.message);
      return fail('That product could not be updated. Try again.');
    }
    if (!data) return fail('That product could not be found.');

    if (before.data) {
      const changes = diffFields(
        {
          name: before.data.name,
          kind: before.data.kind,
          epa_registration: before.data.epa_registration,
          active_ingredient: before.data.active_ingredient,
          rate_unit: before.data.rate_unit,
          rei_hours: before.data.rei_hours,
          phi_days: before.data.phi_days,
        },
        {
          name: parsed.data.name,
          kind: parsed.data.kind,
          epa_registration: parsed.data.epaRegistration,
          active_ingredient: parsed.data.activeIngredient,
          rate_unit: parsed.data.rateUnit,
          rei_hours: parsed.data.reiHours,
          phi_days: parsed.data.phiDays,
        },
        PRODUCT_LABELS
      );

      if (Object.keys(changes).length > 0) {
        await recordAuditEvent({
          viewer,
          action: 'update',
          entityType: 'product',
          entityId: data.id,
          summary: `Edited ${before.data.name} in the product register`,
          changes,
        });
      }
    }

    revalidatePath('/', 'layout');
    return ok({ id: data.id });
  } catch (error: unknown) {
    logger.error('updateProduct', error);
    return fail(toUserMessage(error, 'That product could not be updated. Try again.'));
  }
}

/**
 * Removes a product nothing has been applied from.
 *
 * Refused while any record references it, and the count is checked before the
 * delete so the message can say how many rather than surfacing a foreign-key
 * error. A product's history is the compliance record; deleting it would
 * silently rewrite what was sprayed last season.
 */
export async function deleteProduct(productId: string): Promise<ActionResult<{ id: string }>> {
  const id = z.string().uuid().safeParse(productId);
  if (!id.success) return fail('That product could not be found.');


  try {
    const { viewer, denial } = await requirePermission('reference:delete');
    if (denial) return denial;

    const supabase = getSupabaseAdmin();

    const { count, error: countError } = await supabase
      .from('applications')
      .select('id', { count: 'exact', head: true })
      .eq('product_id', id.data);

    if (countError) {
      logger.error('deleteProduct:count', countError.message);
      return fail('That product could not be removed. Try again.');
    }
    if (count && count > 0) {
      return fail(
        `This product is on ${count} application ${count === 1 ? 'record' : 'records'} and cannot be removed.`
      );
    }

    const { data, error } = await supabase
      .from('products')
      .delete()
      .eq('id', id.data)
      .eq('org_id', viewer.organization.id)
      .select('id, name')
      .maybeSingle();

    if (error) {
      if (error.code === FOREIGN_KEY_VIOLATION) {
        return fail('This product is on an application record and cannot be removed.');
      }
      logger.error('deleteProduct', error.message);
      return fail('That product could not be removed. Try again.');
    }
    if (!data) return fail('That product could not be found.');

    await recordAuditEvent({
      viewer,
      action: 'delete',
      entityType: 'product',
      entityId: data.id,
      summary: `Removed ${data.name} from the product register`,
    });

    revalidatePath('/', 'layout');
    return ok({ id: data.id });
  } catch (error: unknown) {
    logger.error('deleteProduct', error);
    return fail(toUserMessage(error, 'That product could not be removed. Try again.'));
  }
}
