'use client';

import { AnimatePresence, motion } from 'framer-motion';

import { DESIGN_FRAME } from '@/components/dashboard/MapSurface';
import { WorkerMarker } from '@/components/map/WorkerMarker';
import { Icon } from '@/components/ui/Icon';
import { EASE_QUICK, SPRING_SOFT } from '@/lib/motion';
import {
  clockLabel,
  durationLabel,
  restrictionPhaseAt,
  seedFrom,
  shiftProgress,
  workerPosition,
  type ReplayDay,
  type ReplayRestriction,
} from '@/lib/replay';

interface ReplayMapProps {
  readonly day: ReplayDay;
  /** Where the scrubber is, in minutes from midnight. */
  readonly minute: number;
  readonly onSelectLog: (logId: string) => void;
  readonly selectedFieldId: string | null;
  readonly onSelectField: (fieldId: string | null) => void;
  /** Logs the manager should look at, so their dot can say so. */
  readonly incursionLogIds: readonly string[];
}

const pct = (value: number, basis: number) => `${(value / basis) * 100}%`;

/** How a field reads at the scrubbed minute. */
const PHASE_LOOK = {
  closed: { fill: 'rgba(176,0,32,0.32)', stroke: 'rgba(176,0,32,0.95)' },
  clear: { fill: 'rgba(20,108,68,0.22)', stroke: 'rgba(20,108,68,0.85)' },
  worked: { fill: 'rgba(0,101,240,0.18)', stroke: 'rgba(0,101,240,0.7)' },
  idle: { fill: 'rgba(120,120,120,0.16)', stroke: 'rgba(255,255,255,0.35)' },
} as const;

/**
 * The farm at one minute of one day.
 *
 * Same tile and same coordinate space as the other two maps — plots are stored
 * in the design's 594x335 frame and emitted as percentages — so a block is in
 * the same place here as on the dashboard, and the traced parcels do the work of
 * making "Field K" a place rather than a label.
 *
 * Three states are drawn and the third is the point. Blue is somebody working.
 * Red is a block closed by a re-entry interval. Grey is a field nobody touched
 * all day, and grey is the state a table cannot show you: the absence of a row
 * is invisible in a list and obvious on a map.
 */
