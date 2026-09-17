'use client';

import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { forwardRef, type ReactNode } from 'react';

import { ChipMenu, type ChipMenuSection } from '@/components/dashboard/ChipMenu';
import { FilterChipButton } from '@/components/dashboard/FilterChipButton';
import { useLogQueryNavigation } from '@/components/dashboard/useLogQueryNavigation';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { Icon } from '@/components/ui/Icon';
import {
  EMPTY_LOG_QUERY,
  LIST_FILTER_KEYS,
  RANGE_KEYS,
  RANGE_LABELS,
  SORT_LABELS,
  toggleFilterValue,
  type ListFilterKey,
  type LogQuery,
} from '@/lib/logQuery';
import { chipPopVariants, chipVariants, SPRING_SOFT } from '@/lib/motion';
import type { FilterOptions } from '@/lib/types';

interface LogPanelToolbarProps {
  readonly title: string;
  /** How many rows the current query returned; shown on the range chip. */
  readonly count: number;
  readonly options: FilterOptions;
  readonly canWrite: boolean;
  /**
   * The write entry points. Absent on screens that only read — the archive
   * filters the same logs but is not where new ones are created.
   */
  readonly onNewLog?: () => void;
  readonly onManage?: () => void;
  /** Extra controls placed after the chips, e.g. an export button. */
  readonly trailing?: ReactNode;
}

const LIST_FILTERS: ReadonlyArray<{
  key: ListFilterKey;
  label: string;
  source: keyof FilterOptions;
}> = [
  { key: 'activity', label: 'ACTIVITY', source: 'activities' },
  { key: 'field', label: 'FIELD', source: 'fields' },
  { key: 'employee', label: 'EMPLOYEE', source: 'employees' },
  { key: 'tag', label: 'TAG', source: 'tags' },
];

/**
 * Figma `Frame 179` — panel title on the left, filter chips on the right.
 *
 * The design's chip row reads: an applied sort ("Date" with an x), the Sort
 * picker, an applied date range ("This Month" with an x), and the Filter
 * picker. Those two applied chips are the query's defaults, so the resting
 * page matches the design; clearing or changing either rewrites the URL.
 * Any list filter picked from the Filter menu appears as its own x-chip.
 *
 * The row is a LayoutGroup wrapping an AnimatePresence in `popLayout` mode: a
 * chip leaving is taken out of the flow before it finishes shrinking, so its
 * neighbours start closing the gap immediately rather than snapping once it is
 * gone. That, plus `layout` on every chip, is what makes applying a filter push
 * the row aside instead of re-drawing it.
 *
 * Every chip is two elements, and the split is load-bearing: the outer one
 * carries `layout` and fades, the inner one does the scale pop. Framer measures
 * layout from bounding rects, so a single element doing both would be animating
 * towards a box that its own `scale` was still changing — which is what made
 * this row shudder rather than glide as filters were applied.
 */
