import { z } from 'zod';

import { logger } from '@/lib/logger';
import {
  findIncursions,
  minuteOfDay,
  type ReplayDay,
  type ReplayPresence,
  type ReplayRestriction,
} from '@/lib/replay';
import { getSupabase } from '@/lib/supabase/server';
import type { MapPlot } from '@/lib/types';

/** The working window the scrubber falls back to when a day is thin. */
const DEFAULT_WINDOW = { startMinute: 6 * 60, endMinute: 18 * 60 };

/** A little air either side, so a dot never sits exactly on the end cap. */
const MARGIN_MINUTES = 30;

const plotSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

/**
 * One day, assembled for the replay.
 *
 * A single query for the day's logs and a single query for the fields. The
 * restrictions are derived here rather than read from `application_records`
 * because that view answers "is this field closed *now*" — and the replay needs
 * "was it closed at 1pm", which is a different question that the same rows can
 * answer once you keep the applied instant and the interval rather than only
 * the expiry.
 */
export async function findReplayDay(orgId: string, date: string): Promise<ReplayDay> {
  const dayStart = `${date}T00:00:00.000Z`;
  const dayEnd = `${date}T23:59:59.999Z`;

  const supabase = getSupabase();

  const [logsResult, fieldsResult] = await Promise.all([
    supabase
      .from('activity_logs')
      .select(
        'id, started_at, ended_at, employees ( full_name ), fields ( id, name, map_plot ), activity_types ( name ), recordings ( transcription_confidence ), applications ( rate, products ( name, rei_hours ) )'
      )
      .eq('org_id', orgId)
      .gte('started_at', dayStart)
      .lte('started_at', dayEnd)
      .order('started_at', { ascending: true }),
    supabase.from('fields').select('id, name, map_plot').eq('org_id', orgId).order('name'),
  ]);

  if (logsResult.error || fieldsResult.error) {
    logger.error('findReplayDay', logsResult.error?.message ?? fieldsResult.error?.message ?? '');
    return emptyDay(date);
  }

  const presences: ReplayPresence[] = [];
  const restrictions: ReplayRestriction[] = [];

  for (const row of logsResult.data ?? []) {
    const field = row.fields;
    const plot = plotSchema.safeParse(field?.map_plot);
    if (!field || !plot.success) continue;

    const employeeName = row.employees?.full_name ?? 'Someone';
    const startMinute = minuteOfDay(row.started_at);
    const endMinute = Math.max(startMinute, minuteOfDay(row.ended_at));
    const confidence = row.recordings?.transcription_confidence ?? null;

    presences.push({
      logId: row.id,
      employeeName,
      shortName: employeeName.split(' ')[0] ?? employeeName,
      activityName: row.activity_types?.name ?? 'Work',
      fieldId: field.id,
      fieldName: field.name,
      plot: plot.data,
      startMinute,
      endMinute,
      lowConfidence: confidence !== null && confidence < 0.75,
    });

    // A restriction runs from when the work finished, not when it started: the
    // interval on a product label begins at the end of the application.
    for (const application of row.applications ?? []) {
      const reiHours = application.products?.rei_hours ?? null;
      if (reiHours === null || reiHours <= 0) continue;

      restrictions.push({
        fieldId: field.id,
        fieldName: field.name,
        plot: plot.data,
        productName: application.products?.name ?? 'an application',
        appliedBy: employeeName,
        reiHours,
        appliedMinute: endMinute,
        clearsMinute: endMinute + reiHours * 60,
      });
    }
  }

  const worked = new Set(presences.map((presence) => presence.fieldId));
  const idleFields = (fieldsResult.data ?? [])
    .filter((field) => !worked.has(field.id))
    .map((field) => ({ field, plot: plotSchema.safeParse(field.map_plot) }))
    .filter((entry) => entry.plot.success)
    .map((entry) => ({
      id: entry.field.id,
      name: entry.field.name,
      plot: entry.plot.data as MapPlot,
    }));

  return {
    date,
    presences,
    restrictions,
    incursions: findIncursions(presences, restrictions),
    idleFields,
    ...window(presences, restrictions),
  };
}

/**
 * The day with the most going on, so the screen opens on something worth
 * watching rather than on whichever date happens to be today.
 */
export async function findBusiestDay(orgId: string): Promise<string | null> {
  const { data, error } = await getSupabase()
    .from('activity_logs')
    .select('started_at')
    .eq('org_id', orgId)
    .order('started_at', { ascending: false })
    .limit(400);

  if (error) {
    logger.error('findBusiestDay', error.message);
    return null;
  }

  const byDay = new Map<string, number>();
  for (const row of data ?? []) {
    const day = row.started_at.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }

  let best: { day: string; count: number } | null = null;
  for (const [day, count] of byDay) {
    // Ties go to the more recent day, which is how the map is ordered already.
    if (!best || count > best.count) best = { day, count };
  }

  return best?.day ?? null;
}

/** Every day that has at least one log, newest first, for the day picker. */
export async function findReplayDays(orgId: string, limit = 14): Promise<readonly string[]> {
  const { data, error } = await getSupabase()
    .from('activity_logs')
    .select('started_at')
    .eq('org_id', orgId)
    .order('started_at', { ascending: false })
    .limit(400);

  if (error) {
    logger.error('findReplayDays', error.message);
    return [];
  }

  const days = new Set((data ?? []).map((row) => row.started_at.slice(0, 10)));
  return [...days].slice(0, limit);
}

/**
 * The scrub range.
 *
 * Six to six covers an ordinary day, but a day that starts at five or runs a
 * restriction past seven has to fit — a timeline that cuts off the thing you
 * came to look at is worse than one that is a little wider than it needs to be.
 */
function window(
  presences: readonly ReplayPresence[],
  restrictions: readonly ReplayRestriction[]
): { startMinute: number; endMinute: number } {
  if (presences.length === 0) return { ...DEFAULT_WINDOW };

  const earliest = Math.min(...presences.map((one) => one.startMinute));
  // Restrictions count towards the window only if they clear inside the day. A
  // 24-hour interval applied at 3pm clears tomorrow afternoon, and letting that
  // set the end stretched a twelve-hour scrubber to midnight — most of the track
  // spent on hours where nothing happens, and the part worth dragging squeezed
  // into the left third.
  const latest = Math.max(
    ...presences.map((one) => one.endMinute),
    ...restrictions.map((one) => one.clearsMinute).filter((minute) => minute <= 24 * 60)
  );

  return {
    startMinute: Math.max(0, Math.min(DEFAULT_WINDOW.startMinute, earliest - MARGIN_MINUTES)),
    endMinute: Math.min(24 * 60, Math.max(DEFAULT_WINDOW.endMinute, latest + MARGIN_MINUTES)),
  };
}

function emptyDay(date: string): ReplayDay {
  return {
    date,
    presences: [],
    restrictions: [],
    incursions: [],
    idleFields: [],
    ...DEFAULT_WINDOW,
  };
}
