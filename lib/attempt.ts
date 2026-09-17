import type { ActionResult } from '@/lib/actionResult';

/**
 * What the client sees when the action never made it to the server.
 *
 * Deliberately says the change was *not* saved. The opposite guess is the
 * dangerous one on a compliance record: a reviewer told "something went wrong"
 * may assume the write landed and move on, and the log stays unreviewed.
 */
export const TRANSPORT_FAILURE =
  'Could not reach the server, so nothing was saved. Check your connection and try again.';

/**
 * Calls a Server Action and turns a thrown transport error into a failed result.
 *
 * Actions return an `ActionResult` and never throw for reasons of their own, but
 * the call itself still can: the browser is offline, the deploy rotated
 * mid-request, the action endpoint 500s. Without this the promise rejects inside
 * a `useTransition` callback, which React reports to the console and nowhere
 * else — so an optimistic row would sit there showing a change that never
 * happened, with nothing to tell the user and no rollback.
 */
export async function attempt<T>(
  run: () => Promise<ActionResult<T>>,
  fallback: string = TRANSPORT_FAILURE
): Promise<ActionResult<T>> {
  try {
    return await run();
  } catch {
    return { success: false, error: fallback };
  }
}