export function LogPanelToolbar({
  title,
  count,
  options,
  canWrite,
  onNewLog,
  onManage,
  trailing,
}: LogPanelToolbarProps) {
  const { query, replace } = useLogQueryNavigation();

  const sortSections: readonly ChipMenuSection[] = [
    {
      id: 'sort',
      label: 'SORT BY',
      options: (Object.keys(SORT_LABELS) as Array<keyof typeof SORT_LABELS>).map((key) => ({
        id: key,
        label: SORT_LABELS[key],
        selected: query.sort === key,
        onSelect: () => replace({ ...query, sort: key }),
      })),
    },
  ];

  const filterSections: readonly ChipMenuSection[] = [
    {
      id: 'range',
      label: 'DATE RANGE',
      options: RANGE_KEYS.map((key) => ({
        id: key,
        label: RANGE_LABELS[key],
        selected: query.range === key,
        onSelect: () => replace({ ...query, range: key }),
      })),
    },
    ...LIST_FILTERS.filter(({ source }) => options[source].length > 0).map(
      ({ key, label, source }) => ({
        id: key,
        label,
        options: options[source].map((value) => ({
          id: value,
          label: value,
          selected: query[key].includes(value),
          onSelect: () => replace(toggleFilterValue(query, key, value)),
        })),
      })
    ),
  ];

  return (
    <div className="flex flex-col items-start gap-[10px] self-stretch px-[16px] py-[20px] shadow-divider sm:px-[30px] lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center justify-center gap-[10px]">
        <Icon name="audio-lines" className="text-black" />
        <h2 className="text-[16px] font-normal leading-[1.3] text-black">{title}</h2>

        {/*
          The write entry points sit beside the panel title rather than among
          the chips: the chip row is the design's filtering surface, and mixing
          "narrow what you see" with "change what exists" in one row makes both
          harder to scan.
        */}
        {canWrite && onNewLog && onManage ? (
          <div className="flex items-center gap-[8px] pl-[6px]">
            <motion.button
              type="button"
              onClick={onNewLog}
              whileHover={{ y: -1, scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              transition={SPRING_SOFT}
              className="flex shrink-0 items-center gap-[6px] whitespace-nowrap rounded-[80px] bg-black px-[14px] py-[6px] text-[14px] font-normal leading-[1.3] text-white shadow-chip"
            >
              <Icon name="plus" />
              New Log
            </motion.button>

            <motion.button
              type="button"
              onClick={onManage}
              whileHover={{ y: -1, scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              transition={SPRING_SOFT}
              className="flex shrink-0 items-center gap-[6px] whitespace-nowrap rounded-[80px] bg-white px-[14px] py-[6px] text-[14px] font-normal leading-[1.3] text-[#4D4D4D] shadow-chip"
            >
              <Icon name="cog" />
              Manage
            </motion.button>
          </div>
        ) : null}
      </div>

      <LayoutGroup>
        <motion.div
          layout
          transition={SPRING_SOFT}
          className="flex flex-wrap items-center gap-[10px]"
        >
          <AnimatePresence mode="popLayout" initial={false}>
            {query.sort !== 'none' ? (
              <ToolbarChip key="sort-chip">
                <FilterChipButton
                  chip={{ id: 'sort', label: SORT_LABELS[query.sort], icon: 'x', selected: true }}
                  onClick={() => replace({ ...query, sort: 'none' })}
                />
              </ToolbarChip>
            ) : null}

            <motion.div key="sort-menu" layout transition={SPRING_SOFT}>
              <ChipMenu
                chip={{ id: 'sort-menu', label: 'Sort', icon: 'list-filter', selected: false }}
                sections={sortSections}
                closeOnSelect
              />
            </motion.div>

            {query.range === 'month' ? (
              <ToolbarChip key="range-chip">
                {/*
                  The count is the live result of the current query, so it rolls
                  to its new value as filters change rather than cutting. The
                  chip has `layout`, so the row absorbs the width change too.
                */}
                <FilterChipButton
                  chip={{ id: 'range', label: RANGE_LABELS.month, icon: 'x', selected: true }}
                  trailing={
                    <span className="tabular-nums">
                      (<AnimatedNumber value={count} />)
                    </span>
                  }
                  onClick={() => replace({ ...query, range: 'all' })}
                />
              </ToolbarChip>
            ) : null}

            <motion.div key="filter-menu" layout transition={SPRING_SOFT}>
              <ChipMenu
                chip={{ id: 'filter-menu', label: 'Filter', icon: 'funnel', selected: false }}
                sections={filterSections}
              />
            </motion.div>

            {activeListFilters(query).map(({ key, value }) => (
              <ToolbarChip key={`${key}:${value}`}>
                <FilterChipButton
                  chip={{ id: `${key}:${value}`, label: value, icon: 'x', selected: true }}
                  onClick={() => replace(toggleFilterValue(query, key, value))}
                />
              </ToolbarChip>
            ))}

            {hasNonDefaultFilters(query) ? (
              <ToolbarChip key="reset">
                {/*
                  `open` is carried through rather than cleared: Reset clears the
                  filtering, and a row someone is reading is not a filter.
                */}
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  transition={SPRING_SOFT}
                  onClick={() => replace({ ...EMPTY_LOG_QUERY, q: query.q, open: query.open })}
                  className="px-[6px] text-[14px] font-normal leading-[1.3] text-[#4D4D4D] opacity-50 hover:opacity-100"
                >
                  Reset
                </motion.button>
              </ToolbarChip>
            ) : null}
          </AnimatePresence>

          {trailing}
        </motion.div>
      </LayoutGroup>
    </div>
  );
}

interface ToolbarChipProps {
  readonly children: ReactNode;
}

/**
 * One chip's entrance, exit and reflow.
 *
 * Two elements rather than one so that the element Framer measures for the
 * layout animation is never the element being scaled — see the note on the
 * toolbar above.
 *
 * Ref-forwarding is not optional here: `AnimatePresence` in `popLayout` mode
 * wraps each child so it can pull an exiting chip out of the flow, and to do
 * that it has to hold the child's DOM node. A plain function component in this
 * position swallows the ref and React says so.
 */
const ToolbarChip = forwardRef<HTMLDivElement, ToolbarChipProps>(function ToolbarChip(
  { children },
  ref
) {
  return (
    <motion.div
      ref={ref}
      layout
      variants={chipVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      transition={SPRING_SOFT}
    >
      <motion.div variants={chipPopVariants}>{children}</motion.div>
    </motion.div>
  );
});

const activeListFilters = (query: LogQuery): ReadonlyArray<{ key: ListFilterKey; value: string }> =>
  LIST_FILTER_KEYS.flatMap((key) => query[key].map((value) => ({ key, value })));

/**
 * Whether anything is currently filtering the list.
 *
 * Measured against "no filtering at all", not against the design's defaults —
 * the defaults are themselves two applied chips, so comparing to them would
 * hide Reset on exactly the resting view that has a sort and a date range to
 * clear.
 */
const hasNonDefaultFilters = (query: LogQuery): boolean =>
  query.sort !== EMPTY_LOG_QUERY.sort ||
  query.range !== EMPTY_LOG_QUERY.range ||
  activeListFilters(query).length > 0;
