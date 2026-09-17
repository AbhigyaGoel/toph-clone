import type { MemberRole } from '@/lib/types';

/**
 * What each role may do.
 *
 * One table, consulted by every Server Action, rather than a condition spread
 * across seventeen of them. A permission matrix you can read in one screen is a
 * permission matrix you can audit; a `if (role !== 'worker')` repeated in each
 * action is how the seventh one silently disagrees with the other six.
 *
 * The verbs are named for the product, not for HTTP: "review" and "manage
 * reference" are things a farm office does, and the point of the split is that
 * the manager who corrects logs all day is not also the person who should be
 * able to delete them.
 */
export type Permission =
  /** Create and edit logs, tags and transcript corrections. */
  | 'logs:write'
  /** Set a log's review status. */
  | 'logs:review'
  /** Delete logs, and undo that deletion. */
  | 'logs:delete'
  /** Add and rename employees, fields, activity types, tags and products. */
  | 'reference:write'
  /** Remove them. */
  | 'reference:delete';

const MATRIX: Record<MemberRole, readonly Permission[]> = {
  admin: ['logs:write', 'logs:review', 'logs:delete', 'reference:write', 'reference:delete'],
  manager: ['logs:write', 'logs:review', 'reference:write'],
  worker: [],
};

export function can(role: MemberRole, permission: Permission): boolean {
  return MATRIX[role].includes(permission);
}

/** Human labels for the role chip and the Switch User list. */
export const ROLE_LABELS: Record<MemberRole, string> = {
  admin: 'Admin',
  manager: 'Manager',
  worker: 'Worker',
};

/** One line describing what a role can do, for the Switch User list. */
export const ROLE_SUMMARIES: Record<MemberRole, string> = {
  admin: 'Full access, including deleting logs and reference data',
  manager: 'Review, correct and add — but not delete',
  worker: 'Read only',
};

/**
 * The message a refused write returns.
 *
 * Names the role and the missing capability rather than saying "forbidden", so
 * the person reading it knows whether to switch user or to ask for a different
 * one — and deliberately reveals nothing about the record they were reaching
 * for, since the check runs before the record is looked up.
 */
export function refusalMessage(role: MemberRole, permission: Permission): string {
  const what: Record<Permission, string> = {
    'logs:write': 'change logs',
    'logs:review': 'review logs',
    'logs:delete': 'delete logs',
    'reference:write': 'change farm data',
    'reference:delete': 'remove farm data',
  };

  return `${ROLE_LABELS[role]} accounts cannot ${what[permission]}.`;
}
