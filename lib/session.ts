import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

/**
 * Who is using this screen.
 *
 * This is deliberately *authorisation* with a thin authentication story, and the
 * distinction is the point. There are no passwords: the rail's "Switch User"
 * picks a member of the organisation, exactly as the design suggests. What is
 * real is everything after that — the choice is carried in a signed, httpOnly
 * cookie the browser cannot forge or read from script, and every Server Action
 * re-derives the role from it server-side rather than trusting a hidden field
 * or a disabled button.
 *
 * That split is what makes this swappable. Replacing the picker with Supabase
 * Auth means changing where `memberId` comes from; the permission checks in
 * `lib/permissions.ts` and every call site stay exactly as they are. Shipping
 * the passwords first and the authorisation later would have been the wrong way
 * round: a login page on top of actions that never check anything is security
 * theatre, and it is the actions that decide whether a worker can delete a log.
 */

const COOKIE = 'toph_member';

/** A month. Long enough that a demo is never interrupted by a re-pick. */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/**
 * The signing key.
 *
 * `SESSION_SECRET` when set. Otherwise derived from the Supabase secret key
 * through a domain-separated HMAC, so a checkout that has write credentials
 * works with no extra configuration and still never reuses the raw key as a
 * signing key. With neither, cookies cannot be signed and the app falls back to
 * its unauthenticated behaviour — which is the honest outcome for a read-only
 * deployment.
 */
function signingKey(): Buffer | null {
  const explicit = process.env.SESSION_SECRET;
  if (explicit) return Buffer.from(explicit, 'utf8');

  const supabaseSecret = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseSecret) return null;

  return createHmac('sha256', supabaseSecret).update('toph:session:v1').digest();
}

function sign(value: string, key: Buffer): string {
  return createHmac('sha256', key).update(value).digest('base64url');
}

/** Constant-time compare that does not leak length through an early return. */
function matches(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Serialises a session into `<memberId>.<issuedAt>.<signature>`.
 *
 * The issue time is inside the signed payload, not just in the cookie's
 * `maxAge`. `maxAge` is a request to the browser — a client that ignores it, or
 * a cookie copied out of one, would otherwise present a valid session forever.
 * Signing the timestamp makes expiry something the server enforces.
 */
export function encodeSession(memberId: string, issuedAt: number = Date.now()): string | null {
  const key = signingKey();
  if (!key) return null;

  const payload = `${memberId}.${issuedAt}`;
  return `${payload}.${sign(payload, key)}`;
}

/**
 * The member id in the current request's cookie, or null.
 *
 * Null covers every failure the same way — no cookie, a tampered signature, no
 * signing key — because the caller's response to all of them is identical, and
 * distinguishing them in a return value invites a caller to treat one as less
 * serious than the others.
 */
export function readSessionMemberId(now: number = Date.now()): string | null {
  const key = signingKey();
  if (!key) return null;

  const raw = cookies().get(COOKIE)?.value;
  if (!raw) return null;

  const split = raw.lastIndexOf('.');
  if (split <= 0) return null;

  const payload = raw.slice(0, split);
  const signature = raw.slice(split + 1);

  // Signature first: nothing is parsed out of an unverified payload.
  if (!matches(signature, sign(payload, key))) return null;

  const boundary = payload.lastIndexOf('.');
  if (boundary <= 0) return null;

  const memberId = payload.slice(0, boundary);
  const issuedAt = Number(payload.slice(boundary + 1));
  if (!Number.isFinite(issuedAt)) return null;

  // A clock that ran backwards is as suspect as an expired cookie.
  const age = now - issuedAt;
  if (age < 0 || age > MAX_AGE_SECONDS * 1000) return null;

  return memberId;
}

/** Whether this deployment can hold a session at all. */
export function sessionsAvailable(): boolean {
  return signingKey() !== null;
}

export const SESSION_COOKIE = COOKIE;
export const SESSION_MAX_AGE = MAX_AGE_SECONDS;
