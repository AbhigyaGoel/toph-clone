import 'server-only';

import { logger } from '@/lib/logger';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

/**
 * Audio lives in a private Supabase Storage bucket.
 *
 * Private, not public: a recording is a worker speaking, and the transcript it
 * produces is a compliance record. Reads go through short-lived signed URLs
 * minted on the server for a viewer who has already been authorised.
 */

export const AUDIO_BUCKET = 'recordings';

/** Long enough to play a five-minute log, short enough not to be a share link. */
const SIGNED_URL_SECONDS = 60 * 30;

const EXTENSIONS: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
};

export function isSupportedAudio(mime: string): boolean {
  return mime in EXTENSIONS;
}

export const SUPPORTED_AUDIO = Object.keys(EXTENSIONS);

/** `<org>/<yyyy-mm>/<uuid>.webm` — sharded by month so a bucket listing stays usable. */
function audioKey(orgId: string, jobId: string, mime: string): string {
  const month = new Date().toISOString().slice(0, 7);
  return `${orgId}/${month}/${jobId}.${EXTENSIONS[mime] ?? 'bin'}`;
}

/** Creates the bucket on first use, so a fresh project needs no manual setup. */
async function ensureBucket(): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.storage.getBucket(AUDIO_BUCKET);
  if (data) return;

  const { error } = await supabase.storage.createBucket(AUDIO_BUCKET, {
    public: false,
    allowedMimeTypes: SUPPORTED_AUDIO,
    fileSizeLimit: '50MB',
  });

  // A concurrent upload may have created it between the check and the create.
  if (error && !/already exists/i.test(error.message)) throw error;
}

export async function uploadAudio(
  orgId: string,
  jobId: string,
  audio: Blob
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  try {
    await ensureBucket();

    const path = audioKey(orgId, jobId, audio.type);
    const { error } = await getSupabaseAdmin()
      .storage.from(AUDIO_BUCKET)
      .upload(path, audio, { contentType: audio.type, upsert: true });

    if (error) throw error;
    return { ok: true, path };
  } catch (error: unknown) {
    logger.error('uploadAudio', error);
    return { ok: false, error: 'Could not store the recording.' };
  }
}

/**
 * A signed URL for a stored recording, or null.
 *
 * Null rather than throwing: a missing file should make the player say the
 * recording is unavailable, exactly as it does for a log that never had one.
 */
export async function signedAudioUrl(path: string): Promise<string | null> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .storage.from(AUDIO_BUCKET)
      .createSignedUrl(path, SIGNED_URL_SECONDS);

    if (error) throw error;
    return data?.signedUrl ?? null;
  } catch (error: unknown) {
    logger.error('signedAudioUrl', error);
    return null;
  }
}

/** Removes stored audio. Used once an undo window has closed for good. */
export async function removeAudio(paths: readonly string[]): Promise<void> {
  if (paths.length === 0) return;

  try {
    const { error } = await getSupabaseAdmin().storage.from(AUDIO_BUCKET).remove([...paths]);
    if (error) throw error;
  } catch (error: unknown) {
    logger.error('removeAudio', error);
  }
}
