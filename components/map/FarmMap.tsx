'use client';

import { motion } from 'framer-motion';

import { DESIGN_FRAME } from '@/components/dashboard/MapSurface';
import { WorkerMarker } from '@/components/map/WorkerMarker';
import { EASE_QUICK, SPRING_SOFT } from '@/lib/motion';
import { seedFrom, workerPosition } from '@/lib/replay';
import type { FieldWorker } from '@/lib/repositories/fields';
import type { FieldOverview } from '@/lib/types';

/** How a field is drawn, in priority order: restricted beats recent beats idle. */
export type FieldState = 'restricted' | 'recent' | 'idle';

interface FarmMapProps {
  readonly fields: readonly FieldOverview[];
  readonly states: Readonly<Record<string, FieldState>>;
  readonly selectedId: string | null;
  readonly onSelect: (fieldId: string) => void;
  /** Who is out right now, and where everyone else last was. */
  readonly workers: readonly FieldWorker[];
  /** Opens that person's log. */
  readonly onSelectWorker: (logId: string) => void;
}

const pct = (value: number, basis: number) => `${(value / basis) * 100}%`;

/**
 * Vertical step between two markers on the same block, in design units.
 *
 * Sized against the marker itself (an 18px avatar over a caption) rather than
 * picked for looks — below about this, two avatars overlap and one name becomes
 * unreadable. Not larger, because a third marker would then be pushed off the
 * block it belongs to, which trades a legibility problem for a truthfulness one.
 */
const STACK_STEP = 26;

/**
 * Keeps a whole marker inside the tile.
 *
 * The tile clips its overflow, so a worker on a block at the very bottom of the
 * frame lost their name capsule to the edge — and the stack offset made it
 * worse by pushing the second marker further down. The marker is centred on its
 * point and stands about this tall in design units, so the point itself has to
 * stay that far off either edge.
 */
const MARKER_HALF = 26;

const insideFrame = (y: number): number =>
  Math.min(DESIGN_FRAME.height - MARKER_HALF, Math.max(MARKER_HALF, y));

/**
 * Colours, chosen so the map answers one question at a glance.
 *
 * The design's own plot highlight is the blue at 20%, so that stays the "worked
 * recently" colour and the screen still looks like the product. Restricted
 * borrows the danger red already used for destructive actions and incomplete
 * records, because "do not walk into this field" is the same class of statement.
 * Idle is a grey wash, and grey specifically: it was white, which is also the
 * colour the selected block's border uses, so a field nobody had worked in
 * thirty days read as one that was currently selected. Two states cannot share
 * a colour on a map whose whole job is telling states apart.
 */
export const STATE_FILL: Record<FieldState, string> = {
  restricted: 'rgba(176,0,32,0.28)',
  recent: 'rgba(0,101,240,0.2)',
  idle: 'rgba(110,110,110,0.30)',
};

export const STATE_STROKE: Record<FieldState, string> = {
  restricted: 'rgba(176,0,32,0.9)',
  recent: 'rgba(0,101,240,0.75)',
  idle: 'rgba(235,235,235,0.5)',
};

/**
 * The whole farm on the satellite tile.
 *
 * The same image and the same coordinate space as the dashboard's single-field
 * map — plots are stored in the design's 594 x 335 pixel frame and emitted as
 * percentages, so both surfaces scale without the plots sliding off the fields
 * they mark. Reusing `DESIGN_FRAME` rather than redeclaring it is what keeps
 * that true when one of them changes.
 *
 * Each plot is a real button: the map is a navigation surface, so it has to work
 * from the keyboard and announce what it is. A div with an onClick would make
 * the farm unreachable without a mouse.
 */
