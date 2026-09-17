import { NextResponse } from 'next/server';

/**
 * One response shape for every route handler.
 *
 * Server Actions already return a discriminated `ActionResult`; the HTTP routes
 * had drifted — exports answered with `text/plain`, ingestion with bare JSON —
 * so a client had to know which route it was talking to before it could read a
 * failure. A machine-readable `code` alongside the human `message` is what lets
 * a device branch (retry on `rate_limited`, re-auth on `unauthorised`, give up
 * on `unsupported_media`) without string-matching prose.
 */

export type ApiErrorCode =
  | 'unauthorised'
  | 'forbidden'
  | 'not_found'
  | 'invalid_request'
  | 'unsupported_media'
  | 'payload_too_large'
  | 'rate_limited'
  | 'unavailable'
  | 'server_error';

const STATUS: Record<ApiErrorCode, number> = {
  unauthorised: 401,
  forbidden: 403,
  not_found: 404,
  invalid_request: 400,
  unsupported_media: 415,
  payload_too_large: 413,
  rate_limited: 429,
  unavailable: 503,
  server_error: 500,
};

export interface ApiErrorBody {
  readonly error: {
    readonly code: ApiErrorCode;
    readonly message: string;
    /** Extra context a caller can act on — accepted types, the failing field. */
    readonly detail?: unknown;
  };
}

export function apiError(
  code: ApiErrorCode,
  message: string,
  detail?: unknown
): NextResponse<ApiErrorBody> {
  return NextResponse.json(
    { error: detail === undefined ? { code, message } : { code, message, detail } },
    {
      status: STATUS[code],
      // A failure is never the right thing to serve from a cache, and 429/503
      // in particular must not be pinned by an intermediary.
      headers: { 'cache-control': 'no-store' },
    }
  );
}

export function apiOk<T extends object>(body: T, status = 200): NextResponse<T> {
  return NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

/** A file download: bytes, a filename, and never cached. */
export function apiFile(body: string, contentType: string, filename: string): NextResponse {
  return new NextResponse(body, {
    headers: {
      'content-type': contentType,
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  });
}
