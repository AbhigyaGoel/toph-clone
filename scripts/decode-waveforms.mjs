#!/usr/bin/env node
/**
 * Real waveforms, decoded from the real audio.
 *
 * The seeded waveforms were plausible-looking amplitude arrays. These are the
 * actual peaks of the actual files, so the shape under the playhead corresponds
 * to what you hear — which is the whole reason a waveform is drawn rather than
 * a progress bar.
 *
 * ffmpeg decodes each file to raw mono 16-bit PCM on stdout; this chunks that
 * into the 98 windows the Figma's waveform has and takes each window's peak.
 * Peak rather than mean: a mean over a 400ms window flattens speech into a
 * uniform sausage, and the transients are the part a person recognises.
 *
 * Transcripts are deliberately untouched. The audio is music; the words on the
 * record are what a farm worker said, and they stay that way.
 *
 *   node scripts/decode-waveforms.mjs           # dry run
 *   node scripts/decode-waveforms.mjs --apply   # writes to the database
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const BARS = 98;
const AUDIO_DIR = 'public/audio';
const APPLY = process.argv.includes('--apply');

function env(name) {
  const file = readFileSync('.env.local', 'utf8');
  for (const line of file.split(/\r?\n/)) {
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    if (line.slice(0, eq).trim() === name) {
      return line.slice(eq + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
    }
  }
  return null;
}

const URL_BASE = env('NEXT_PUBLIC_SUPABASE_URL');
const SECRET = env('SUPABASE_SECRET_KEY');
if (!URL_BASE || !SECRET) {
  console.error('Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local');
  process.exit(1);
}

const headers = {
  apikey: SECRET,
  authorization: `Bearer ${SECRET}`,
  'content-type': 'application/json',
};

/** Seconds, from ffprobe rather than guessed from the file size. */
function durationOf(file) {
  const out = spawnSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file],
    { encoding: 'utf8' }
  );
  return Math.max(1, Math.round(Number(out.stdout.trim()) || 0));
}

/**
 * `BARS` normalised peaks across the whole file.
 *
 * Normalised to the loudest window rather than to full scale: these are
 * mastered tracks that never approach 0 dBFS in a single 400ms window, and
 * scaling to the absolute maximum would draw every waveform at a third of the
 * frame's height.
 */
function peaksOf(file) {
  const out = spawnSync(
    'ffmpeg',
    ['-v', 'error', '-i', file, '-ac', '1', '-ar', '8000', '-f', 's16le', '-'],
    { encoding: 'buffer', maxBuffer: 1024 * 1024 * 512 }
  );

  const pcm = out.stdout;
  if (!pcm || pcm.length < 2) return null;

  const samples = Math.floor(pcm.length / 2);
  const window = Math.floor(samples / BARS);
  if (window < 1) return null;

  const peaks = [];
  for (let bar = 0; bar < BARS; bar += 1) {
    let peak = 0;
    for (let i = bar * window; i < (bar + 1) * window; i += 1) {
      const value = Math.abs(pcm.readInt16LE(i * 2));
      if (value > peak) peak = value;
    }
    peaks.push(peak);
  }

  const loudest = Math.max(...peaks, 1);
  // The design's quietest tick is a hairline rather than nothing, so silence
  // still reads as part of the recording.
  return peaks.map((peak) => Math.max(0.08, Math.round((peak / loudest) * 1000) / 1000));
}

async function main() {
  const files = readdirSync(AUDIO_DIR).filter((name) => /\.(mp3|m4a|wav|ogg|webm|aac|flac)$/i.test(name));
  if (files.length === 0) {
    console.error(`No audio in ${AUDIO_DIR}`);
    process.exit(1);
  }

  const response = await fetch(
    `${URL_BASE}/rest/v1/recordings?select=id,log_id,duration_seconds,activity_logs(employees(full_name))&order=recorded_at.asc`,
    { headers }
  );
  const recordings = await response.json();
  if (!Array.isArray(recordings)) {
    console.error('Could not read recordings:', recordings);
    process.exit(1);
  }

  console.log(`${files.length} audio files, ${recordings.length} recordings\n`);

  for (const [index, recording] of recordings.entries()) {
    // One track per recording, in a stable order, cycling if there are fewer
    // files than logs. Which song lands on which worker does not matter; that
    // it is the same one every run does.
    const file = files[index % files.length];
    const full = path.join(AUDIO_DIR, file);

    const amplitudes = peaksOf(full);
    if (!amplitudes) {
      console.log(`  skip  ${file} — could not decode`);
      continue;
    }

    const seconds = durationOf(full);
    const worker = recording.activity_logs?.employees?.full_name ?? 'unknown';
    // "Voiced" drives the design's strong/muted split. For music the whole
    // track carries signal, so everything above a low floor counts.
    const voiced = amplitudes.filter((a) => a > 0.15).length;

    console.log(
      `  ${worker.padEnd(18)} ${file.padEnd(30)} ${String(seconds).padStart(4)}s  peak bars ${voiced}/${BARS}`
    );

    if (!APPLY) continue;

    const patch = await fetch(`${URL_BASE}/rest/v1/recordings?id=eq.${recording.id}`, {
      method: 'PATCH',
      headers: { ...headers, prefer: 'return=minimal' },
      body: JSON.stringify({
        audio_url: `/audio/${file}`,
        duration_seconds: seconds,
        waveform: { amplitudes, voiced_bars: voiced },
      }),
    });

    if (!patch.ok) console.log(`    FAILED ${patch.status} ${await patch.text()}`);
  }

  console.log(APPLY ? '\nWritten.' : '\nDry run — pass --apply to write.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
