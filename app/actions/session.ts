'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { fail, ok, type ActionResult } from '@/lib/actionResult';
import { logger } from '@/lib/logger';
import { findMember } from '@/lib/repositories/members';
import { findOrganization } from '@/lib/repositories/organization';
import { encodeSession, SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/session';

/**
 * Signing in and out.
 *
 * There is no password to check, so what these two actions actually do is issue
 * and revoke a signed statement about who the browser is. The signing is the
 * real part: the cookie is httpOnly (script cannot read it), sameSite=lax (it
 * does not ride along on cross-site requests), and carries an HMAC, so the
 * browser can hold it but cannot mint one naming a different member.
 *
 * The member id is still re-checked against the organisation here rather than
 * taken on trust — a signature proves this server issued the value, not that it
 * still names somebody who works here.
 */

const memberIdSchema = z.string().uuid();

export async function signInAs(memberId: string): Promise<ActionResult<{ id: string }>> {
  const parsed = memberIdSchema.safeParse(memberId);
  if (!parsed.success) {
    return fail('That account could not be found.');
  }


  try {
    const organization = await findOrganization();
    const member = await findMember(organization.id, parsed.data);
    if (!member) {
      return fail('That account could not be found.');
    }

    const value = encodeSession(member.id);
    if (!value) {
      return fail('Sessions are not configured on this deployment.');
    }

    cookies().set(SESSION_COOKIE, value, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: SESSION_MAX_AGE,
    });

    revalidatePath('/', 'layout');

    return ok({ id: member.id });
  } catch (error: unknown) {
    logger.error('signInAs', error);
    return fail('Could not switch account. Try again.');
  }
}

export async function signOut(): Promise<ActionResult<null>> {

  cookies().delete(SESSION_COOKIE);
  revalidatePath('/', 'layout');

  return ok(null);
}
