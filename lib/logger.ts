import 'server-only';

/**
 * The server-side log sink.
 *
 * Errors from the database can carry column names, constraint names and
 * connection details, so they are written here and never returned to the
 * browser — the user gets a message we wrote, the detail stays on the server.
 * A single indirection so swapping in a real transport (pino, a hosted
 * collector) is one file rather than a search across the codebase.
 */

const serialise = (error: unknown): string => {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return typeof error === 'string' ? error : JSON.stringify(error);
};

export const logger = {
  error(scope: string, error: unknown): void {
    // eslint-disable-next-line no-console -- the transport, not stray debugging.
    console.error(`[${scope}] ${serialise(error)}`);
  },
};
