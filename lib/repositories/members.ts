import { cache } from 'react';
import { z } from 'zod';

import { getSupabase, RepositoryError } from '@/lib/supabase/server';
import type { Member } from '@/lib/types';

const memberSchema = z.object({
  id: z.string().uuid(),
  display_name: z.string(),
  role: z.enum(['admin', 'manager', 'worker']),
});

const toMember = (row: z.infer<typeof memberSchema>): Member => ({
  id: row.id,
  displayName: row.display_name,
  role: row.role,
});

/** Everyone who can sign in to this organisation, most privileged first. */
export const findMembers = cache(async (orgId: string): Promise<readonly Member[]> => {
  const { data, error } = await getSupabase()
    .from('members')
    .select('id, display_name, role')
    .eq('org_id', orgId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new RepositoryError('findMembers', error.message);
  }

  return z.array(memberSchema).parse(data ?? []).map(toMember);
});

/**
 * One member, scoped to the organisation.
 *
 * The id arrives from a cookie the client holds, so it is re-checked against
 * the organisation rather than trusted: a signature proves the value was issued
 * by this server, not that it still names a member of this farm.
 */
export async function findMember(orgId: string, memberId: string): Promise<Member | null> {
  const { data, error } = await getSupabase()
    .from('members')
    .select('id, display_name, role')
    .eq('id', memberId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (error) {
    throw new RepositoryError('findMember', error.message);
  }

  return data ? toMember(memberSchema.parse(data)) : null;
}
