import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { apiError, apiOk } from '@/lib/apiResponse';
import { runIngestion } from '@/lib/ingest/pipeline';
import { isSupportedAudio, SUPPORTED_AUDIO } from '@/lib/ingest/storage';
import { extractionAvailable } from '@/lib/ingest/extract';
import { transcriptionAvailable } from '@/lib/ingest/transcribe';
import { logger } from '@/lib/logger';
import { findOrganization } from '@/lib/repositories/organization';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
/** Whisper on a five-minute log is slow; the default 10s would cut it off. */
export const maxDuration = 120;

/** 50MB is ~40 minutes of Opus. Anything larger is not a voice log. */
const MAX_BYTES = 50 * 1024 * 1024;

const metadataSchema = z.object({
  employeeId: z.string().uuid(),
  transcript: z.string().max(20_000).optional(),
  language: z.string().max(12).regex(/^[a-zA-Z-]+$/).optional(),
  deviceLabel: z.string().max(80).optional(),
  recordedAt: z.string().datetime().optional(),
  durationSeconds: z.coerce.number().int().min(0).max(24 * 3600).optional(),
});

/** Constant-time bearer check against `INGEST_API_KEY`. */
function authorised(request: NextRequest): boolean {
  const expected = process.env.INGEST_API_KEY;
  if (!expected) return false;

  const header = request.headers.get('authorization') ?? '';
  const presented = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!presented) return false;

  // Hashed first so the compare is fixed-length whatever the caller sends.
  const digest = (value: string) => createHmac('sha256', 'toph:ingest').update(value).digest();
  return timingSafeEqual(digest(presented), digest(expected));
}

/**
 * The endpoint the field app posts a recording to.
 *
 * `multipart/form-data` with an `audio` file and a `metadata` JSON part, or
 * metadata alone carrying a `transcript` for a device that transcribed locally
 * — which is also how the pipeline is exercised without provider keys.
 *
 * Authenticated by a bearer token rather than the dashboard's session cookie:
 * the caller is a device, not a browser, and there is nothing for sameSite to
 * protect. Per-device tokens in a table are the next step; the shape of this
 * handler does not change when they arrive.
 */
export async function POST(request: NextRequest) {
  if (!process.env.INGEST_API_KEY) {
    return apiError('unavailable', 'Ingestion is not configured on this deployment.');
  }
  if (!authorised(request)) {
    return apiError('unauthorised', 'A valid bearer token is required.');
  }

  try {
    const form = await request.formData();

    const raw = form.get('metadata');
    const parsed = metadataSchema.safeParse(
      typeof raw === 'string' ? JSON.parse(raw) : Object.fromEntries(form.entries())
    );
    if (!parsed.success) {
      return apiError('invalid_request', 'Invalid metadata.', {
        field: parsed.error.issues[0]?.path.join('.'),
        reason: parsed.error.issues[0]?.message,
      });
    }

    const file = form.get('audio');
    const audio = file instanceof Blob && file.size > 0 ? file : null;

    if (audio) {
      if (audio.size > MAX_BYTES) {
        return apiError('payload_too_large', 'Recording is too large.', { maxBytes: MAX_BYTES });
      }
      if (!isSupportedAudio(audio.type)) {
        return apiError('unsupported_media', 'Unsupported audio type.', {
          received: audio.type,
          supported: SUPPORTED_AUDIO,
        });
      }
    }

    if (!audio && !parsed.data.transcript) {
      return apiError(
        'invalid_request',
        'Send an audio file, or a transcript if the device already has one.'
      );
    }

    const organization = await findOrganization();

    // The worker id comes from a device, so it is re-checked against the farm.
    const employee = await getSupabaseAdmin()
      .from('employees')
      .select('id')
      .eq('id', parsed.data.employeeId)
      .eq('org_id', organization.id)
      .maybeSingle();

    if (employee.error || !employee.data) {
      return apiError('not_found', 'Unknown worker for this farm.');
    }

    const result = await runIngestion({
      orgId: organization.id,
      employeeId: employee.data.id,
      audio,
      transcript: parsed.data.transcript ?? null,
      language: parsed.data.language ?? null,
      deviceLabel: parsed.data.deviceLabel ?? null,
      recordedAt: parsed.data.recordedAt ?? null,
      durationSeconds: parsed.data.durationSeconds ?? null,
    });

    // 201 for a log that now exists; 422 when the upload was understood but
    // could not become one. The log id is the answer a device cares about.
    return apiOk(
      {
        status: result.status,
        logId: result.logId,
        warnings: result.warnings,
        error: result.error,
        providers: {
          transcription: transcriptionAvailable() ? 'configured' : 'offline',
          extraction: extractionAvailable() ? 'configured' : 'heuristic',
        },
      },
      result.status === 'complete' ? 201 : 422
    );
  } catch (error: unknown) {
    logger.error('ingest:route', error);
    return apiError('server_error', 'Ingestion failed.');
  }
}

/** What a device can check before it starts recording. */
export async function GET() {
  return apiOk({
    ready: Boolean(process.env.INGEST_API_KEY),
    accepts: SUPPORTED_AUDIO,
    maxBytes: MAX_BYTES,
    providers: {
      transcription: transcriptionAvailable() ? 'configured' : 'offline',
      extraction: extractionAvailable() ? 'configured' : 'heuristic',
    },
  });
}
