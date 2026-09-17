import 'server-only';

import { randomUUID } from 'node:crypto';

/**
 * A short-lived server-side hold for work that can still be taken back.
 *
 * Delete is the one irreversible thing on this dashboard, and it used to arm a
 * second click before firing. Two clicks is a worse trade than one click plus an
 * undo: the confirm taxes every delete, including the nine out of ten that were
 * meant, while undo costs nothing until someone needs it.
 *
 * Making that undo *correct* is what this file is for. The rows are kept here
 * rather than handed to the browser, so the client only ever holds an opaque
 * token. That matters: a snapshot round-tripping through the page would be
 * client-controlled input on the way back, and restoring it would become a way
 * to write arbitrary transcripts and audio URLs into the database. A token
 * cannot be forged into anything — it either names rows this server deleted, or
 * it names nothing.
 *
 * The store is process memory and deliberately small. Undo is a few seconds of
 * grace, not durable state: an entry that outlives its window, or a deploy, is
 * simply gone, and the UI says the delete can no longer be undone.
 */

/** How long an undo stays available. Comfortably longer than the toast. */
const TTL_MS = 60_000;

/** Hard ceiling on retained entries, so a delete loop cannot grow the heap. */
const MAX_ENTRIES = 50;

interface Entry {
  readonly value: unknown;
  readonly expiresAt: number;
  /** Run when the window closes without an undo — never when it is reclaimed. */
  readonly onExpire?: (value: unknown) => void;
}

const entries = new Map<string, Entry>();

function sweep(now: number): void {
  for (const [token, entry] of entries) {
    if (entry.expiresAt > now) continue;
    entries.delete(token);
    // The undo window is what kept this alive; once it closes the delete is
    // final, and anything the rows referenced outside Postgres (stored audio)
    // has to go with them or it leaks forever.
    try {
      entry.onExpire?.(entry.value);
    } catch {
      // A failed cleanup must not stop the sweep from clearing the rest.
    }
  }
}

/** Stores a value and returns the token that reclaims it exactly once. */
export function remember(value: unknown, onExpire?: (value: unknown) => void): string {
  const now = Date.now();
  sweep(now);

  // Map iterates in insertion order, so the first key is the oldest entry.
  while (entries.size >= MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    entries.delete(oldest);
  }

  const token = randomUUID();
  entries.set(token, { value, expiresAt: now + TTL_MS, onExpire });
  return token;
}

/**
 * Reclaims a stored value, or null if it expired or was already taken.
 *
 * Single-use on purpose: an undo that could run twice would try to re-insert
 * rows that already exist and fail halfway through on the primary key.
 */
export function take(token: string): unknown {
  const now = Date.now();
  sweep(now);

  const entry = entries.get(token);
  if (!entry) return null;

  entries.delete(token);
  return entry.value;
}
