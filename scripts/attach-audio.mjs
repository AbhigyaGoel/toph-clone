/**
 * Points each recording at an audio file in `public/audio/`.
 *
 * Drop files in named after the worker who dictated the log — `isaac-wang.mp3`,
 * `Maya Patel.m4a`, `noah_brown.wav` all match — and run:
 *
 *   node scripts/attach-audio.mjs           # show what would change
 *   node scripts/attach-audio.mjs --apply   # write recordings.audio_url
 *
 * Matching on the worker's name rather than the recording's id is deliberate:
 * the ids are opaque UUIDs, and a human recording eleven clips should not have
 * to look each one up. The column stores the public path, so the file is served
 * by Next from `public/` with no storage bucket in the way. Moving to Supabase
 * Storage later changes the value written here and nothing else.
 */

import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { extname, basename, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const AUDIO_DIR = join(process.cwd(), 'public', 'audio');
const PLAYABLE = new Set(['.mp3', '.m4a', '.wav', '.ogg', '.webm', '.aac', '.flac']);
const apply = process.argv.includes('--apply');

/** "Isaac Wang", "isaac_wang", "isaac-wang" all reduce to "isaacwang". */
const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

function readEnv() {
  // .env.local is not loaded outside Next, so read it here rather than making
  // the operator export three variables by hand.
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

  if (!existsSync(AUDIO_DIR)) {
    console.error(`No ${AUDIO_DIR}. Create it and drop the audio files in.`);
    process.exit(1);
  }

  const files = readdirSync(AUDIO_DIR).filter((name) => PLAYABLE.has(extname(name).toLowerCase()));

  if (files.length === 0) {
    console.error('No playable audio files found in public/audio/.');
    process.exit(1);
  }

  const supabase = createClient(url, secret, { auth: { persistSession: false } });

  const { data, error } = await supabase
    .from('recordings')
    .select('id, audio_url, activity_logs ( employees ( full_name ) )');

  if (error) {
    console.error('Could not read recordings:', error.message);
    process.exit(1);
  }

  const byWorker = new Map(
    files.map((file) => [slug(basename(file, extname(file))), file])
  );

  const planned = [];
  const unmatched = [];

  for (const recording of data) {
    const name = recording.activity_logs?.employees?.full_name;
    if (!name) continue;

    const file = byWorker.get(slug(name));
    if (!file) {
      unmatched.push(name);
      continue;
    }

    planned.push({ id: recording.id, name, url: `/audio/${file}` });
  }

  for (const row of planned) {
    console.log(`${apply ? 'setting' : 'would set'}  ${row.name.padEnd(18)} -> ${row.url}`);
  }
  for (const name of unmatched) {
    console.log(`no file for  ${name}`);
  }

  if (!apply) {
    console.log(`\n${planned.length} of ${data.length} recordings would be attached.`);
    console.log('Re-run with --apply to write them.');
    return;
  }

  for (const row of planned) {
    const { error: writeError } = await supabase
      .from('recordings')
      .update({ audio_url: row.url })
      .eq('id', row.id);

    if (writeError) {
      console.error(`Failed on ${row.name}: ${writeError.message}`);
      process.exit(1);
    }
  }

  console.log(`\nAttached ${planned.length} recordings.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
