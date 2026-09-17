import type { MapPlot } from '@/lib/types';

/**
 * A day on the farm, as something you can scrub through.
 *
 * The dashboard answers "what was recorded". This answers "what happened, and
 * where, and in what order" — a question the same rows cannot answer when they
 * are sorted into a table, because a table has no notion of two people being in
 * two places at the same moment, or of one of them walking into a block another
 * closed an hour earlier.
 *
 * Everything here is derived from records the farm already has: the log's start
 * and end, the field it was on, and the re-entry interval of whatever was
 * sprayed. Nothing is simulated. The replay is a reading of the data, not a
 * dramatisation of it.
 */

/** One worker on one field for one stretch of the day. */
export interface ReplayPresence {
  readonly logId: string;
  readonly employeeName: string;
  /** What the dot is labelled with — a first name is enough on a map. */
  readonly shortName: string;
  readonly activityName: string;
  readonly fieldId: string;
  readonly fieldName: string;
  readonly plot: MapPlot;
  /** Minutes from midnight UTC, so the timeline is plain arithmetic. */
  readonly startMinute: number;
  readonly endMinute: number;
  /** Set when the recording came through poorly enough to want a listen. */
  readonly lowConfidence: boolean;
}

/** A field closed by something applied to it, and when it reopens. */
export interface ReplayRestriction {
  readonly fieldId: string;
  readonly fieldName: string;
  readonly plot: MapPlot;
  readonly productName: string;
  readonly appliedBy: string;
  readonly reiHours: number;
  /** Minutes from midnight UTC. `clearsMinute` may run past the end of the day. */
  readonly appliedMinute: number;
  readonly clearsMinute: number;
}

/**
 * Somebody on a field while it was closed.
 *
 * The reason this screen exists. A table can show both logs and no reviewer
 * will notice, because noticing means holding two timestamps, two field ids and
 * a product's re-entry interval in your head at once. Here it is a red block
 * with a person standing on it.
 */
export interface ReplayIncursion {
  readonly presence: ReplayPresence;
  readonly restriction: ReplayRestriction;
  /** Minutes they were inside the window — the size of the exposure. */
  readonly overlapMinutes: number;
}

export interface ReplayDay {
  /** The day being replayed, `YYYY-MM-DD`. */
  readonly date: string;
  readonly presences: readonly ReplayPresence[];
  readonly restrictions: readonly ReplayRestriction[];
  readonly incursions: readonly ReplayIncursion[];
  /** Fields nobody touched all day — the gap is the finding. */
  readonly idleFields: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly plot: MapPlot;
  }>;
  /** The scrub range, in minutes from midnight. */
  readonly startMinute: number;
  readonly endMinute: number;
}

/** Minutes from midnight UTC. The whole timeline is integer minutes. */
export function minuteOfDay(iso: string): number {
  const at = new Date(iso);
  return at.getUTCHours() * 60 + at.getUTCMinutes();
}

/** "9:47 AM" — a farm runs on clock time. */
export function clockLabel(minute: number): string {
  const wrapped = ((minute % 1440) + 1440) % 1440;
  const hour24 = Math.floor(wrapped / 60);
  const minutes = Math.floor(wrapped % 60);
  const hour = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour}:${String(minutes).padStart(2, '0')} ${hour24 < 12 ? 'AM' : 'PM'}`;
}

/** "3h 12m", "48m" — how a person says a remaining interval. */
export function durationLabel(minutes: number): string {
  const whole = Math.max(0, Math.round(minutes));
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

/** Whoever is on a field at this minute. */
export function presencesAt(
  presences: readonly ReplayPresence[],
  minute: number
): readonly ReplayPresence[] {
  return presences.filter((one) => minute >= one.startMinute && minute <= one.endMinute);
}

/**
 * A restriction's state at a given minute: not yet applied, closed, or clear.
 *
 * `clear` rather than "gone" because a field that has been sprayed and has since
 * reopened is not the same as a field nobody has touched — the pre-harvest
 * interval is still running on it, and the manager reading this map should see
 * that something happened there today.
 */
export type RestrictionPhase = 'pending' | 'closed' | 'clear';

export function restrictionPhaseAt(
  restriction: ReplayRestriction,
  minute: number
): RestrictionPhase {
  if (minute < restriction.appliedMinute) return 'pending';
  return minute < restriction.clearsMinute ? 'closed' : 'clear';
}

/**
 * Everyone who was on a closed field while it was closed.
 *
 * Computed over the whole day rather than at the scrubbed minute, so the screen
 * can say up front that the day contains one — and the manager can scrub
 * straight to it instead of hunting for it by playing the day through.
 */
export function findIncursions(
  presences: readonly ReplayPresence[],
  restrictions: readonly ReplayRestriction[]
): readonly ReplayIncursion[] {
  const found: ReplayIncursion[] = [];

  for (const restriction of restrictions) {
    for (const presence of presences) {
      if (presence.fieldId !== restriction.fieldId) continue;
      // The log that *caused* the restriction is not an incursion into it.
      if (presence.startMinute < restriction.appliedMinute) continue;

      const overlap =
        Math.min(presence.endMinute, restriction.clearsMinute) -
        Math.max(presence.startMinute, restriction.appliedMinute);

      if (overlap > 0) found.push({ presence, restriction, overlapMinutes: overlap });
    }
  }

  return found.sort((a, b) => a.presence.startMinute - b.presence.startMinute);
}
