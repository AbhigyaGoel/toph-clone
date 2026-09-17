import 'server-only';

import { logger } from '@/lib/logger';
import type { Transcriber, Transcription } from '@/lib/ingest/types';

/**
 * Speech to text.
 *
 * Two real providers and one offline fallback, chosen by which key is present.
 * The fallback is not a mock for tests — it is what a deployment without keys
 * actually runs, so the ingestion endpoint, the job table and the Audit Manager
 * are all exercisable before anyone has signed up for anything.
 */

const WHISPER_URL = 'https://api.openai.com/v1/audio/transcriptions';
const DEEPGRAM_URL = 'https://api.deepgram.com/v1/listen';

/** Whisper returns per-segment logprobs; this folds them into one 0–1 number. */
function confidenceFromLogprobs(segments: ReadonlyArray<{ avg_logprob?: number }>): number {
  if (segments.length === 0) return 0.75;
  const mean =
    segments.reduce((sum, segment) => sum + (segment.avg_logprob ?? -0.5), 0) / segments.length;
  // avg_logprob is roughly -1.5 (poor) to 0 (certain).
  return Math.min(1, Math.max(0, 1 + mean / 1.5));
}

const openai = (apiKey: string): Transcriber => ({
  name: 'openai:whisper-1',
  async transcribe(audio, hintLanguage) {
    const body = new FormData();
    body.append('file', audio, 'recording.webm');
    body.append('model', 'whisper-1');
    body.append('response_format', 'verbose_json');
    if (hintLanguage) body.append('language', hintLanguage);

    const response = await fetch(WHISPER_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}` },
      body,
    });

    if (!response.ok) {
      throw new Error(`whisper ${response.status}`);
    }

    const json = (await response.json()) as {
      text?: string;
      language?: string;
      duration?: number;
      segments?: Array<{ avg_logprob?: number }>;
    };

    return {
      text: (json.text ?? '').trim(),
      confidence: confidenceFromLogprobs(json.segments ?? []),
      language: json.language ?? hintLanguage ?? 'en',
      durationSeconds: Math.round(json.duration ?? 0),
    };
  },
});

const deepgram = (apiKey: string): Transcriber => ({
  name: 'deepgram:nova-2',
  async transcribe(audio, hintLanguage) {
    const params = new URLSearchParams({
      model: 'nova-2',
      smart_format: 'true',
      detect_language: hintLanguage ? 'false' : 'true',
    });
    if (hintLanguage) params.set('language', hintLanguage);

    const response = await fetch(`${DEEPGRAM_URL}?${params}`, {
      method: 'POST',
      headers: {
        authorization: `Token ${apiKey}`,
        'content-type': audio.type || 'audio/webm',
      },
      body: audio,
    });

    if (!response.ok) {
      throw new Error(`deepgram ${response.status}`);
    }

    const json = (await response.json()) as {
      metadata?: { duration?: number };
      results?: {
        channels?: Array<{
          detected_language?: string;
          alternatives?: Array<{ transcript?: string; confidence?: number }>;
        }>;
      };
    };

    const channel = json.results?.channels?.[0];
    const best = channel?.alternatives?.[0];

    return {
      text: (best?.transcript ?? '').trim(),
      confidence: best?.confidence ?? 0.75,
      language: channel?.detected_language ?? hintLanguage ?? 'en',
      durationSeconds: Math.round(json.metadata?.duration ?? 0),
    };
  },
});

/**
 * No key configured.
 *
 * Accepts a `transcript` field on the upload instead of audio, so the rest of
 * the pipeline — extraction, reference resolution, log creation, the compliance
 * record — is fully exercisable. Confidence is deliberately low: nothing here
 * was heard, and a record built from it should not claim otherwise.
 */
const offline: Transcriber = {
  name: 'offline',
  async transcribe() {
    return {
      text: '',
      confidence: 0.5,
      language: 'en',
      durationSeconds: 0,
    };
  },
};

export function transcriber(): Transcriber {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) return openai(openaiKey);

  const deepgramKey = process.env.DEEPGRAM_API_KEY;
  if (deepgramKey) return deepgram(deepgramKey);

  return offline;
}

export function transcriptionAvailable(): boolean {
  return Boolean(process.env.OPENAI_API_KEY || process.env.DEEPGRAM_API_KEY);
}

/** Transcribes, or reports why it could not, without throwing at the caller. */
export async function safeTranscribe(
  audio: Blob,
  hintLanguage?: string
): Promise<{ ok: true; value: Transcription } | { ok: false; error: string }> {
  const provider = transcriber();

  try {
    const value = await provider.transcribe(audio, hintLanguage);
    return { ok: true, value };
  } catch (error: unknown) {
    logger.error('transcribe', error);
    return { ok: false, error: `Transcription failed (${provider.name}).` };
  }
}
