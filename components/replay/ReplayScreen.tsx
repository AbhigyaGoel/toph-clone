'use client';

import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { LogBrief } from '@/components/logs/LogBrief';
import { ReplayMap } from '@/components/replay/ReplayMap';
import { Timeline, type Speed } from '@/components/replay/Timeline';
import { Screen } from '@/components/shell/Screen';
import { EmptyState } from '@/components/shell/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { PageEntrance } from '@/components/ui/PageEntrance';
import { clockLabel, durationLabel, presencesAt, type ReplayDay } from '@/lib/replay';
import { EASE_QUICK } from '@/lib/motion';
import type { LogDetail, Product, ReferenceData } from '@/lib/types';

interface ReplayScreenProps {
  readonly day: ReplayDay;
  readonly days: readonly string[];
  readonly details: readonly LogDetail[];
  readonly products: readonly Product[];
  readonly reference: ReferenceData;
  readonly canWrite: boolean;
  readonly canRetract: boolean;
}

/**
 * The day, replayed.
 *
 * Every other screen in this product is a list of what was recorded. This is the
 * only one that knows *when* and *where* at the same time, and that combination
 * is what makes it worth building: a re-entry violation is not visible in any
 * single row. It is two rows — a spray at ten, somebody else on the same block at
 * one — plus a number on a product label. A table can hold all three facts and
 * still not tell you, because seeing it means joining them in your head.
 *
 * So the screen says it up front rather than making the manager find it by
 * watching: the day's incursions are counted in the header and marked on the
 * timeline. Play is for the demo; the scrubber and the marks are for the job.
 *
 * The data is the farm's own. Nothing here is simulated — the dots are logs, the
 * red blocks are `applications` joined to `products.rei_hours`, and the grey
 * blocks are fields with no rows at all on this date.
 */
