'use client';

import { motion } from 'framer-motion';

import { EmptyState } from '@/components/shell/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { SPRING_SOFT } from '@/lib/motion';
import type { VocabularyTerm } from '@/lib/vocabulary';

interface VocabularyPanelProps {
  readonly terms: readonly VocabularyTerm[];
}

/**
 * What the farm has taught the extractor, and what it now gets right.
 *
 * This is the only screen in the product that looks backwards at the machine
 * rather than at the work. It exists because every inline correction is already
 * a labelled example — the machine heard "spin assault", somebody who knows the
 * farm typed "Spinosad 480SC" — and a product that collects those and does
 * nothing with them is asking the same person the same question forever.
 *
 * A farm's vocabulary is small, closed and strange: eleven blocks with invented
 * names, a dozen products whose labels are chemistry rather than English. No
 * general speech model will ever hear "Field K" reliably, and waiting for a
 * better one is not a plan. The farm already knows the answer.
 *
 * The number that matters is the correction count, not the accuracy figure. A
 * term corrected four times is four minutes of a manager's morning spent
 * retyping something the system was told about three times already — and it is
 * the one measure here that goes *down* when the product works.
 */
export function VocabularyPanel({ terms }: VocabularyPanelProps) {
  const learned = terms.filter((term) => term.corrections > 0);
  const clean = terms.filter((term) => term.corrections === 0 && term.confidence !== null);

  if (terms.length === 0) {
    return (
      <EmptyState
        icon="book-check"
        title="Nothing corrected yet"
        body="When somebody fixes an extracted field, the original and the correction are both kept — and the extractor stops making that mistake. Corrections appear here as they happen."
      />
    );
  }

  return (
    <div className="flex flex-col">
      {learned.map((term, index) => (
        <div
          key={`${term.field}:${term.term}`}
          className={`flex flex-col gap-[8px] px-[16px] py-[14px] sm:px-[30px] ${
            index === learned.length - 1 && clean.length === 0 ? '' : 'shadow-divider'
          }`}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-[10px]">
            <span className="flex items-baseline gap-[8px]">
              <span className="text-[15px] font-medium leading-[1.3] text-black">{term.term}</span>
              <span className="text-[11px] font-normal leading-[1.3] text-[#B3B3B3]">
                {term.fieldLabel}
              </span>
            </span>

            <span className="flex items-center gap-[8px]">
              <span className="rounded-[80px] bg-[rgba(20,108,68,0.1)] px-[9px] py-[2px] text-[11px] font-medium leading-[1.4] text-[#146C44]">
                learned from {term.corrections}{' '}
                {term.corrections === 1 ? 'correction' : 'corrections'}
              </span>
              {term.confidence === null ? null : (
                <span className="text-[12px] font-normal leading-[1.3] tabular-nums text-[#4D4D4D]">
                  now heard at {Math.round(term.confidence * 100)}%
                </span>
              )}
            </span>
          </div>

          {/*
            The mishearings, shown as themselves. A manager reading "spin
            assault" recognises the noise of their own farm — an engine running,
            somebody shouting — and that is what makes the feature legible in
            two seconds rather than needing an explanation.
          */}
          <div className="flex flex-wrap items-center gap-[6px]">
            {term.variants.map((variant) => (
              <motion.span
                key={variant.heard}
                layout
                transition={SPRING_SOFT}
                className="flex items-center gap-[5px] rounded-[80px] bg-black/[0.04] px-[9px] py-[3px] text-[12px] font-normal leading-[1.3] text-[#4D4D4D]"
              >
                <span className="italic">“{variant.heard}”</span>
                {variant.count > 1 ? (
                  <span className="tabular-nums text-[#B3B3B3]">×{variant.count}</span>
                ) : null}
              </motion.span>
            ))}
            <Icon name="expand" size={10} className="text-[#B3B3B3]" />
            <span className="text-[12px] font-normal leading-[1.3] text-black">{term.term}</span>
          </div>
        </div>
      ))}

      {clean.length === 0 ? null : (
        <div className="flex flex-col gap-[8px] px-[16px] py-[14px] sm:px-[30px]">
          <span className="text-[10px] font-medium uppercase tracking-[0.04em] text-[#B3B3B3]">
            Recognised without help
          </span>
          <div className="flex flex-wrap gap-[6px]">
            {clean.map((term) => (
              <span
                key={`${term.field}:${term.term}`}
                className="flex items-center gap-[6px] rounded-[80px] bg-black/[0.03] px-[10px] py-[4px] text-[12px] font-normal leading-[1.3] text-[#4D4D4D]"
              >
                {term.term}
                <span className="tabular-nums text-[#B3B3B3]">
                  {Math.round((term.confidence ?? 0) * 100)}%
                </span>
              </span>
            ))}
          </div>
          <span className="text-[12px] font-normal leading-[1.4] text-[#B3B3B3]">
            These have never needed a correction — nothing to teach.
          </span>
        </div>
      )}
    </div>
  );
}
