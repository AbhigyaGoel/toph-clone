/**
 * Date and time formatting for the log table.
 *
 * Timestamps are stored in UTC and the seed writes the shift times as UTC
 * wall-clock values, so they are formatted in UTC as well: "6:00 AM" in the
 * database reads "6:00 AM" on the dashboard regardless of where the server or
 * the viewer happens to be. A per-organisation timezone would replace this
 * constant once the product has one.
 */
const DISPLAY_TIME_ZONE = 'UTC';
const LOCALE = 'en-US';

const dateFormatter = new Intl.DateTimeFormat(LOCALE, {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  timeZone: DISPLAY_TIME_ZONE,
});

const timeFormatter = new Intl.DateTimeFormat(LOCALE, {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: DISPLAY_TIME_ZONE,
});

/** "April 19, 2026" */
export function formatLogDate(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

/** "6:00 AM - 10:40 AM" */
export function formatTimeRange(startIso: string, endIso: string): string {
  return `${timeFormatter.format(new Date(startIso))} - ${timeFormatter.format(new Date(endIso))}`;
}

/**
 * "0:34" — a playback position.
 *
 * Not `Intl.DateTimeFormat`: this is an elapsed duration, not a clock time, and
 * a recording that runs past an hour should read "1:02:30" rather than wrapping.
 */
export function formatDuration(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds) && totalSeconds > 0 ? Math.floor(totalSeconds) : 0;
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;

  const pad = (value: number) => String(value).padStart(2, '0');

  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}