export function ReplayScreen({
  day,
  days,
  details,
  products,
  reference,
  canWrite,
  canRetract,
}: ReplayScreenProps) {
  // Opens when the first person clocks on, not at the start of the scrub range.
  // The range carries half an hour of air either side so a dot never sits on an
  // end cap, and starting in that margin means the screen's first impression is
  // an empty farm.
  const [minute, setMinute] = useState(
    day.presences.length > 0
      ? Math.min(...day.presences.map((one) => one.startMinute))
      : day.startMinute
  );
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(2);
  const [openLogId, setOpenLogId] = useState<string | null>(null);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);

  const detailFor = useMemo(
    () => new Map(details.map((detail) => [detail.logId, detail])),
    [details]
  );
  const presenceFor = useMemo(
    () => new Map(day.presences.map((one) => [one.logId, one])),
    [day.presences]
  );

  const onNow = presencesAt(day.presences, minute);
  const incursionLogIds = day.incursions.map((one) => one.presence.logId);

  const marks = day.incursions.map((one) => ({
    // A beat after they arrive, so the jump lands with the dot already on the
    // block rather than on the frame it appears.
    minute: Math.min(one.presence.endMinute, one.presence.startMinute + 2),
    label: `${one.presence.shortName} entered ${one.restriction.fieldName}`,
  }));

  const openPresence = openLogId ? presenceFor.get(openLogId) : null;
  const openDetail = openLogId ? detailFor.get(openLogId) : null;

  if (day.presences.length === 0) {
    return (
      <Screen title="Farm Day Replay" subtitle="Nothing was recorded on this day.">
        <PageEntrance index={1}>
          <div className="w-full self-stretch rounded-[20px] bg-white shadow-panel">
            <EmptyState
              icon="map"
              title="No activity on this date"
              body="Pick a day the crew logged work and the replay will show where everyone was, and which blocks were closed while they were there."
            />
          </div>
        </PageEntrance>
      </Screen>
    );
  }

  return (
    <Screen
      title="Farm Day Replay"
      subtitle={`${friendlyDate(day.date)} — where the crew was, and what was closed while they were there.`}
      actions={
        <div className="flex items-center gap-[8px]">
          <label className="flex items-center gap-[8px] rounded-[80px] bg-white px-[14px] py-[7px] shadow-chip">
            <Icon name="calendar" size={13} className="text-[#B3B3B3]" />
            <select
              value={day.date}
              onChange={(event) => {
                window.location.href = `/replay?date=${event.target.value}`;
              }}
              aria-label="Day to replay"
              className="bg-transparent text-[14px] font-normal leading-[1.3] text-black outline-none"
            >
              {days.map((option) => (
                <option key={option} value={option}>
                  {friendlyDate(option)}
                </option>
              ))}
            </select>
          </label>
          <Link
            href="/map"
            className="flex shrink-0 items-center gap-[6px] whitespace-nowrap rounded-[80px] bg-white px-[14px] py-[8px] text-[14px] font-normal leading-[1.3] text-[#4D4D4D] shadow-chip outline-none focus-visible:ring-2 focus-visible:ring-black/30"
          >
            <Icon name="map" size={12} />
            Live map
          </Link>
        </div>
      }
    >
      {/*
        The finding, before the visualisation. A screen that requires you to
        watch it to learn what it found is a screensaver.
      */}
      <PageEntrance index={1}>
        <IncursionBanner day={day} onJump={(at) => { setPlaying(false); setMinute(at); }} />
      </PageEntrance>

      <PageEntrance index={2}>
        <div className="flex w-full flex-col gap-[10px] self-stretch xl:flex-row">
          <div className="flex min-w-0 flex-1 flex-col gap-[10px]">
            <ReplayMap
              day={day}
              minute={minute}
              onSelectLog={(logId) => setOpenLogId(logId === openLogId ? null : logId)}
              selectedFieldId={selectedFieldId}
              onSelectField={setSelectedFieldId}
              incursionLogIds={incursionLogIds}
            />

            <Timeline
              day={day}
              minute={minute}
              onMinute={setMinute}
              playing={playing}
              onPlaying={setPlaying}
              speed={speed}
              onSpeed={setSpeed}
              marks={marks}
            />
          </div>

          {/* Who is out, right now, at the scrubbed minute. */}
          <aside className="flex w-full shrink-0 flex-col gap-[10px] rounded-[20px] bg-white p-[16px] shadow-panel xl:w-[300px]">
            <div className="flex items-baseline justify-between gap-[8px]">
              <span className="text-[10px] font-medium uppercase tracking-[0.04em] text-[#B3B3B3]">
                On the farm
              </span>
              <span className="text-[12px] font-normal leading-[1.3] tabular-nums text-[#4D4D4D]">
                {clockLabel(minute)}
              </span>
            </div>

            {onNow.length === 0 ? (
              <span className="py-[8px] text-[13px] font-normal leading-[1.4] text-[#B3B3B3]">
                Nobody was logged on the farm at this time.
              </span>
            ) : (
              <ul className="flex flex-col gap-[2px]">
                <AnimatePresence initial={false}>
                  {onNow.map((one) => (
                    <motion.li
                      key={one.logId}
                      layout
                      initial={{ opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      transition={EASE_QUICK}
                    >
                      <button
                        type="button"
                        onClick={() => setOpenLogId(one.logId === openLogId ? null : one.logId)}
                        className="flex w-full flex-col rounded-[8px] px-[8px] py-[7px] text-left outline-none transition-colors hover:bg-black/[0.03] focus-visible:ring-2 focus-visible:ring-black/30"
                      >
                        <span className="flex items-center gap-[6px]">
                          {incursionLogIds.includes(one.logId) ? (
                            <span className="h-[6px] w-[6px] shrink-0 rounded-full bg-[#B00020]" />
                          ) : null}
                          <span className="truncate text-[13px] font-medium leading-[1.3] text-black">
                            {one.employeeName}
                          </span>
                        </span>
                        <span className="truncate text-[12px] font-normal leading-[1.4] text-[#4D4D4D]">
                          {one.activityName} · {one.fieldName}
                        </span>
                      </button>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}

            <div className="mt-[4px] flex flex-col gap-[6px] border-t border-black/[0.06] pt-[10px]">
              <Legend colour="rgba(0,101,240,0.45)" label="Worked today" />
              <Legend colour="rgba(176,0,32,0.6)" label="Closed — re-entry interval" />
              <Legend colour="rgba(20,108,68,0.45)" label="Cleared after a spray" />
              <Legend colour="rgba(120,120,120,0.35)" label={`No activity (${day.idleFields.length})`} />
            </div>
          </aside>
        </div>
      </PageEntrance>

      {/* A log opens here, on this screen, rather than sending you to a table. */}
      <AnimatePresence initial={false}>
        {openPresence ? (
          <motion.div
            key={openPresence.logId}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={EASE_QUICK}
            className="w-full self-stretch overflow-hidden rounded-[20px] bg-white shadow-panel"
          >
            <div className="flex items-center justify-between gap-[10px] px-[16px] py-[14px] shadow-divider sm:px-[30px]">
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[15px] font-normal leading-[1.3] text-black">
                  {openPresence.employeeName} — {openPresence.activityName.toLowerCase()} on{' '}
                  {openPresence.fieldName}
                </span>
                <span className="text-[12px] font-normal leading-[1.4] text-[#4D4D4D]">
                  {clockLabel(openPresence.startMinute)} – {clockLabel(openPresence.endMinute)}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setOpenLogId(null)}
                className="flex shrink-0 items-center gap-[5px] rounded-[80px] px-[10px] py-[6px] text-[13px] font-normal leading-[1.3] text-[#4D4D4D] outline-none transition-colors hover:bg-black/[0.05] focus-visible:ring-2 focus-visible:ring-black/30"
              >
                <Icon name="x" size={11} />
                Close
              </button>
            </div>

            {openDetail ? (
              <LogBrief
                detail={openDetail}
                employeeLabel={openPresence.employeeName}
                fieldLabel={openPresence.fieldName}
                products={products}
                reference={reference}
                recordContext={`${openPresence.activityName} on ${openPresence.fieldName}, ${friendlyDate(day.date)}, logged by ${openPresence.employeeName}.`}
                canWrite={canWrite}
                canRetract={canRetract}
              />
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </Screen>
  );
}

interface IncursionBannerProps {
  readonly day: ReplayDay;
  readonly onJump: (minute: number) => void;
}

function IncursionBanner({ day, onJump }: IncursionBannerProps) {
  const clean = day.incursions.length === 0;

  return (
    <div className="flex w-full flex-col items-start gap-[10px] self-stretch rounded-[20px] bg-white px-[16px] py-[14px] shadow-panel sm:flex-row sm:items-center sm:gap-[14px] sm:px-[30px]">
      <span
        className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full"
        style={{
          backgroundColor: clean ? 'rgba(20,108,68,0.1)' : 'rgba(176,0,32,0.08)',
          color: clean ? '#146C44' : '#B00020',
        }}
      >
        <Icon name={clean ? 'check' : 'x'} size={13} />
      </span>

      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[15px] font-normal leading-[1.3] text-black">
          {clean
            ? 'Nobody entered a closed block on this day'
            : `${day.incursions.length} ${day.incursions.length === 1 ? 'person entered' : 'people entered'} a block during its re-entry interval`}
        </span>
        <span className="text-[12px] font-normal leading-[1.4] text-[#4D4D4D]">
          {clean
            ? `${day.presences.length} logs, ${day.restrictions.length} ${day.restrictions.length === 1 ? 'application' : 'applications'}, ${day.idleFields.length} fields with no activity.`
            : day.incursions
                .map(
                  (one) =>
                    `${one.presence.employeeName} was on ${one.restriction.fieldName} at ${clockLabel(one.presence.startMinute)}, ${durationLabel(one.overlapMinutes)} inside the ${one.restriction.reiHours}h interval after ${one.restriction.productName}`
                )
                .join('. ')}
        </span>
      </span>

      {clean ? null : (
        <button
          type="button"
          onClick={() =>
            onJump(Math.min(day.incursions[0].presence.endMinute, day.incursions[0].presence.startMinute + 2))
          }
          className="flex shrink-0 items-center gap-[6px] whitespace-nowrap rounded-[80px] bg-black px-[14px] py-[8px] text-[14px] font-normal leading-[1.3] text-white outline-none focus-visible:ring-2 focus-visible:ring-black/30"
        >
          Jump to it
          <Icon name="expand" size={11} />
        </button>
      )}
    </div>
  );
}

function Legend({ colour, label }: { readonly colour: string; readonly label: string }) {
  return (
    <span className="flex items-center gap-[8px]">
      <span className="h-[10px] w-[10px] shrink-0 rounded-[3px]" style={{ backgroundColor: colour }} />
      <span className="text-[12px] font-normal leading-[1.3] text-[#4D4D4D]">{label}</span>
    </span>
  );
}

/** "Thursday, September 17" — a date a person would say out loud. */
function friendlyDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}
