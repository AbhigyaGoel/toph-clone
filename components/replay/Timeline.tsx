'use client';

import { motion } from 'framer-motion';
import { useCallback, useEffect, useRef } from 'react';

import { Icon } from '@/components/ui/Icon';
import { SPRING_SOFT } from '@/lib/motion';
import { clockLabel, type ReplayDay } from '@/lib/replay';

interface TimelineProps {
  readonly day: ReplayDay;
  readonly minute: number;
  readonly onMinute: (minute: number) => void;
  readonly playing: boolean;
  readonly onPlaying: (playing: boolean) => void;
  readonly speed: Speed;
  readonly onSpeed: (speed: Speed) => void;
  /** Minutes worth jumping to — the incursions — drawn as marks on the track. */
  readonly marks: readonly { readonly minute: number; readonly label: string }[];
}

export const SPEEDS = [1, 2, 5] as const;
export type Speed = (typeof SPEEDS)[number];

/** Replayed minutes per real second at 1x — a 12-hour day in about 40 seconds. */
const MINUTES_PER_SECOND = 18;

/**
 * The day, as something you can drag.
 *
 * Draggable first and playable second, which is the opposite of how a video
 * player is built and the right way round here. A manager does not want to watch
 * their farm; they want to jump to ten o'clock because that is when the spray
 * went on. Play exists so the demo can run itself and so an unfamiliar user sees
 * what the screen does without touching anything.
 *
 * The marks are the concession to the same impatience: the one moment on this
 * day worth seeing is labelled on the track, so finding it is a click rather
 * than a hunt.
 */
export function Timeline({
  day,
  minute,
  onMinute,
  playing,
  onPlaying,
  speed,
  onSpeed,
  marks,
}: TimelineProps) {
  const track = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const span = Math.max(1, day.endMinute - day.startMinute);
  const progress = (minute - day.startMinute) / span;

  /*
   * The clock the loop advances, mirrored into a ref.
   *
   * It cannot read `minute` from the closure: the effect is not re-created on
   * every minute change (that would reset the frame timer each tick and stall
   * it), so the captured value stays at whatever it was when play started and
   * every frame computes the same "start plus one frame" — the clock sits still
   * while the animation runs, which is exactly how it failed.
   */
  const clock = useRef(minute);
  useEffect(() => {
    clock.current = minute;
  }, [minute]);

  // Advances by wall-clock delta rather than a fixed step per tick, so a busy
  // frame does not slow the day down and 2x is exactly twice 1x.
  useEffect(() => {
    if (!playing) return undefined;

    let frame = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const elapsed = (now - last) / 1000;
      last = now;

      const next = Math.min(
        day.endMinute,
        clock.current + elapsed * MINUTES_PER_SECOND * speed
      );
      clock.current = next;
      onMinute(next);

      // Stop at the end rather than pinning against it, so the button returns
      // to Play and pressing it again is not a no-op.
      if (next >= day.endMinute) {
        onPlaying(false);
        return;
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed, day.endMinute, onMinute, onPlaying]);

  const seekTo = useCallback(
    (clientX: number) => {
      const box = track.current?.getBoundingClientRect();
      if (!box) return;
      const ratio = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
      onMinute(Math.round(day.startMinute + ratio * span));
    },
    [day.startMinute, span, onMinute]
  );

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (dragging.current) seekTo(event.clientX);
    };
    const up = () => {
      dragging.current = false;
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [seekTo]);

  const hours = hourTicks(day.startMinute, day.endMinute);

  return (
    <div className="flex w-full flex-col gap-[10px] self-stretch rounded-[16px] bg-white px-[16px] py-[14px] shadow-panel sm:px-[24px]">
      <div className="flex flex-wrap items-center gap-[12px]">
        <button
          type="button"
          onClick={() => onPlaying(!playing)}
          aria-label={playing ? 'Pause the replay' : 'Play the replay'}
          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-black text-white outline-none focus-visible:ring-2 focus-visible:ring-black/40"
        >
          <Icon name={playing ? 'pause' : 'play'} size={14} />
        </button>

        <span className="w-[86px] shrink-0 text-[19px] font-medium leading-[1.2] tabular-nums text-black">
          {clockLabel(minute)}
        </span>

        <div className="flex items-center gap-[3px] rounded-[80px] bg-black/[0.04] p-[3px]">
          {SPEEDS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onSpeed(option)}
              aria-pressed={speed === option}
              className={`rounded-[80px] px-[10px] py-[4px] text-[12px] font-normal leading-[1.3] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-black/30 ${
                speed === option ? 'bg-white text-black shadow-chip' : 'text-[#4D4D4D]'
              }`}
            >
              {option}x
            </button>
          ))}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-[8px]">
          {marks.map((mark) => (
            <button
              key={mark.minute}
              type="button"
              onClick={() => {
                onPlaying(false);
                onMinute(mark.minute);
              }}
              className="flex items-center gap-[5px] whitespace-nowrap rounded-[80px] bg-[rgba(176,0,32,0.08)] px-[10px] py-[5px] text-[12px] font-normal leading-[1.3] text-[#B00020] outline-none transition-colors hover:bg-[rgba(176,0,32,0.14)] focus-visible:ring-2 focus-visible:ring-[#B00020]/40"
            >
              <Icon name="x" size={10} />
              {mark.label}
            </button>
          ))}
        </div>
      </div>

      {/* The track. A real slider for the keyboard, drawn by hand for the eye. */}
      <div
        ref={track}
        onPointerDown={(event) => {
          dragging.current = true;
          onPlaying(false);
          seekTo(event.clientX);
        }}
        className="relative h-[34px] w-full cursor-pointer touch-none select-none"
      >
        <span className="absolute left-0 right-0 top-[13px] h-[6px] rounded-[80px] bg-black/[0.07]" />

        <motion.span
          animate={{ scaleX: Math.min(1, Math.max(0, progress)) }}
          transition={{ duration: 0 }}
          style={{ transformOrigin: 'left' }}
          className="absolute left-0 right-0 top-[13px] h-[6px] rounded-[80px] bg-black/70"
        />

        {/* Where somebody was on a closed field. */}
        {marks.map((mark) => (
          <span
            key={mark.minute}
            title={mark.label}
            className="absolute top-[9px] h-[14px] w-[3px] -translate-x-1/2 rounded-[2px] bg-[#B00020]"
            style={{ left: `${((mark.minute - day.startMinute) / span) * 100}%` }}
          />
        ))}

        <motion.span
          animate={{ left: `${Math.min(100, Math.max(0, progress * 100))}%` }}
          transition={SPRING_SOFT}
          className="pointer-events-none absolute top-[8px] h-[18px] w-[18px] -translate-x-1/2 rounded-full border-2 border-white bg-black shadow-chip"
        />

        <input
          type="range"
          min={day.startMinute}
          max={day.endMinute}
          value={minute}
          onChange={(event) => {
            onPlaying(false);
            onMinute(Number(event.target.value));
          }}
          aria-label={`Time of day — ${clockLabel(minute)}`}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>

      <div className="flex justify-between">
        {hours.map((hour) => (
          <span key={hour} className="text-[10px] font-normal leading-[1.2] text-[#B3B3B3]">
            {clockLabel(hour)}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Round hours across the window, at most eight so the labels never collide. */
function hourTicks(start: number, end: number): readonly number[] {
  const first = Math.ceil(start / 60);
  const last = Math.floor(end / 60);
  const step = Math.max(1, Math.ceil((last - first) / 7));
  const out: number[] = [];
  for (let hour = first; hour <= last; hour += step) out.push(hour * 60);
  return out;
}
