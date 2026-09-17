import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/supabase/database.types';

export type TophClient = SupabaseClient<Database>;

/**
 * Both variables are public by design: the publishable key can only do what
 * Row Level Security permits, and every policy in this project is read-only.
 * They are still required — a missing value fails loudly at first use rather
 * than producing an empty dashboard.
 */
function readRequiredEnv(name: 'NEXT_PUBLIC_SUPABASE_URL' | 'NEXT_PUBLIC_SUPABASE_ANON_KEY'): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. Copy .env.example to .env.local and fill it in.`);
  }
  return value;
}

let client: TophClient | null = null;

/**
 * Server-side Supabase client, shared across requests.
 *
 * The dashboard renders in Server Components, so there is no browser session to
 * persist and no token to refresh. Every fetch is marked `no-store` so a page
 * refresh always reflects the database rather than Next's fetch cache.
 */
export function getSupabase(): TophClient {
  if (client) {
    return client;
  }

  client = createClient<Database>(
    readRequiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
    readRequiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
      },
    }
  );

  return client;
}

/** Thrown by repositories so callers see which query failed, not just "error". */
export class RepositoryError extends Error {
  constructor(operation: string, cause: string) {
    super(`${operation} failed: ${cause}`);
    this.name = 'RepositoryError';
  }
}
