'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { EmptyState } from '@/components/shell/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { PageEntrance } from '@/components/ui/PageEntrance';
import { formatLogDate } from '@/lib/format';
import { SPRING_SOFT } from '@/lib/motion';
import { groupHours } from '@/lib/reports';
import type { ActivityLog, EmployeeOverview } from '@/lib/types';

interface PerformanceScreenProps {
  readonly crew: readonly EmployeeOverview[];
  readonly logs: readonly ActivityLog[];
  readonly periodLabel: string;
}

/** Below this, a transcript usually needs reading against the audio. */
const ATTENTION = 0.8;

type Measure = 'accuracy' | 'hours' | 'logs';

const MEASURES: ReadonlyArray<{ key: Measure; label: string }> = [
  { key: 'accuracy', label: 'Transcription accuracy' },
  { key: 'hours', label: 'Hours logged' },
  { key: 'logs', label: 'Logs recorded' },
];

/**
 * A scoreboard, not a table.
 *
 * The question this screen answers is comparative and has exactly one shape:
 * rank everyone by something, and look at the ends of the list. A table with
 * six columns makes you do that ranking yourself; a single sortable bar per
 * person does it for you, and the outlier is visible before you have read a
 * name.
 *
 * The banner at the top exists because the most valuable thing here is usually
 * one row. Transcription accuracy is not a performance metric about a person —
 * a low bar is a noisy cab, a phone held wrong, an accent the model has not
 * heard — and stating that plainly stops the screen being read as a ranking of
 * who is good at their job.
 */
