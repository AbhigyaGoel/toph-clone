'use client';

import { motion } from 'framer-motion';

import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { SPRING_SOFT } from '@/lib/motion';

interface ReadinessHeroProps {
  readonly ready: number;
  readonly incomplete: number;
  readonly missing: number;
  readonly periodLabel: string;
}

const RING = { size: 132, stroke: 14 };

const SEGMENTS = [
  { key: 'ready', colour: '#146C44', label: 'Audit ready' },
  { key: 'incomplete', colour: '#B00020', label: 'Incomplete' },
  { key: 'missing', colour: 'rgba(176,0,32,0.35)', label: 'Missing' },
] as const;

/**
 * Whether this period would survive an inspection, said once, at the top.
 *
 * The rest of this app summarises with a row of cards. That is right for a
 * dashboard, where four unrelated numbers matter equally — and wrong here,
 * because these numbers are not unrelated: they are three parts of one whole,
 * and the only question anyone asks of them is what fraction of the evidence
 * holds up. A ring says that in one glance; four cards make you do the division.
 *
 * The headline is a sentence rather than a figure for the same reason. "Two
 * records need attention" is what a grower repeats to somebody else; "2" is not.
 */
export function ReadinessHero({ ready, incomplete, missing, periodLabel }: ReadinessHeroProps) {
  const total = ready + incomplete + missing;
  const attention = incomplete + missing;

  const radius = (RING.size - RING.stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  // Offsets accumulate so the segments sit end to end around the ring.
  let consumed = 0;
  const arcs = SEGMENTS.map((segment) => {
    const value = segment.key === 'ready' ? ready : segment.key === 'incomplete' ? incomplete : missing;
    const fraction = total === 0 ? 0 : value / total;
    const arc = { ...segment, value, fraction, offset: consumed };
    consumed += fraction;
    return arc;
  });

  return (
    <div className="flex w-full flex-col items-start gap-[24px] self-stretch rounded-[20px] bg-white p-[24px] shadow-panel sm:flex-row sm:items-center sm:p-[30px]">
      <div className="relative flex shrink-0 items-center justify-center">
        <svg
          width={RING.size}
          height={RING.size}
          viewBox={`0 0 ${RING.size} ${RING.size}`}
          role="img"
          aria-label={`${ready} of ${total} records audit ready`}
        >
          {/* Rotated so the first segment starts at twelve o'clock. */}
          <g transform={`rotate(-90 ${RING.size / 2} ${RING.size / 2})`}>
            <circle
              cx={RING.size / 2}
              cy={RING.size / 2}
              r={radius}
              fill="none"
              stroke="rgba(0,0,0,0.05)"
              strokeWidth={RING.stroke}
            />
            {arcs.map((arc) => (
              <motion.circle
                key={arc.key}
                cx={RING.size / 2}
                cy={RING.size / 2}
                r={radius}
                fill="none"
                stroke={arc.colour}
                strokeWidth={RING.stroke}
                strokeLinecap="butt"
                strokeDasharray={circumference}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset: circumference * (1 - arc.fraction) }}
                transition={{ ...SPRING_SOFT, delay: 0.1 }}
                style={{ rotate: `${arc.offset * 360}deg`, transformOrigin: 'center' }}
              />
            ))}
          </g>
        </svg>

        <span className="absolute flex flex-col items-center">
          <span className="text-[26px] font-medium leading-[1.1] tabular-nums text-black">
            {total === 0 ? '—' : <AnimatedNumber value={Math.round((ready / total) * 100)} from={0} />}
            {total === 0 ? '' : '%'}
          </span>
          <span className="text-[10px] font-medium uppercase tracking-[0.04em] text-[#B3B3B3]">
            ready
          </span>
        </span>
      </div>

      <div className="flex min-w-0 flex-col gap-[10px]">
        <div className="flex flex-col gap-[4px]">
          {/*
            States readiness, not the exception count.

            This used to read "2 records need attention" directly above a panel
            titled "Needs attention (2)" — the same sentence and the same number
            twice within 100px, which makes a reader check whether they are two
            different things. The panel owns the problem; the hero owns the
            answer to "can I file this period".
          */}
          <h2 className="text-[20px] font-semibold leading-[1.3] text-black">
            {total === 0
              ? 'Nothing was applied in this period'
              : attention === 0
                ? 'This period is audit ready'
                : `${ready} of ${total} records are inspection-ready`}
          </h2>
          <p className="max-w-[560px] text-[14px] font-normal leading-[1.5] text-[#4D4D4D]">
            {total === 0
              ? 'No spray, fertilizer or amendment was recorded against a log inside this window.'
              : attention === 0
                ? `All ${total} application ${total === 1 ? 'record carries' : 'records carry'} the treated area and — for pesticides — the registration number and the conditions at application.`
                : 'An inspection is passed or failed on the records that are missing or short, not on the ones that are fine. Those are listed first below, and each can be fixed from the row that reports it.'}
          </p>
        </div>

        <dl className="flex flex-wrap items-center gap-x-[22px] gap-y-[8px] pt-[2px]">
          {arcs.map((arc) => (
            <div key={arc.key} className="flex items-center gap-[8px]">
              <span
                className="h-[10px] w-[10px] shrink-0 rounded-[3px]"
                style={{ backgroundColor: arc.colour }}
              />
              <dt className="text-[13px] font-normal leading-[1.3] text-[#4D4D4D]">{arc.label}</dt>
              <dd className="text-[13px] font-medium leading-[1.3] tabular-nums text-black">
                {arc.value}
              </dd>
            </div>
          ))}
          <span className="text-[13px] font-normal leading-[1.3] text-[#B3B3B3]">
            {periodLabel.toLowerCase()}
          </span>
        </dl>
      </div>
    </div>
  );
}
