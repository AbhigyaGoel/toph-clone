'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { fail, ok, toUserMessage, type ActionResult } from '@/lib/actionResult';
import { FIELD_LABELS, FIELD_ORDER } from '@/lib/extraction';
import { logger } from '@/lib/logger';
import { recordAuditEvent } from '@/lib/repositories/audit';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type { Json } from '@/lib/supabase/database.types';
import type { ExtractedFields } from '@/lib/types';
import { requirePermission } from '@/lib/viewer';

/**
 * Correcting what the machine heard.
 *
 * Speech recognition degrades exactly where this product needs it most:
 * chemical names it has never seen, a diesel engine running, wind across the
 * microphone. The extraction is a starting point, not an answer — and without a
 * way to fix the 5% it gets wrong, the extracted fields are decoration and the
 * record is never audit-ready.
 *
 * A correction replaces the value and drops the confidence score, because a
 * number that came from the transcriber no longer describes a value a person
 * typed. `corrected` is what the panel uses to mark the field as human-checked.
 */

const inputSchema = z.object({
  logId: z.string().uuid(),
  field: z.enum(FIELD_ORDER),
  // Empty means "the machine invented this; there was nothing there" — a
  // correction in the other direction, and one a reviewer genuinely needs.
  value: z.string().trim().max(120),
});

export async function correctExtractedField(
  logId: string,
  field: string,
  value: string
): Promise<ActionResult<{ logId: string }>> {
  const parsed = inputSchema.safeParse({ logId, field, value });
  if (!parsed.success) {
    return fail('That correction could not be saved.');
  }

  try {
    const { viewer, denial } = await requirePermission('logs:write');
    if (denial) return denial;

    const supabase = getSupabaseAdmin();

    // Scoped through the log, because `recordings` carries no `org_id` of its
    // own and the secret key bypasses Row Level Security.
    const owner = await supabase
      .from('activity_logs')
      .select('id')
      .eq('id', parsed.data.logId)
      .eq('org_id', viewer.organization.id)
      .maybeSingle();

    if (owner.error) {
      logger.error('correctExtractedField:owner', owner.error.message);
      return fail('That correction could not be saved. Try again.');
    }
    if (!owner.data) return fail('That log could not be found.');

    const existing = await supabase
      .from('recordings')
      .select('id, extracted_fields')
      .eq('log_id', parsed.data.logId)
      .maybeSingle();

    if (existing.error) {
      logger.error('correctExtractedField:read', existing.error.message);
      return fail('That correction could not be saved. Try again.');
    }
    if (!existing.data) return fail('This log has no recording to correct.');

    const current = (existing.data.extracted_fields ?? {}) as ExtractedFields;
    const was = current[parsed.data.field]?.value ?? null;
    const now = parsed.data.value === '' ? null : parsed.data.value;

    if (was === now) return ok({ logId: parsed.data.logId });

    const next: ExtractedFields = {
      ...current,
      [parsed.data.field]: {
        value: now,
        // Confidence described how sure the transcriber was. A person typed
        // this, so the number no longer means anything and carrying it forward
        // would keep flagging a field that has already been checked.
        confidence: null,
        corrected: true,
        // What the machine heard, kept once and never overwritten.
        //
        // This is the only record of the mistake, and it is what makes the
        // farm's vocabulary possible: "Spinosad, corrected three times from
        // 'spin assault'" is a fact about the extractor that no other row
        // holds. Keeping the *first* original matters — a second correction is
        // a person fixing their own typo, and letting that overwrite the
        // machine's version would erase the only useful half of the pair.
        original: current[parsed.data.field]?.original ?? was,
      },
    };

    const { error } = await supabase
      .from('recordings')
      .update({ extracted_fields: next as unknown as Json })
      .eq('id', existing.data.id);

    if (error) {
      logger.error('correctExtractedField', error.message);
      return fail('That correction could not be saved. Try again.');
    }

    await recordAuditEvent({
      viewer,
      action: 'update',
      entityType: 'recording',
      entityId: existing.data.id,
      summary: `Corrected ${FIELD_LABELS[parsed.data.field].toLowerCase()}`,
      changes: { [FIELD_LABELS[parsed.data.field]]: { from: was, to: now } },
    });

    revalidatePath('/', 'layout');

    return ok({ logId: parsed.data.logId });
  } catch (error: unknown) {
    logger.error('correctExtractedField', error);
    return fail(toUserMessage(error, 'That correction could not be saved. Try again.'));
  }
}
