'use client';

import { motion } from 'framer-motion';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { EASE_QUICK } from '@/lib/motion';
import type { WaveformBar } from '@/lib/types';
import { WAVEFORM_HEIGHT, WAVEFORM_WIDTH } from '@/lib/waveform';

interface RecordingWaveformProps {
  readonly bars: readonly WaveformBar[];
  /** Playback position as a fraction of the recording, 0 when idle. */
  readonly progress: number;
}

/** Figma stroke colours for the two waveform emphases. */
const BAR_COLOR: Record<WaveformBar['emphasis'], string> = {
  strong: '#003930',
  muted: 'rgba(1, 56, 47, 0.25)',
};

/** The Add Tag button's green, reused so played audio reads as "active". */
const PLAYED_COLOR = '#146C44';

/** Figma renders each tick as a zero-width LINE with this stroke weight. */
const STROKE = 0.88;

interface Raster {
  readonly width: number;
  readonly dpr: number;
}

/**
 * Figma `Group 1` — 98 vertical ticks on a 592 x 80.96 canvas.
 *
 * Amplitude is height. Every tick is the same weight, and that is the whole
 * point of the reading: a thicker line would mean something, and there is
 * nothing for it to mean.
 *
 * Getting that on screen takes arithmetic. Laid out the obvious way — each tick
 * a 0.88px box at a percentage offset — the ticks land on fractional device
 * pixels, and the browser resolves that by spreading each one across two columns
 * of pixels at whatever alpha the coverage works out to. Identical ticks then
 * render at visibly different weights, some crisp and dark, others smeared and
 * pale, which is exactly the "some lines thicker than others" this had. It is
 * worse, not better, on the fractional display scalings Windows defaults to.
 *
 * So positions are snapped to the device pixel grid: measure the container,
 * convert each tick to device pixels, round, convert back. Every tick then
 * covers the same whole number of device pixels and rasterises identically. The
 * nudge is at most half a device pixel against a ~6px gap, so the waveform's
 * shape is unchanged — it is the same drawing, aligned.
 *
 * Progress is applied per tick rather than as a clipped overlay: each tick
 * already knows its position along the recording, so comparing that to the
 * playhead is exact, needs no second copy of the group, and leaves the design's
 * colours untouched at rest — at progress 0 this renders the Figma frame.
 */
export function RecordingWaveform({ bars, progress }: RecordingWaveformProps) {
  const host = useRef<HTMLDivElement>(null);
  const [raster, setRaster] = useState<Raster | null>(null);

  useLayoutEffect(() => {
    const element = host.current;
    if (!element) return undefined;

    const measure = () => {
      const width = element.clientWidth;
      const dpr = window.devicePixelRatio || 1;
      setRaster((current) =>
        current && current.width === width && current.dpr === dpr ? current : { width, dpr }
      );
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // devicePixelRatio changes when the window moves between displays or the page
  // is zoomed, and neither resizes the element.
  useEffect(() => {
    const media = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    const onChange = () =>
      setRaster((current) => (current ? { ...current, dpr: window.devicePixelRatio || 1 } : current));

    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [raster?.dpr]);

  const snap = (value: number): number => (raster ? Math.round(value * raster.dpr) / raster.dpr : value);
  const barWidth = raster ? Math.max(1, Math.round(STROKE * raster.dpr)) / raster.dpr : STROKE;

  return (
    <div ref={host} aria-hidden className="relative w-full" style={{ height: `${WAVEFORM_HEIGHT}px` }}>
      {bars.map((bar) => {
        const position = bar.x / WAVEFORM_WIDTH;
        const played = progress > 0 && position <= progress;

        return (
          <motion.span
            // The tick's own x, which is unique within a waveform and stable
            // across re-renders — unlike its index, which is only a position.
            key={bar.x}
            className="absolute"
            initial={false}
            animate={{ backgroundColor: played ? PLAYED_COLOR : BAR_COLOR[bar.emphasis] }}
            transition={EASE_QUICK}
            style={
              raster
                ? {
                    left: `${snap(position * raster.width - barWidth / 2)}px`,
                    top: `${snap(bar.y)}px`,
                    height: `${snap(bar.height)}px`,
                    width: `${barWidth}px`,
                  }
                : {
                    // Pre-measurement, and on the server: the design's own
                    // geometry, so the first paint is right even if it is not
                    // yet aligned.
                    left: `${position * 100}%`,
                    top: `${bar.y}px`,
                    height: `${bar.height}px`,
                    width: `${STROKE}px`,
                  }
            }
          />
        );
      })}

      {/* The playhead. Hidden at rest so the idle frame is the design's. */}
      {progress > 0 ? (
        <motion.span
          className="absolute top-0 w-[1.5px] rounded-full bg-[#146C44]"
          style={{ height: `${WAVEFORM_HEIGHT}px`, left: `${progress * 100}%` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.8 }}
          transition={EASE_QUICK}
        />
      ) : null}
    </div>
  );
}
