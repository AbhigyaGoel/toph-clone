'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';

import { useLogQueryNavigation } from '@/components/dashboard/useLogQueryNavigation';
import { Icon } from '@/components/ui/Icon';
import {
  EMPTY_LOG_QUERY,
  RANGE_KEYS,
  RANGE_LABELS,
  SORT_LABELS,
  toggleFilterValue,
  type ListFilterKey,
  type LogQuery,
} from '@/lib/logQuery';
import { EASE_QUICK, SPRING_SOFT } from '@/lib/motion';
import type { FilterOptions } from '@/lib/types';

interface FilterRailProps {
  readonly options: FilterOptions;
}

const FACETS: ReadonlyArray<{
  key: ListFilterKey;
  label: string;
  source: keyof FilterOptions;
}> = [
  { key: 'activity', label: 'Activity', source: 'activities' },
  { key: 'field', label: 'Field', source: 'fields' },
  { key: 'employee', label: 'Employee', source: 'employees' },
  { key: 'tag', label: 'Tag', source: 'tags' },
];

/** How many values a facet shows before it needs expanding. */
const COLLAPSED = 6;

/**
 * Faceted filters, always visible.
 *
 * The dashboard hides the same filters behind a chip menu, and that is right
 * there: the dashboard's job is working through this month's logs, filtering is
 * occasional, and the chips keep the table as wide as the design draws it.
 *
 * An archive is the opposite. Its whole job is narrowing — you arrive knowing
 * roughly what you want and you do not know which combination will find it —
 * and a menu you have to open, read, pick from and close for each of four
 * dimensions turns one question into twelve interactions. Laid out, every
 * dimension is visible at once and the current narrowing is readable without
 * clicking anything.
 */
export function FilterRail({ options }: FilterRailProps) {
  const { query, replace } = useLogQueryNavigation();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  const applied =
    (query.sort === EMPTY_LOG_QUERY.sort ? 0 : 1) +
    (query.range === EMPTY_LOG_QUERY.range ? 0 : 1) +
    FACETS.reduce((total, facet) => total + query[facet.key].length, 0);

  const toggleExpanded = (key: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <aside className="flex w-full flex-col self-stretch overflow-hidden rounded-[20px] bg-white shadow-panel xl:w-[248px] xl:shrink-0">
      <div className="flex items-center justify-between gap-[10px] px-[20px] py-[16px] shadow-divider">
        <span className="flex items-center gap-[8px]">
          <Icon name="funnel" className="text-black" />
          <h2 className="text-[14px] font-medium leading-[1.3] text-black">Narrow</h2>
        </span>
        {applied > 0 ? (
          <button
            type="button"
            onClick={() => replace({ ...EMPTY_LOG_QUERY, q: query.q, open: query.open })}
            className="rounded-[80px] px-[8px] py-[3px] text-[12px] font-normal leading-[1.3] text-[#4D4D4D] outline-none transition-colors hover:bg-black/[0.05] focus-visible:ring-2 focus-visible:ring-black/30"
          >
            Clear {applied}
          </button>
        ) : null}
      </div>

      <div className="flex flex-col gap-[2px] px-[12px] py-[12px] shadow-divider">
        <FacetLabel>Sort</FacetLabel>
        {(['date-desc', 'date', 'employee', 'activity'] as const).map((key) => (
          <Choice
            key={key}
            label={SORT_LABELS[key]}
            selected={query.sort === key}
            shape="radio"
            onSelect={() => replace({ ...query, sort: query.sort === key ? 'none' : key })}
          />
        ))}
      </div>

      <div className="flex flex-col gap-[2px] px-[12px] py-[12px] shadow-divider">
        <FacetLabel>Date range</FacetLabel>
        {RANGE_KEYS.map((key) => (
          <Choice
            key={key}
            label={RANGE_LABELS[key]}
            selected={query.range === key}
            shape="radio"
            onSelect={() => replace({ ...query, range: key })}
          />
        ))}
      </div>

      {FACETS.filter(({ source }) => options[source].length > 0).map(({ key, label, source }) => {
        const values = options[source];
        const open = expanded.has(key);
        const shown = open ? values : values.slice(0, COLLAPSED);
        const selected = query[key];

        return (
          <div key={key} className="flex flex-col gap-[2px] px-[12px] py-[12px] shadow-divider">
            <FacetLabel count={selected.length}>{label}</FacetLabel>

            {shown.map((value) => (
              <Choice
                key={value}
                label={value}
                selected={selected.includes(value)}
                shape="check"
                onSelect={() => replace(toggleFilterValue(query as LogQuery, key, value))}
              />
            ))}

            {values.length > COLLAPSED ? (
              <button
                type="button"
                onClick={() => toggleExpanded(key)}
                className="w-fit rounded-[6px] px-[10px] py-[4px] text-[12px] font-normal leading-[1.3] text-[#146C44] outline-none transition-colors hover:bg-black/[0.04] focus-visible:ring-2 focus-visible:ring-[#146C44]/40"
              >
                {open ? 'Show fewer' : `Show all ${values.length}`}
              </button>
            ) : null}
          </div>
        );
      })}
    </aside>
  );
}

interface FacetLabelProps {
  readonly children: string;
  readonly count?: number;
}

function FacetLabel({ children, count = 0 }: FacetLabelProps) {
  return (
    <span className="flex items-center gap-[6px] px-[10px] pb-[4px] text-[10px] font-medium uppercase tracking-[0.04em] text-[#B3B3B3]">
      {children}
      {count > 0 ? (
        <span className="rounded-[80px] bg-black px-[6px] py-[1px] text-[10px] leading-[1.3] text-white">
          {count}
        </span>
      ) : null}
    </span>
  );
}

interface ChoiceProps {
  readonly label: string;
  readonly selected: boolean;
  readonly shape: 'radio' | 'check';
  readonly onSelect: () => void;
}

function Choice({ label, selected, shape, onSelect }: ChoiceProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      role={shape === 'radio' ? 'radio' : 'checkbox'}
      aria-checked={selected}
      className="flex items-center gap-[9px] rounded-[6px] px-[10px] py-[5px] text-left outline-none transition-colors hover:bg-black/[0.03] focus-visible:ring-2 focus-visible:ring-black/30"
    >
      <motion.span
        initial={false}
        animate={{
          backgroundColor: selected ? '#1A1A1A' : 'rgba(0,0,0,0)',
          borderColor: selected ? '#1A1A1A' : 'rgba(0,0,0,0.2)',
        }}
        transition={EASE_QUICK}
        className={`flex h-[14px] w-[14px] shrink-0 items-center justify-center border-[1.5px] text-white ${
          shape === 'radio' ? 'rounded-full' : 'rounded-[4px]'
        }`}
      >
        {selected ? (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={SPRING_SOFT}
            className="flex items-center"
          >
            <Icon name="check" size={9} strokeWidth={3.2} />
          </motion.span>
        ) : null}
      </motion.span>

      <span
        className={`truncate text-[13px] leading-[1.3] ${selected ? 'font-medium text-black' : 'font-normal text-[#4D4D4D]'}`}
      >
        {label}
      </span>
    </button>
  );
}
