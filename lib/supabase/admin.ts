import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/supabase/database.types';

/**
 * The privileged Supabase client, for writes only.
 *
 * The dashboard's read path uses the publishable key and is safe in the browser
 * because every table's RLS grants `select` and nothing else. Writes cannot go
 * that route without opening those tables to the public internet, so they run
 * here instead: on the server, under the secret key, behind a Server Action
 * that validates its input. The key is never sent to the client — `server-only`
 * turns an accidental client import into a build error rather than a leak.
 */

const SECRET_ENV = 'SUPABASE_SECRET_KEY';
const URL_ENV = 'NEXT_PUBLIC_SUPABASE_URL';

/** Thrown when the deployment has no write credentials configured. */
export class MissingWriteCredentialsError extends Error {
  constructor() {
    super(
      `${SECRET_ENV} is not set, so this build is read-only. ` +
        `Add the secret key from the Supabase dashboard to .env.local.`
    );
    this.name = 'MissingWriteCredentialsError';
  }
}

let client: SupabaseClient<Database> | null = null;

/**
 * Returns the privileged client, creating it on first use.
 *
 * Deliberately lazy: a deployment without the secret key still serves the whole
 * read-only dashboard, and only fails when someone actually tries to write.
 */
export function getSupabaseAdmin(): SupabaseClient<Database> {
  if (client) return client;

  const url = process.env[URL_ENV];
  const secret = process.env[SECRET_ENV];

  if (!url) throw new Error(`${URL_ENV} is not set.`);
  if (!secret) throw new MissingWriteCredentialsError();

  client = createClient<Database>(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return client;
}

/** Whether this deployment can write at all, for disabling controls up front. */
export function hasWriteCredentials(): boolean {
  return Boolean(process.env[SECRET_ENV]);
}
