'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { fail, ok, toUserMessage, type ActionResult } from '@/lib/actionResult';
import { logger } from '@/lib/logger';
import { recordAuditEvent } from '@/lib/repositories/audit';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requirePermission } from '@/lib/viewer';

/**
 * Correcting a transcription.
 *
 * The Summary on the expanded panel is `recordings.transcript` — what Toph
 * heard, which is the one field on this screen a machine wrote and a human is
 * best placed to fix. Everything else in the log is either structured (the
 * extracted employee, activity, field and times) or measured (the waveform,
 * the pin), so this is where editing belongs.
 *
 * `transcription_confidence` is deliberately *not* touched. It records how sure
 * the transcriber was, and a human correction does not change that history —
 * it is also the input to the Response Accuracy card, which would stop meaning
 * anything if editing a transcript quietly set it to 100%.
 */

const TRANSCRIPT_MAX = 5_000;

const inputSchema = z.object({
  logId: z.string().uuid(),
  transcript: z
    .string()
    .transform((value) => value.replace(/\r\n/g, '\n').trim())
    .pipe(z.string().min(1, 'A transcript cannot be empty.').max(TRANSCRIPT_MAX)),
});

export async function updateTranscript(
  logId: string,
  transcript: string
): Promise<ActionResult<{ transcript: string }>> {
  const parsed = inputSchema.safeParse({ logId, transcript });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'That transcript could not be saved.');
  }


  try {
    const { viewer, denial } = await requirePermission('logs:write');
    if (denial) return denial;
    const { organization } = viewer;
    const supabase = getSupabaseAdmin();

    // `recordings` has no `org_id` of its own — it hangs off the log — so the
    // tenant check goes through `activity_logs` before the write.
    const { data: log, error: lookupError } = await supabase
      .from('activity_logs')
      .select('id')
      .eq('id', parsed.data.logId)
      .eq('org_id', organization.id)
      .maybeSingle();

    if (lookupError) {
      logger.error('updateTranscript:lookup', lookupError.message);
      return fail('That transcript could not be saved. Try again.');
    }
    if (!log) return fail('That log could not be found.');

    // The previous transcript is read first because it is the primary source
    // for the whole log: everything else on the record was derived from these
    // words, so an edit to them has to be recoverable.
    const before = await supabase
      .from('recordings')
      .select('id, transcript')
      .eq('log_id', log.id)
      .maybeSingle();

    const { data, error } = await supabase
      .from('recordings')
      .update({ transcript: parsed.data.transcript })
      .eq('log_id', log.id)
      .select('transcript')
      .maybeSingle();

    if (error) {
      logger.error('updateTranscript', error.message);
      return fail('That transcript could not be saved. Try again.');
    }
    if (!data) return fail('This log has no recording to transcribe.');

    if (before.data && before.data.transcript !== parsed.data.transcript) {
      await recordAuditEvent({
        viewer,
        action: 'update',
        entityType: 'recording',
        entityId: before.data.id,
        summary: 'Corrected a transcript',
        changes: {
          Transcript: { from: before.data.transcript, to: parsed.data.transcript },
        },
      });
    }

    revalidatePath('/', 'layout');

    return ok({ transcript: data.transcript });
  } catch (error: unknown) {
    logger.error('updateTranscript', error);
    return fail(toUserMessage(error, 'That transcript could not be saved. Try again.'));
  }
}
