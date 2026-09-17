import 'server-only';

import { cache } from 'react';

import { fail, type ActionResult } from '@/lib/actionResult';
import { can, refusalMessage, ROLE_LABELS, type Permission } from '@/lib/permissions';
import { findMember } from '@/lib/repositories/members';
import { findOrganization } from '@/lib/repositories/organization';
import { readSessionMemberId, sessionsAvailable } from '@/lib/session';
import { hasWriteCredentials } from '@/lib/supabase/admin';
import type { Member, Viewer } from '@/lib/types';

/**
 * Who is asking, resolved from the request's cookie.
 *
 * Every page and every Server Action goes through here, so there is exactly one
 * answer per request to "who is this and what may they do". The cookie carries
 * only an id and a signature; the role is read from the database each time
 * rather than stored in the cookie, so demoting someone takes effect on their
 * next request instead of whenever their cookie happens to expire.
 */
export const currentViewer = cache(async (): Promise<Viewer> => {
  const organization = await findOrganization();
  const memberId = readSessionMemberId();
  const member = memberId ? await findMember(organization.id, memberId) : null;

  return {
    member,
    // The rail shows the organisation with the signed-in member's role beside
    // it, which is what the design draws — it just is not a constant any more.
    organization: member ? { ...organization, role: ROLE_LABELS[member.role] } : organization,
    canWrite: hasWriteCredentials() && member !== null && member.role !== 'worker',
    writeBlockedReason: writeBlockedReason(member),
  };
});

function writeBlockedReason(member: Member | null): string | null {
  if (!hasWriteCredentials()) {
    return 'This deployment is read-only — no write credentials configured.';
  }
  if (!member) {
    return 'Sign in to make changes.';
  }
  if (member.role === 'worker') {
    return 'Worker accounts have read-only access.';
  }
  return null;
}

/** Whether a sign-in screen is meaningful at all on this deployment. */
export function signInAvailable(): boolean {
  return sessionsAvailable();
}

/**
 * The gate every writing Server Action opens with.
 *
 * Returns the failure to hand straight back, or null to proceed. Deliberately
 * not a thrown exception: the actions all return an `ActionResult`, and a
 * refusal is an ordinary answer the UI shows, not an exceptional one.
 *
 * This runs *before* the action looks anything up, so a refusal reveals nothing
 * about whether the record exists.
 */
export async function requirePermission(
  permission: Permission
): Promise<{ readonly viewer: Viewer; readonly denial: ActionResult<never> | null }> {
  const viewer = await currentViewer();

  if (!viewer.member) {
    return { viewer, denial: fail<never>('Sign in to make changes.') };
  }
  if (!can(viewer.member.role, permission)) {
    return { viewer, denial: fail<never>(refusalMessage(viewer.member.role, permission)) };
  }

  return { viewer, denial: null };
}
