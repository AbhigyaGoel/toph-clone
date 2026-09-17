'use client';

import { motion } from 'framer-motion';
import { forwardRef } from 'react';

import type { MapLocation } from '@/lib/types';

/**
 * Size of the map frame in the design, measured from the exported frame.
 *
 * The satellite tile is sized as a percentage of its container, so it rescales
 * as the column grows. The plot and pin have to be expressed the same way or
 * they slide off the field they are marking — Figma's absolute offsets only
 * describe where they sit at this one width.
 */
export const DESIGN_FRAME = { width: 594, height: 335 };

/** Figma `Ellipse 12` — the pin is a 17px marker, not a region. */
const PIN_SIZE = 17;

const pct = (value: number, basis: number) => `${(value / basis) * 100}%`;

interface MapSurfaceProps {
  readonly location: MapLocation;
  readonly className?: string;
}

/**
 * The satellite tile with the worked plot highlighted.
 *
 * Extracted so the inline map and the expanded dialog render the same markup
 * from the same data — the dialog is the same surface at a different size, not
 * a second implementation that has to be kept in step.
 */
export const MapSurface = forwardRef<HTMLDivElement, MapSurfaceProps>(function MapSurface(
  { location, className = '' },
  ref
) {
  return (
    <div
      ref={ref}
      className={`field-map-image relative overflow-hidden rounded-[14px] shadow-map-frame ${className}`}
    >
      {/*
        Rectangle 33 — the highlighted plot boundary, scaling with the tile.
        Squared off to 4px to match the traced parcels: Figma's 14px radius was
        drawn for a rectangle that sat on nothing in particular.
      */}
      <span
        className="absolute rounded-[4px] bg-[rgba(0,101,240,0.2)] shadow-map-plot"
        style={{
          left: pct(location.plot.x, DESIGN_FRAME.width),
          top: pct(location.plot.y, DESIGN_FRAME.height),
          width: pct(location.plot.width, DESIGN_FRAME.width),
          height: pct(location.plot.height, DESIGN_FRAME.height),
        }}
      />
      {/*
        Ellipse 12 — the worker's position. Anchored by its centre so the dot
        stays put as the frame resizes, and left at a fixed 17px: it is a
        marker, not a region, so it should not grow with the map.

        Absent on a log with no recording: the plot is the field, which is
        always known, but the pin is where the worker actually stood, which only
        a recording can say. Drawing one anyway would invent a fact.
      */}
      {location.pin ? (
        <motion.span
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-[linear-gradient(180deg,#0065F0_0%,#00D4F0_100%)] shadow-marker"
          animate={{ scale: [1, 1.18, 1] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            left: pct(location.pin.x + PIN_SIZE / 2, DESIGN_FRAME.width),
            top: pct(location.pin.y + PIN_SIZE / 2, DESIGN_FRAME.height),
            width: `${PIN_SIZE}px`,
            height: `${PIN_SIZE}px`,
          }}
        />
      ) : null}
    </div>
  );
});
