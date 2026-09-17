/**
 * Puts the demo back to its opening state.
 *
 *   node scripts/reset-demo.mjs
 *
 * The walkthrough turns on correcting one field: Arnav's spray log comes in
 * with the product inaudible, the manager types the real one, and three
 * compliance checks re-derive on the spot. Running it leaves that log corrected
 * — so the second run of the presentation opens on a farm with nothing wrong,
 * which is the one thing the demo cannot afford.
 *
 * Correcting through the UI can be undone through the UI, but not completely:
 * clearing the value back to empty still leaves the field flagged as
 * human-checked, and the "edited" pill sits there on a log nobody has edited
 * yet. That flag is the honest record of what happened, so the fix is not to
 * make the app forget — it is to reset the demo data outright, here.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

/** Arnav Shah's spray log — the one the walkthrough opens. */
const DEMO_LOG = '00000000-0000-4000-8000-100000000001';

/** How many of the most recent logs start unread, so the inbox has a morning. */
const UNREAD_ON_ARRIVAL = 6;

/**
 * The spray the Farm Day Replay is built around, and its rate.
 *
 * The replay's whole point is that somebody walked onto Field K while Ben
 * Flora's Spinosad interval was still running, and the anomaly flag is that the
 * same pass was filed at four times his usual rate. A walkthrough that corrects
 * either of those leaves the next run with nothing to find.
 */
const REPLAY_SPRAY = '00000000-0000-4000-8000-300000000101';
const REPLAY_SPRAY_RATE = 2.0;
const REPLAY_SPRAY_AREA = 18.0;

/** Exactly what `supabase/seed.sql` sets for that recording. */
const PRISTINE = {
  activityType: { value: 'Spraying', confidence: 0.88 },
  product: { value: null, confidence: null },
  rate: { value: null, confidence: null },
  field: { value: 'FIELD A', confidence: 0.93 },
  weather: { value: 'Wind rising, speed not stated', confidence: 0.42 },
};

function readEnv() {
  const path = join(process.cwd(), '.env.local');
  if (!existsSync(path)) return;

  const text = readFileSync(path, 'utf8');
  for (const line of text.split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim();
  }
}

async function main() {
  readEnv();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secret) {
    console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local first.');
    process.exit(1);
  }

  const db = createClient(url, secret, { auth: { persistSession: false } });

  const { error } = await db
    .from('recordings')
    .update({ extracted_fields: PRISTINE })
    .eq('log_id', DEMO_LOG);

  if (error) {
    console.error(`Could not reset the demo log: ${error.message}`);
    process.exit(1);
  }

  // The application record the walkthrough files, if it got that far. Without
  // this the second run opens with the spray already documented.
  // `applications` is the table; `application_records` is the read view over it.
  const { error: recordError } = await db
    .from('applications')
    .delete()
    .eq('log_id', DEMO_LOG);

  if (recordError) {
    console.error(`Could not clear the demo application records: ${recordError.message}`);
    process.exit(1);
  }

  // The morning state: the last few days' logs arrived overnight and nobody has
  // read them yet. Without this the inbox is empty on the second run, because
  // the first run reviewed everything — which is the demo working correctly and
  // looking broken.
  const { data: recent, error: recentError } = await db
    .from('activity_logs')
    .select('id')
    .order('started_at', { ascending: false })
    .limit(UNREAD_ON_ARRIVAL);

  if (recentError) {
    console.error(`Could not read the recent logs: ${recentError.message}`);
    process.exit(1);
  }

  const { error: statusError } = await db
    .from('activity_logs')
    .update({ status: 'new' })
    .in('id', (recent ?? []).map((row) => row.id));

  if (statusError) {
    console.error(`Could not mark the recent logs unread: ${statusError.message}`);
    process.exit(1);
  }

  const { error: sprayError } = await db
    .from('applications')
    .update({ rate: REPLAY_SPRAY_RATE, area_acres: REPLAY_SPRAY_AREA })
    .eq('id', REPLAY_SPRAY);

  if (sprayError) {
    console.error(`Could not reset the replay spray: ${sprayError.message}`);
    process.exit(1);
  }

  console.log(
    `Demo reset — Arnav Shah's spray log is uncorrected, ${recent?.length ?? 0} logs unread, ` +
      'the Field K anomaly is back at 2.0 gal/acre.'
  );
}

main();