export function ReplayMap({
  day,
  minute,
  onSelectLog,
  selectedFieldId,
  onSelectField,
  incursionLogIds,
}: ReplayMapProps) {
  const active = day.presences.filter(
    (one) => minute >= one.startMinute && minute <= one.endMinute
  );

  // One restriction per field — the one governing at this minute.
  const byField = new Map<string, ReplayRestriction>();
  for (const restriction of day.restrictions) {
    const phase = restrictionPhaseAt(restriction, minute);
    if (phase === 'pending') continue;
    const held = byField.get(restriction.fieldId);
    if (!held || restriction.clearsMinute > held.clearsMinute) {
      byField.set(restriction.fieldId, restriction);
    }
  }

  // Field labels are drawn once per block, not once per log on it.
  const labelled = new Set<string>();

  return (
    <div className="field-map-image relative w-full overflow-hidden rounded-[14px] shadow-map-frame">
      <div style={{ paddingTop: `${(DESIGN_FRAME.height / DESIGN_FRAME.width) * 100}%` }} />

      {/* Fields nobody worked. Drawn first, so anything live sits above them. */}
      {day.idleFields.map((field) => (
        <span
          key={field.id}
          title={`${field.name} — no activity recorded on this day`}
          className="absolute rounded-[4px] border-2 border-dashed"
          style={{
            left: pct(field.plot.x, DESIGN_FRAME.width),
            top: pct(field.plot.y, DESIGN_FRAME.height),
            width: pct(field.plot.width, DESIGN_FRAME.width),
            height: pct(field.plot.height, DESIGN_FRAME.height),
            backgroundColor: PHASE_LOOK.idle.fill,
            borderColor: PHASE_LOOK.idle.stroke,
          }}
        />
      ))}

      {/* Every field that saw work, tinted by what is true of it right now. */}
      {[...new Map(day.presences.map((one) => [one.fieldId, one])).values()].map((one) => {
        const restriction = byField.get(one.fieldId);
        const phase = restriction ? restrictionPhaseAt(restriction, minute) : null;
        const look =
          phase === 'closed'
            ? PHASE_LOOK.closed
            : phase === 'clear'
              ? PHASE_LOOK.clear
              : PHASE_LOOK.worked;

        return (
          <motion.button
            key={one.fieldId}
            type="button"
            onClick={() => onSelectField(selectedFieldId === one.fieldId ? null : one.fieldId)}
            aria-label={`${one.fieldName}${phase === 'closed' ? ', under re-entry restriction' : ''}`}
            animate={{ backgroundColor: look.fill, borderColor: look.stroke }}
            transition={SPRING_SOFT}
            className="absolute rounded-[4px] border-2 outline-none focus-visible:ring-2 focus-visible:ring-white"
            style={{
              left: pct(one.plot.x, DESIGN_FRAME.width),
              top: pct(one.plot.y, DESIGN_FRAME.height),
              width: pct(one.plot.width, DESIGN_FRAME.width),
              height: pct(one.plot.height, DESIGN_FRAME.height),
            }}
          >
            <AnimatePresence>
              {phase === 'closed' && restriction ? (
                <motion.span
                  initial={{ opacity: 0, y: -3 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={EASE_QUICK}
                  className="pointer-events-none absolute left-[3px] top-[3px] whitespace-nowrap rounded-[5px] bg-[#B00020] px-[5px] py-[2px] text-[9px] font-medium leading-[1.2] text-white"
                >
                  {restriction.productName.split(' ')[0]} · REI{' '}
                  {durationLabel(restriction.clearsMinute - minute)} left
                </motion.span>
              ) : null}
            </AnimatePresence>
          </motion.button>
        );
      })}

      {/* Field name, on every block, so the map is readable while it moves. */}
      {[...day.idleFields, ...day.presences].map((entry) => {
        const id = 'logId' in entry ? entry.fieldId : entry.id;
        const name = 'logId' in entry ? entry.fieldName : entry.name;
        const plot = entry.plot;
        if (labelled.has(id)) return null;
        labelled.add(id);

        return (
          <span
            key={`label:${id}`}
            className="pointer-events-none absolute flex items-end justify-center text-[9px] font-medium leading-[1.2] text-white/90"
            style={{
              left: pct(plot.x, DESIGN_FRAME.width),
              top: pct(plot.y, DESIGN_FRAME.height),
              width: pct(plot.width, DESIGN_FRAME.width),
              height: pct(plot.height, DESIGN_FRAME.height),
              textShadow: '0 1px 2px rgba(0,0,0,0.7)',
            }}
          >
            <span className="pb-[3px]">{name}</span>
          </span>
        );
      })}

      {/*
        The people. Same marker the live map draws — see `WorkerMarker` for the
        Find My vocabulary it borrows. Shared rather than reimplemented so a
        worker cannot come to look like two different things on two maps of the
        same farm.

        Position comes from `workerPosition`, so a dot traverses its block over
        the shift instead of standing in the middle of it for four hours.
      */}
      <AnimatePresence>
        {active.map((one) => {
          const flagged = incursionLogIds.includes(one.logId);
          const at = workerPosition(one.plot, shiftProgress(one, minute), seedFrom(one.logId));

          return (
            <WorkerMarker
              key={one.logId}
              shortName={one.shortName}
              left={pct(at.x, DESIGN_FRAME.width)}
              top={pct(at.y, DESIGN_FRAME.height)}
              state={flagged ? 'flagged' : 'working'}
              title={`${one.employeeName} — ${one.activityName.toLowerCase()} on ${one.fieldName}, ${clockLabel(one.startMinute)}–${clockLabel(one.endMinute)}`}
              ariaLabel={`${one.employeeName}, ${one.activityName} on ${one.fieldName}`}
              onSelect={() => onSelectLog(one.logId)}
              animatePosition
            />
          );
        })}
      </AnimatePresence>

      {/* What a clicked field has on it, as a card rather than a tooltip. */}
      <AnimatePresence>
        {selectedFieldId && byField.has(selectedFieldId) ? (
          <FieldCard
            restriction={byField.get(selectedFieldId) as ReplayRestriction}
            minute={minute}
            onClose={() => onSelectField(null)}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

interface FieldCardProps {
  readonly restriction: ReplayRestriction;
  readonly minute: number;
  readonly onClose: () => void;
}

function FieldCard({ restriction, minute, onClose }: FieldCardProps) {
  const phase = restrictionPhaseAt(restriction, minute);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      transition={EASE_QUICK}
      className="absolute bottom-[10px] left-[10px] z-20 flex w-[260px] flex-col gap-[7px] rounded-[12px] bg-white/95 p-[12px] shadow-panel backdrop-blur"
    >
      <div className="flex items-start justify-between gap-[8px]">
        <span className="text-[13px] font-medium leading-[1.3] text-black">
          {restriction.fieldName}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close field details"
          className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[#B3B3B3] outline-none hover:bg-black/[0.06] focus-visible:ring-2 focus-visible:ring-black/30"
        >
          <Icon name="x" size={10} />
        </button>
      </div>

      <Line label="Applied" value={restriction.productName} />
      <Line label="By" value={restriction.appliedBy} />
      <Line label="Finished" value={clockLabel(restriction.appliedMinute)} />
      <Line label="Interval" value={`${restriction.reiHours}h re-entry`} />
      <Line
        label={phase === 'closed' ? 'Clears at' : 'Cleared at'}
        value={clockLabel(restriction.clearsMinute)}
      />

      <span
        className="mt-[2px] rounded-[80px] px-[9px] py-[3px] text-center text-[11px] font-medium leading-[1.3]"
        style={{
          backgroundColor: phase === 'closed' ? 'rgba(176,0,32,0.1)' : 'rgba(20,108,68,0.1)',
          color: phase === 'closed' ? '#B00020' : '#146C44',
        }}
      >
        {phase === 'closed'
          ? `Closed — ${durationLabel(restriction.clearsMinute - minute)} remaining`
          : 'Clear to enter'}
      </span>
    </motion.div>
  );
}

function Line({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <span className="flex items-baseline justify-between gap-[10px]">
      <span className="text-[11px] font-normal leading-[1.3] text-[#B3B3B3]">{label}</span>
      <span className="truncate text-[12px] font-normal leading-[1.3] text-black">{value}</span>
    </span>
  );
}
