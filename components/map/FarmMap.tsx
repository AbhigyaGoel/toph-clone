'use client';

import { motion } from 'framer-motion';

import { DESIGN_FRAME } from '@/components/dashboard/MapSurface';
import { EASE_QUICK, SPRING_SOFT } from '@/lib/motion';
import type { FieldOverview } from '@/lib/types';

/** How a field is drawn, in priority order: restricted beats recent beats idle. */
export type FieldState = 'restricted' | 'recent' | 'idle';

interface FarmMapProps {
  readonly fields: readonly FieldOverview[];
  readonly states: Readonly<Record<string, FieldState>>;
  readonly selectedId: string | null;
  readonly onSelect: (fieldId: string) => void;
}

const pct = (value: number, basis: number) => `${(value / basis) * 100}%`;

/**
 * Colours, chosen so the map answers one question at a glance.
 *
 * The design's own plot highlight is the blue at 20%, so that stays the "worked
 * recently" colour and the screen still looks like the product. Restricted
 * borrows the danger red already used for destructive actions and incomplete
 * records, because "do not walk into this field" is the same class of statement.
 * Idle is a neutral wash rather than nothing at all — an unworked block still
 * has to be findable.
 */
export const STATE_FILL: Record<FieldState, string> = {
  restricted: 'rgba(176,0,32,0.28)',
  recent: 'rgba(0,101,240,0.2)',
  idle: 'rgba(255,255,255,0.18)',
};

export const STATE_STROKE: Record<FieldState, string> = {
  restricted: 'rgba(176,0,32,0.9)',
  recent: 'rgba(0,101,240,0.75)',
  idle: 'rgba(255,255,255,0.55)',
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
export function FarmMap({ fields, states, selectedId, onSelect }: FarmMapProps) {
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
    </div>
  );
}

interface MapLegendProps {
  readonly counts: Record<FieldState, number>;
}

/** What the three colours mean, with how many fields are in each state. */
export function MapLegend({ counts }: MapLegendProps) {
  const entries: ReadonlyArray<{ state: FieldState; label: string }> = [
    { state: 'restricted', label: 'Under re-entry restriction' },
    { state: 'recent', label: 'Worked in the last 30 days' },
    { state: 'idle', label: 'No recent activity' },
  ];

  return (
    <div className="flex flex-wrap items-center gap-[18px] px-[30px] py-[14px]">
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
