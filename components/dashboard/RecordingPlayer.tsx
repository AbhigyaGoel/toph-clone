'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

import { RecordingWaveform } from '@/components/dashboard/RecordingWaveform';
import { Icon } from '@/components/ui/Icon';
import { formatDuration } from '@/lib/format';
import { EASE_QUICK, SPRING_SOFT } from '@/lib/motion';
import type { WaveformBar } from '@/lib/types';

interface RecordingPlayerProps {
  readonly audioUrl: string | null;
  readonly durationSeconds: number;
  readonly bars: readonly WaveformBar[];
  /** Named in the controls' labels so screen readers know which log is playing. */
  readonly label: string;
}

const BUTTON_CLASS =
  'flex items-center justify-center gap-[10px] self-stretch rounded-[7.04px] px-[8.8px] py-[10.56px] text-[16px] font-normal leading-[1.3] outline-none focus-visible:ring-2 focus-visible:ring-black/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed';

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * Playback for one recording.
 *
 * The transport is a real `<audio>` element driven by `recordings.audio_url`,
 * not a timer pretending to be one: position comes from `timeupdate`, length
 * from the decoded file, and seeking writes `currentTime`. `duration_seconds`
 * from the database is used only until the file reports its own, so the
 * waveform is scaled correctly on the first frame instead of jumping once
 * metadata lands.
 *
 * With no file attached the control says so and disables itself. That is the
 * honest state for a row whose recording has not been uploaded — a play button
 * that silently does nothing is the thing this rewrite set out to remove.
 */
export function RecordingPlayer({ audioUrl, durationSeconds, bars, label }: RecordingPlayerProps) {
  const audio = useRef<HTMLAudioElement>(null);
  const track = useRef<HTMLDivElement>(null);

  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [length, setLength] = useState(durationSeconds);
  const [failed, setFailed] = useState(false);

  const available = Boolean(audioUrl) && !failed;
  const progress = length > 0 ? clamp01(position / length) : 0;

  // A new recording replaces the element's source; reset rather than carry the
  // previous row's position into it.
  useEffect(() => {
    setPlaying(false);
    setPosition(0);
    setLength(durationSeconds);
    setFailed(false);
  }, [audioUrl, durationSeconds]);

  const seekTo = useCallback(
    (ratio: number) => {
      const element = audio.current;
      if (!element || !available || length <= 0) return;

      const next = clamp01(ratio) * length;
      element.currentTime = next;
      setPosition(next);
    },
    [available, length]
  );

  const seekFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = track.current?.getBoundingClientRect();
    if (!bounds || bounds.width === 0) return;
    seekTo((event.clientX - bounds.left) / bounds.width);
  };

  const toggle = useCallback(() => {
    const element = audio.current;
    if (!element || !available) return;

    if (element.paused) {
      // `play()` rejects when the browser blocks it or the file will not decode.
      void element.play().catch(() => setFailed(true));
    } else {
      element.pause();
    }
  }, [available]);

  /** Arrow keys scrub, space and enter toggle — the usual transport shortcuts. */
  const onTrackKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!available) return;

    const STEP = 5;
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      seekTo((position + STEP) / length);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      seekTo((position - STEP) / length);
    } else if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      toggle();
    }
  };

  return (
    <div className="flex w-full flex-col items-center gap-[20px]">
      {audioUrl ? (
        <audio
          ref={audio}
          src={audioUrl}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setPosition(0);
          }}
          onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
          onLoadedMetadata={(event) => {
            const decoded = event.currentTarget.duration;
            if (Number.isFinite(decoded) && decoded > 0) setLength(decoded);
          }}
          onError={() => setFailed(true)}
        />
      ) : null}

      <div
        ref={track}
        role="slider"
        aria-label={`Playback position for ${label}`}
        aria-valuemin={0}
        aria-valuemax={Math.round(length)}
        aria-valuenow={Math.round(position)}
        aria-valuetext={`${formatDuration(position)} of ${formatDuration(length)}`}
        aria-disabled={!available}
        tabIndex={available ? 0 : -1}
        onPointerDown={available ? seekFromPointer : undefined}
        onKeyDown={onTrackKeyDown}
        className={`w-full rounded-[4px] outline-none focus-visible:ring-2 focus-visible:ring-black/30 focus-visible:ring-offset-4 ${
          available ? 'cursor-pointer' : ''
        }`}
      >
        <RecordingWaveform bars={bars} progress={progress} />
      </div>

      <div className="flex w-full items-center justify-between text-[12px] font-normal leading-[1.3] text-black opacity-40">
        <span className="tabular-nums">{formatDuration(position)}</span>
        <span className="tabular-nums">{formatDuration(length)}</span>
      </div>

      <motion.button
        type="button"
        onClick={toggle}
        disabled={!available}
        whileHover={available ? { y: -1, scale: 1.01 } : undefined}
        whileTap={available ? { scale: 0.99 } : undefined}
        transition={SPRING_SOFT}
        className={`${BUTTON_CLASS} bg-white text-black shadow-detail-button ${
          available ? '' : 'opacity-50'
        }`}
      >
        <motion.span
          key={playing ? 'pause' : 'play'}
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={EASE_QUICK}
          className="flex items-center"
        >
          <Icon name={playing ? 'pause' : 'play'} />
        </motion.span>

        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={available ? (playing ? 'pausing' : 'playing') : 'unavailable'}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={EASE_QUICK}
          >
            {available ? (playing ? 'Pause Recording' : 'Play Recording') : 'Recording unavailable'}
          </motion.span>
        </AnimatePresence>
      </motion.button>

      {!available ? (
        <p className="text-[12px] font-normal leading-[1.3] text-black opacity-40">
          {failed
            ? 'The audio file for this log could not be played.'
            : 'No audio file is attached to this recording yet.'}
        </p>
      ) : null}
    </div>
  );
}