export function FarmMap({
  fields,
  states,
  selectedId,
  onSelect,
  workers,
  onSelectWorker,
}: FarmMapProps) {
  const now = Date.now();

  /*
   * How many markers already sit on each block.
   *
   * Everyone who has finished is drawn where their traversal ended, which for
   * two people on the same block is very nearly the same point — true to the
   * data and unreadable on screen. Each subsequent marker steps down a little,
   * the way overlapping pins fan out rather than hiding each other.
   */
  const stacked = new Map<string, number>();

  return (
    <div className="field-map-image relative w-full overflow-hidden rounded-[14px] shadow-map-frame">
      {/* Keeps the tile at the design's aspect ratio however wide the column is. */}
      <div style={{ paddingTop: `${(DESIGN_FRAME.height / DESIGN_FRAME.width) * 100}%` }} />

      {fields.map((field) => {
        const state = states[field.id] ?? 'idle';
        const selected = field.id === selectedId;

        return (
          <motion.button
            key={field.id}
            type="button"
            onClick={() => onSelect(field.id)}
            aria-pressed={selected}
            aria-label={`${field.name}, ${field.logCount} logs`}
            initial={false}
            animate={{
              backgroundColor: STATE_FILL[state],
              borderColor: selected ? '#FFFFFF' : STATE_STROKE[state],
              scale: selected ? 1.03 : 1,
            }}
            whileHover={{ scale: 1.03 }}
            transition={SPRING_SOFT}
            // A 4px radius, not 10, and no blur. The plots are traced onto real
            // parcels now — squared blocks divided by the section roads — and a
            // soft-cornered, frosted rectangle floating over one reads as a card
            // laid on top of the map rather than as the field itself.
            className="absolute flex items-center justify-center rounded-[4px] border-2 outline-none focus-visible:ring-2 focus-visible:ring-white"
            style={{
              left: pct(field.plot.x, DESIGN_FRAME.width),
              top: pct(field.plot.y, DESIGN_FRAME.height),
              width: pct(field.plot.width, DESIGN_FRAME.width),
              height: pct(field.plot.height, DESIGN_FRAME.height),
            }}
          >
            <motion.span
              initial={false}
              animate={{ opacity: selected ? 1 : 0.85 }}
              transition={EASE_QUICK}
              className="pointer-events-none select-none whitespace-nowrap rounded-[6px] bg-black/55 px-[6px] py-[2px] text-[10px] font-medium leading-[1.2] tracking-[0.02em] text-white"
            >
              {field.name}
            </motion.span>
          </motion.button>
        );
      })}

      {/*
        The crew, on the map of the farm they are on.

        A map of blocks with nobody on it answers "what is my ground" and not
        "where is everybody", and the second question is the one somebody
        standing in a yard at 7am is actually asking. Somebody mid-shift is
        placed along the same traversal the replay walks; somebody finished is
        placed where they were when they finished, dimmed and timestamped —
        which is the honest version of a position nobody is updating.
      */}
      {workers.map((worker) => {
        const span = new Date(worker.endedAt).getTime() - new Date(worker.startedAt).getTime();
        const progress =
          worker.working && span > 0
            ? (now - new Date(worker.startedAt).getTime()) / span
            : 1;
        const at = workerPosition(worker.plot, progress, seedFrom(worker.logId));
        const depth = stacked.get(worker.fieldId) ?? 0;
        stacked.set(worker.fieldId, depth + 1);

        return (
          <WorkerMarker
            key={worker.logId}
            shortName={worker.shortName}
            left={pct(at.x, DESIGN_FRAME.width)}
            top={pct(insideFrame(at.y + depth * STACK_STEP), DESIGN_FRAME.height)}
            state={worker.working ? 'working' : 'last-seen'}
            caption={
              worker.working ? worker.activityName.toLowerCase() : `last seen ${clock(worker.endedAt)}`
            }
            title={`${worker.employeeName} — ${worker.activityName.toLowerCase()} on ${worker.fieldName}`}
            ariaLabel={`${worker.employeeName}, ${
              worker.working ? 'working on' : 'last seen on'
            } ${worker.fieldName}`}
            onSelect={() => onSelectWorker(worker.logId)}
          />
        );
      })}
    </div>
  );
}

/** "6:00 PM" — a farm runs on clock time. */
function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  });
}

interface MapLegendProps {
  readonly counts: Record<FieldState, number>;
  /** Crew markers, so the dots on the tile are explained alongside the blocks. */
  readonly crew?: { readonly working: number; readonly lastSeen: number };
}

/** What the three colours mean, with how many fields are in each state. */
export function MapLegend({ counts, crew }: MapLegendProps) {
  const entries: ReadonlyArray<{ state: FieldState; label: string }> = [
    { state: 'restricted', label: 'Under re-entry restriction' },
    { state: 'recent', label: 'Worked in the last 30 days' },
    { state: 'idle', label: 'No recent activity' },
  ];

  return (
    <div className="flex flex-wrap items-center gap-[18px] px-[30px] py-[14px]">
      {crew && crew.working + crew.lastSeen > 0 ? (
        <>
          {crew.working > 0 ? (
            <CrewKey colour="#0065F0" label="Out now" count={crew.working} />
          ) : null}
          {crew.lastSeen > 0 ? (
            <CrewKey colour="#6B6B6B" label="Last seen today" count={crew.lastSeen} />
          ) : null}
          <span aria-hidden className="h-[14px] w-px bg-black/10" />
        </>
      ) : null}

      {entries.map(({ state, label }) => (
        <span key={state} className="flex items-center gap-[8px]">
          <span
            className="h-[12px] w-[12px] rounded-[4px] border-2"
            style={{ backgroundColor: STATE_FILL[state], borderColor: STATE_STROKE[state] }}
          />
          <span className="text-[13px] font-normal leading-[1.3] text-[#4D4D4D]">
            {label}
            <span className="pl-[6px] tabular-nums text-black">{counts[state]}</span>
          </span>
        </span>
      ))}
    </div>
  );
}

/** A round key for the crew markers, matching their shape on the tile. */
function CrewKey({
  colour,
  label,
  count,
}: {
  readonly colour: string;
  readonly label: string;
  readonly count: number;
}) {
  return (
    <span className="flex items-center gap-[8px]">
      <span
        className="h-[12px] w-[12px] shrink-0 rounded-full border-2 border-white"
        style={{ backgroundColor: colour, boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }}
      />
      <span className="text-[13px] font-normal leading-[1.3] text-[#4D4D4D]">
        {label}
        <span className="pl-[6px] tabular-nums text-black">{count}</span>
      </span>
    </span>
  );
}
