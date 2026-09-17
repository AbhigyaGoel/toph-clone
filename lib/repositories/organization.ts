import { cache } from 'react';
import { z } from 'zod';

import { ROLE_LABELS } from '@/lib/permissions';
import { getSupabase, RepositoryError } from '@/lib/supabase/server';
import type { Organization } from '@/lib/types';

const FALLBACK_AVATAR = '/assets/avatar.png';

const organizationSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  avatar_url: z.string().nullable(),
  members: z.array(z.object({ role: z.enum(['admin', 'manager', 'worker']) })),
});

/**
 * Held across requests, not just within one.
 *
 * Every screen resolves the organisation before it can scope a single other
 * query, so this sits on the critical path of every page load — one full round
 * trip to a remote Postgres, measured at ~90ms, before anything else may start.
 * The row it reads is a farm's name and avatar; it changes approximately never.
 *
 * Deliberately short. A minute is long enough to take the lookup off the
 * critical path for a burst of navigation, and short enough that renaming the
 * farm shows up while somebody is still looking at the screen they renamed it
 * on. A multi-instance deployment gets one of these per instance, which is
 * correct for a value that is identical everywhere.
 */
const HOLD_MS = 60_000;
let held: { readonly at: number; readonly value: Organization } | null = null;

/**
 * The organisation whose dashboard this is.
 *
 * There is one farm in the database, so this is it. The `role` here is only a
 * fallback for a request with no session — `currentViewer` overwrites it with
 * the signed-in member's role, which is what the rail actually shows.
 *
 * Wrapped in React's `cache` as well, so the shell and the page it frames share
 * one resolution within a request even on the hop that does hit the database.
 */
export const findOrganization = cache(async (): Promise<Organization> => {
  if (held && Date.now() - held.at < HOLD_MS) return held.value;

  const { data, error } = await getSupabase()
    .from('organizations')
    .select('id, name, avatar_url, members ( role )')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new RepositoryError('findOrganization', error.message);
  }
  if (!data) {
    throw new RepositoryError('findOrganization', 'no organisation has been seeded');
  }

  const org = organizationSchema.parse(data);
  const owner = org.members.find((member) => member.role === 'admin') ?? org.members[0];

  const organization: Organization = {
    id: org.id,
    name: org.name,
    role: ROLE_LABELS[owner?.role ?? 'worker'],
    avatarSrc: org.avatar_url ?? FALLBACK_AVATAR,
  };

  held = { at: Date.now(), value: organization };
  return organization;
});

/** Drops the held organisation — for a write that renames the farm. */
export function forgetOrganization(): void {
  held = null;
}
