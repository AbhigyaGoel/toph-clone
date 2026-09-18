'use server';

import { revalidatePath } from 'next/cache';

import { fail, ok, type ActionResult } from '@/lib/actionResult';
import { logger } from '@/lib/logger';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

/**
 * Puts the farm back to the state the demo starts from.
 *
 * This app has a real database, so it behaves like one: a correction made an
 * hour ago is still there, and a log marked reviewed stays reviewed. That is
 * the right behaviour and it is also inconvenient for anyone looking at this
 * for the first time after somebody else has clicked around in it — the
 * exceptions have been cleared, the anomaly has been corrected, and the screens
 * that exist to show problems have nothing to show.
 *
 * So the baseline is restorable on demand. Same script as
 * `scripts/reset-demo.mjs`, reachable from the sign-in screen: it rewinds the
 * handful of rows the walkthrough changes and leaves everything else alone.
 */

/** Arnav Shah's spray log — the one the correction walkthrough opens. */
const DEMO_LOG = '00000000-0000-4000-8000-100000000001';

/** The Field K spray the replay and the anomaly flag are both built on. */
const REPLAY_SPRAY = '00000000-0000-4000-8000-300000000101';
const REPLAY_SPRAY_RATE = 2.0;
const REPLAY_SPRAY_AREA = 18.0;

/** How many of the most recent logs start unread, so the inbox has a morning. */
const UNREAD_ON_ARRIVAL = 6;

/** Exactly what `supabase/seed.sql` sets for that recording. */
const PRISTINE = {
  activityType: { value: 'Spraying', confidence: 0.88 },
  product: { value: null, confidence: null },
  rate: { value: null, confidence: null },
  field: { value: 'FIELD A', confidence: 0.93 },
  weather: { value: 'Wind rising, speed not stated', confidence: 0.42 },
};

export async function resetDemo(): Promise<ActionResult<{ unread: number }>> {
  try {
    const db = getSupabaseAdmin();

    // The corrected field, back to what the machine originally heard.
    const { error: fieldsError } = await db
      .from('recordings')
      .update({ extracted_fields: PRISTINE })
      .eq('log_id', DEMO_LOG);
    if (fieldsError) throw new Error(fieldsError.message);

    // The compliance record the walkthrough files, if it got that far.
    const { error: recordError } = await db
      .from('applications')
      .delete()
      .eq('log_id', DEMO_LOG);
    if (recordError) throw new Error(recordError.message);

    // The over-applied rate the anomaly flag is about.
    const { error: sprayError } = await db
      .from('applications')
      .update({ rate: REPLAY_SPRAY_RATE, area_acres: REPLAY_SPRAY_AREA })
      .eq('id', REPLAY_SPRAY);
    if (sprayError) throw new Error(sprayError.message);

    // Everything reviewed, then the most recent few put back to unread — so the
    // inbox opens on a morning's arrivals rather than on nothing.
    const { error: allError } = await db
      .from('activity_logs')
      .update({ status: 'reviewed' })
      .neq('status', 'reviewed');
    if (allError) throw new Error(allError.message);

    const { data: recent, error: recentError } = await db
      .from('activity_logs')
      .select('id')
      .order('started_at', { ascending: false })
      .limit(UNREAD_ON_ARRIVAL);
    if (recentError) throw new Error(recentError.message);

    const ids = (recent ?? []).map((row) => row.id);
    if (ids.length > 0) {
      const { error: unreadError } = await db
        .from('activity_logs')
        .update({ status: 'new' })
        .in('id', ids);
      if (unreadError) throw new Error(unreadError.message);
    }

    revalidatePath('/', 'layout');
    return ok({ unread: ids.length });
  } catch (error: unknown) {
    logger.error('resetDemo', error);
    return fail('The demo could not be reset. Try again.');
  }
}