export function PerformanceScreen({ crew, logs, periodLabel }: PerformanceScreenProps) {
  const [measure, setMeasure] = useState<Measure>('accuracy');

  const hoursByWorker = useMemo(() => {
    const index = new Map<string, number>();
    for (const slice of groupHours(logs, (log) => log.employee)) {
      index.set(slice.label, slice.hours);
    }
    return index;
  }, [logs]);

  const logsByWorker = useMemo(() => {
    const index = new Map<string, number>();
    for (const log of logs) index.set(log.employee, (index.get(log.employee) ?? 0) + 1);
    return index;
  }, [logs]);

  const valueOf = (person: EmployeeOverview): number | null => {
    if (measure === 'accuracy') return person.meanConfidence;
    if (measure === 'hours') return hoursByWorker.get(person.name) ?? 0;
    return logsByWorker.get(person.name) ?? 0;
  };

  const ranked = useMemo(() => {
    const scored = crew
      .map((person) => ({ person, value: valueOf(person) }))
      .filter((row) => row.value !== null);

    // Accuracy ranks worst-first, because the bottom of that list is the only
    // part anyone acts on. Output ranks best-first, as a leaderboard should.
    return scored.sort((a, b) =>
      measure === 'accuracy'
        ? (a.value as number) - (b.value as number)
        : (b.value as number) - (a.value as number)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crew, measure, hoursByWorker, logsByWorker]);

  const peak = Math.max(...ranked.map((row) => row.value as number), measure === 'accuracy' ? 1 : 1);
  const outlier = crew.find(
    (person) => person.recordingCount > 0 && (person.meanConfidence ?? 1) < ATTENTION
  );

  const transcribed = crew.filter((person) => person.meanConfidence !== null);
  const mean =
    transcribed.length > 0
      ? transcribed.reduce((sum, person) => sum + (person.meanConfidence ?? 0), 0) / transcribed.length
      : null;

  const format = (value: number): string => {
    if (measure === 'accuracy') return `${Math.round(value * 100)}%`;
    if (measure === 'hours') return `${value}h`;
    return String(value);
  };

  return (
    <>
      {outlier ? (
        <PageEntrance index={1}>
          <div className="flex w-full flex-col gap-[10px] self-stretch rounded-[16px] bg-[rgba(176,0,32,0.06)] p-[20px] sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-[12px]">
              <span className="mt-[2px] flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full bg-[rgba(176,0,32,0.12)] text-[#B00020]">
                <Icon name="audio-lines" size={13} />
              </span>
              <div className="flex flex-col gap-[3px]">
                <span className="text-[15px] font-medium leading-[1.3] text-black">
                  {outlier.name}&rsquo;s recordings transcribe at{' '}
                  {Math.round((outlier.meanConfidence ?? 0) * 100)}%
                </span>
                <span className="max-w-[640px] text-[13px] font-normal leading-[1.5] text-[#4D4D4D]">
                  The rest of the crew averages{' '}
                  {mean === null ? '—' : `${Math.round(mean * 100)}%`}. That gap is almost always
                  equipment or environment rather than the person — a noisy cab, a phone held too
                  far away, wind across the microphone. Worth checking before those transcripts are
                  trusted.
                </span>
              </div>
            </div>
            <Link
              href={`/activity-logs?range=all&sort=date-desc&employee=${encodeURIComponent(outlier.name)}`}
              className="flex shrink-0 items-center gap-[6px] self-start whitespace-nowrap rounded-[80px] bg-white px-[14px] py-[7px] text-[14px] font-normal leading-[1.3] text-[#4D4D4D] shadow-chip outline-none focus-visible:ring-2 focus-visible:ring-black/30 sm:self-auto"
            >
              Their logs
              <Icon name="expand" size={12} />
            </Link>
          </div>
        </PageEntrance>
      ) : null}

      <PageEntrance index={2}>
        <div className="flex w-full flex-col gap-[14px] self-stretch pt-[6px] md:flex-row md:items-baseline md:justify-between">
          <h2 className="text-[16px] font-normal leading-[1.3] text-black">
            The crew, {periodLabel.toLowerCase()}
          </h2>

          <div className="flex items-center gap-[6px]">
            {MEASURES.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setMeasure(key)}
                aria-pressed={measure === key}
                className="relative rounded-[80px] px-[14px] py-[7px] text-[14px] font-normal leading-[1.3] outline-none focus-visible:ring-2 focus-visible:ring-black/30"
              >
                {measure === key ? (
                  <motion.span
                    layoutId="performance-measure"
                    transition={SPRING_SOFT}
                    className="absolute inset-0 rounded-[80px] bg-black"
                  />
                ) : null}
                <span className={`relative ${measure === key ? 'text-white' : 'text-[#4D4D4D]'}`}>
                  {label}
                </span>
              </button>
            ))}
          </div>
        </div>
      </PageEntrance>

      <PageEntrance index={3}>
        {ranked.length === 0 ? (
          <div className="w-full self-stretch rounded-[20px] bg-white shadow-panel">
            <EmptyState
              icon="chart-pie"
              title="Nothing to rank yet"
              body="Once the crew has logged work in this period, they appear here ranked by whichever measure you choose."
            />
          </div>
        ) : (
          <section aria-label="Crew ranking" className="flex w-full flex-col gap-[6px] self-stretch">
            {ranked.map((row, index) => {
              const value = row.value as number;
              const low = measure === 'accuracy' && value < ATTENTION;

              return (
                <motion.div
                  key={row.person.id}
                  layout
                  transition={SPRING_SOFT}
                  className="flex items-center gap-[16px] rounded-[14px] bg-white px-[20px] py-[16px] shadow-card"
                >
                  <span className="w-[24px] shrink-0 text-[14px] font-medium leading-[1.3] tabular-nums text-[#B3B3B3]">
                    {index + 1}
                  </span>

                  <span className="w-[150px] shrink-0 truncate text-[15px] font-normal leading-[1.3] text-black">
                    {row.person.name}
                  </span>

                  <span className="relative flex h-[26px] min-w-0 flex-1 items-center">
                    <span className="h-[26px] w-full overflow-hidden rounded-[8px] bg-black/[0.04]">
                      <motion.span
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: Math.max(value / peak, 0.02) }}
                        transition={{ ...SPRING_SOFT, delay: index * 0.03 }}
                        style={{ transformOrigin: 'left' }}
                        className={`block h-full w-full rounded-[8px] ${
                          low ? 'bg-[rgba(176,0,32,0.75)]' : 'bg-[rgba(20,108,68,0.75)]'
                        }`}
                      />
                    </span>
                    {measure === 'accuracy' ? (
                      <span
                        aria-hidden
                        title="80% — below this a transcript usually needs checking"
                        className="absolute top-[-3px] h-[32px] w-[1.5px] rounded-full bg-black/20"
                        style={{ left: `${ATTENTION * 100}%` }}
                      />
                    ) : null}
                  </span>

                  <span
                    className={`w-[64px] shrink-0 text-right text-[16px] font-medium leading-[1.3] tabular-nums ${
                      low ? 'text-[#B00020]' : 'text-black'
                    }`}
                  >
                    {format(value)}
                  </span>

                  <span className="hidden w-[132px] shrink-0 text-right text-[12px] font-normal leading-[1.3] text-[#B3B3B3] lg:block">
                    {measure === 'accuracy'
                      ? `${row.person.recordingCount} ${row.person.recordingCount === 1 ? 'recording' : 'recordings'}`
                      : row.person.lastLoggedAt
                        ? formatLogDate(row.person.lastLoggedAt)
                        : '—'}
                  </span>
                </motion.div>
              );
            })}
          </section>
        )}
      </PageEntrance>
    </>
  );
}
