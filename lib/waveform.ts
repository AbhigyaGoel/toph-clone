import type { WaveformBar, WaveformData } from '@/lib/types';

/**
 * Design-space dimensions of the Figma `Group 1` waveform: 98 vertical ticks
 * across a 592 x 80.96 frame, each centred on the frame's midline.
 */
export const WAVEFORM_WIDTH = 592;
export const WAVEFORM_HEIGHT = 80.96;
export const WAVEFORM_BAR_COUNT = 98;

const STEP = WAVEFORM_WIDTH / (WAVEFORM_BAR_COUNT - 1);
const MIDLINE = WAVEFORM_HEIGHT / 2;

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Expands stored amplitudes into the bars the waveform component draws.
 *
 * The database keeps one normalised amplitude per tick plus the number of
 * leading ticks that carry signal; x and y are derived here because they are
 * layout, not data. Isaac Wang's design waveform round-trips through this
 * exactly: every tick in Figma sits on the midline at a multiple of 592/97.
 */
export function expandWaveform(data: WaveformData): readonly WaveformBar[] {
  return data.amplitudes.map((amplitude, index) => {
    const height = round2(amplitude * WAVEFORM_HEIGHT);
    return {
      x: round2(index * STEP),
      y: round2(MIDLINE - height / 2),
      height,
      emphasis: index < data.voicedBars ? 'strong' : 'muted',
    };
  });
}

/**
 * A stored waveform for a newly ingested recording.
 *
 * Derived from the audio's own bytes when they are available: the file is
 * chunked into `WAVEFORM_BAR_COUNT` windows and each window's mean absolute
 * deviation becomes that bar's amplitude. Compressed audio is not PCM, so this
 * is a texture rather than a true envelope — but it is a texture *of this
 * recording*, which is the property that matters: two different logs never draw
 * the same picture, and a quiet passage still reads as quieter.
 *
 * Without audio it falls back to the transcript's own shape, so an offline
 * ingestion still produces a stable, recording-specific drawing instead of a
 * flat line.
 */
export function buildWaveform(
  bytes: Uint8Array | null,
  transcript: string
): { amplitudes: number[]; voiced_bars: number } {
  const source = bytes && bytes.length >= WAVEFORM_BAR_COUNT ? bytes : null;
  const amplitudes: number[] = [];

  if (source) {
    const window = Math.floor(source.length / WAVEFORM_BAR_COUNT);
    for (let bar = 0; bar < WAVEFORM_BAR_COUNT; bar += 1) {
      const start = bar * window;
      let total = 0;
      for (let index = start; index < start + window; index += 1) {
        total += Math.abs(source[index] - 128);
      }
      amplitudes.push(total / window / 128);
    }
  } else {
    // Deterministic from the transcript, so the same text always draws the same.
    let hash = 2166136261;
    for (let index = 0; index < transcript.length; index += 1) {
      hash = Math.imul(hash ^ transcript.charCodeAt(index), 16777619) >>> 0;
    }
    for (let bar = 0; bar < WAVEFORM_BAR_COUNT; bar += 1) {
      hash = Math.imul(hash ^ (bar + 1), 16777619) >>> 0;
      amplitudes.push((hash % 1000) / 1000);
    }
  }

  // Normalise to the 0.087–1 range the renderer and the stored schema expect.
  const peak = Math.max(...amplitudes, 0.0001);
  const scaled = amplitudes.map((value) =>
    Math.min(1, Math.max(0.08696, Number((value / peak).toFixed(5))))
  );

  // Trailing silence: the last stretch below a tenth of peak reads as unvoiced.
  let voiced = scaled.length;
  while (voiced > 1 && scaled[voiced - 1] <= 0.1) voiced -= 1;

  return { amplitudes: scaled, voiced_bars: voiced };
}
