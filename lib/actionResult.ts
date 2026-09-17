/**
 * The envelope every Server Action returns.
 *
 * Actions never throw across the network boundary: a thrown error in a Server
 * Action reaches the client as an opaque digest, which is useless to the UI and
 * leaks a stack trace into the server log for what is often an ordinary
 * validation failure. Returning a discriminated union instead means the caller
 * has to handle both outcomes, and the message the user sees is one we wrote.
 */
export type ActionResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: string };

export const ok = <T>(data: T): ActionResult<T> => ({ success: true, data });

export const fail = <T>(error: string): ActionResult<T> => ({ success: false, error });

/**
 * Turns an unknown throwable into a message safe to show a user.
 *
 * Repository and Postgres errors can carry column names, constraint names and
 * connection details, so only errors we raised ourselves are passed through;
 * anything else is logged server-side and reported generically.
 */
export function toUserMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.name === 'MissingWriteCredentialsError') {
    return 'This deployment is read-only — no write credentials are configured.';
  }
  return fallback;
}
