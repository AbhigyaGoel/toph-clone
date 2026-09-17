'use client';

import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';

import { setLogsStatus } from '@/app/actions/logs';
import { LogBrief } from '@/components/logs/LogBrief';
import { EmptyState } from '@/components/shell/EmptyState';
import { Screen } from '@/components/shell/Screen';
import { Icon } from '@/components/ui/Icon';
import { PageEntrance } from '@/components/ui/PageEntrance';
import { useToast } from '@/components/ui/ToastProvider';
import { attempt } from '@/lib/attempt';
import { formatLogDate } from '@/lib/format';
import { EASE_QUICK, SPRING_SOFT } from '@/lib/motion';
import type { InboxItem, LogDetail, Product, ReferenceData } from '@/lib/types';

interface InboxScreenProps {
  readonly items: readonly InboxItem[];
  readonly details: readonly LogDetail[];
  readonly products: readonly Product[];
  readonly reference: ReferenceData;
  readonly canReview: boolean;
  readonly canWrite: boolean;
  readonly canRetract: boolean;
}

type Filter = 'all' | 'safety' | 'compliance' | 'anomaly' | 'unread';

const LOOK: Record<
  InboxItem['severity'],
  {
    readonly tint: string;
    readonly ground: string;
    readonly icon: 'x' | 'clipboard-pen' | 'audio-lines' | 'inbox' | 'chart-line';
    readonly label: string;
  }
> = {
  safety: { tint: '#B00020', ground: 'rgba(176,0,32,0.08)', icon: 'x', label: 'Safety' },
  compliance: {
    tint: '#7A5B00',
    ground: 'rgba(122,91,0,0.1)',
    icon: 'clipboard-pen',
    label: 'Compliance',
  },
  /*
    Violet, and a trend line rather than a warning mark.
    
    Every other severity here says something is missing or unreadable, and both
    are drawn in the amber/red language of a fault. An anomaly is not a fault:
    the number is present, legible and typed by a person, and it may well be
    correct. Dressing it as an error would teach the manager to dismiss it at a
    glance — and the one time it is a real over-application is the time that
    habit costs them. So it gets a colour used nowhere else on the screen and an
    icon that means "compared to a trend".
  */
  anomaly: { tint: '#5B3FA8', ground: 'rgba(91,63,168,0.1)', icon: 'chart-line', label: 'Unusual' },
  quality: { tint: '#4D4D4D', ground: 'rgba(0,0,0,0.05)', icon: 'audio-lines', label: 'Audio' },
  review: { tint: '#4D4D4D', ground: 'rgba(0,0,0,0.05)', icon: 'inbox', label: 'Unread' },
};

const FILTERS: ReadonlyArray<{ readonly key: Filter; readonly label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'safety', label: 'Safety' },
  { key: 'compliance', label: 'Compliance' },
  { key: 'anomaly', label: 'Unusual' },
  { key: 'unread', label: 'Unread' },
];

/**
 * The worklist. Items arrive on their own, and this is where they are cleared.
 *
 * The split with the dashboard is the thing worth defending. The dashboard shows
 * the farm's *state* — what was recorded, by whom, where, how much. This shows
 * the farm's *exceptions*, and it opens them in place so the work happens on one
 * screen. The two used to overlap: a five-row queue on the dashboard listing the
 * same items this does, whose rows navigated here-ish — actually to the
 * dashboard's own table, scrolled a thousand pixels down to find the row. That
 * was two screens doing one job badly. The dashboard now carries a single line
 * pointing at this one, and this one does the job.
 *
 * Opening is in the URL (`?open=`), so a manager can send somebody the exact
 * item rather than the screen it is on.
 *
 * Clearing is optimistic: a manager going down a list should not wait for a
 * round trip between items. A failure restores the row and says why.
 */
export function InboxScreen({
  items,
  details,
  products,
  reference,
  canReview,
  canWrite,
  canRetract,
}: InboxScreenProps) {
  const [filter, setFilter] = useState<Filter>('all');
  /** Ids cleared in this pass, so the row leaves before the server answers. */
  const [cleared, setCleared] = useState<readonly string[]>([]);
  const [, startClear] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const toast = useToast();

  const open = params.getAll('open');
  const detailFor = useMemo(
    () => new Map(details.map((detail) => [detail.logId, detail])),
    [details]
  );

  const live = useMemo(() => items.filter((item) => !cleared.includes(item.id)), [items, cleared]);

  const counts = useMemo(
    () => ({
      all: live.length,
      safety: live.filter((item) => item.severity === 'safety').length,
      compliance: live.filter((item) => item.severity === 'compliance').length,
      anomaly: live.filter((item) => item.severity === 'anomaly').length,
      unread: live.filter((item) => item.actionable).length,
    }),
    [live]
  );

  const shown = useMemo(
    () =>
      live.filter((item) =>
        filter === 'all' ? true : filter === 'unread' ? item.actionable : item.severity === filter
      ),
    [live, filter]
  );

  const toggle = (item: InboxItem) => {
    const next = new URLSearchParams(params.toString());
    const already = open.includes(item.id);
    next.delete('open');
    for (const id of open) if (id !== item.id) next.append('open', id);
    if (!already) next.append('open', item.id);
    router.replace(`${pathname}${next.size > 0 ? `?${next}` : ''}`, { scroll: false });
  };

  const clear = (item: InboxItem) => {
    setCleared((current) => [...current, item.id]);

    startClear(async () => {
      const result = await attempt(() => setLogsStatus([item.id], 'reviewed'));
      if (!result.success) {
        setCleared((current) => current.filter((id) => id !== item.id));
        toast.show({ tone: 'error', message: result.error });
        return;
      }
      router.refresh();
    });
  };

  const clearAll = () => {
    const targets = live.filter((item) => item.actionable);
    if (targets.length === 0) return;

    setCleared((current) => [...current, ...targets.map((item) => item.id)]);

    startClear(async () => {
      const result = await attempt(() =>
        setLogsStatus(
          targets.map((item) => item.id),
          'reviewed'
        )
      );
      if (!result.success) {
        setCleared((current) => current.filter((id) => !targets.some((item) => item.id === id)));
        toast.show({ tone: 'error', message: result.error });
        return;
      }
      toast.show({
        tone: 'info',
        message: `${targets.length} ${targets.length === 1 ? 'log' : 'logs'} marked reviewed.`,
      });
      router.refresh();
    });
  };

  return (
    <Screen
      title="Inbox"
      subtitle="Everything waiting on you — safety first, then compliance, then what is simply unread."
      actions={
        canReview && counts.unread > 0 ? (
          <motion.button
            type="button"
            onClick={clearAll}
            whileHover={{ y: -1, scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            transition={SPRING_SOFT}
            className="flex shrink-0 items-center gap-[6px] whitespace-nowrap rounded-[80px] bg-black px-[14px] py-[8px] text-[14px] font-normal leading-[1.3] text-white shadow-chip"
          >
            <Icon name="check" size={12} />
            Mark {counts.unread} read
          </motion.button>
        ) : null
      }
    >
      <PageEntrance index={1}>
        <div className="flex w-full flex-wrap items-center gap-[10px] self-stretch">
          <LayoutGroup id="inbox-filter">
            <div className="flex items-center gap-[4px] rounded-[80px] bg-white p-[4px] shadow-chip">
              {FILTERS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  aria-pressed={filter === key}
                  className="relative rounded-[80px] px-[14px] py-[6px] text-[14px] font-normal leading-[1.3] outline-none focus-visible:ring-2 focus-visible:ring-black/30"
                >
                  {filter === key ? (
                    <motion.span
                      layoutId="inbox-filter-pill"
                      transition={SPRING_SOFT}
                      className="absolute inset-0 rounded-[80px] bg-black"
                    />
                  ) : null}
                  <span className={`relative ${filter === key ? 'text-white' : 'text-[#4D4D4D]'}`}>
                    {label}
                    <span className="pl-[6px] tabular-nums opacity-60">{counts[key]}</span>
                  </span>
                </button>
              ))}
            </div>
          </LayoutGroup>
        </div>
      </PageEntrance>

      <PageEntrance index={2}>
        <section className="flex w-full flex-col items-center self-stretch overflow-hidden rounded-[20px] bg-white shadow-panel">
          {shown.length === 0 ? (
            <EmptyState
              icon="inbox"
              title={live.length === 0 ? 'Inbox zero' : 'Nothing under this filter'}
              body={
                live.length === 0
                  ? 'No restricted fields, no compliance gaps, and every log has been read. This is what a clean morning looks like.'
                  : 'Switch back to All to see the rest of what is waiting.'
              }
            />
          ) : (
            <ul className="flex w-full flex-col self-stretch">
              <AnimatePresence initial={false}>
                {shown.map((item, index) => (
                  <Row
                    key={`${item.kind}:${item.id}`}
                    item={item}
                    last={index === shown.length - 1}
                    expanded={open.includes(item.id)}
                    detail={detailFor.get(item.id) ?? null}
                    products={products}
                    reference={reference}
                    canReview={canReview}
                    canWrite={canWrite}
                    canRetract={canRetract}
                    onToggle={() => toggle(item)}
                    onClear={() => clear(item)}
                  />
                ))}
              </AnimatePresence>
            </ul>
          )}
        </section>
      </PageEntrance>
    </Screen>
  );
}

interface RowProps {
  readonly item: InboxItem;
  readonly last: boolean;
  readonly expanded: boolean;
  readonly detail: LogDetail | null;
  readonly products: readonly Product[];
  readonly reference: ReferenceData;
  readonly canReview: boolean;
  readonly canWrite: boolean;
  readonly canRetract: boolean;
  readonly onToggle: () => void;
  readonly onClear: () => void;
}

function Row({
  item,
  last,
  expanded,
  detail,
  products,
  reference,
  canReview,
  canWrite,
  canRetract,
  onToggle,
  onClear,
}: RowProps) {
  const look = LOOK[item.severity];

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={EASE_QUICK}
      className={last && !expanded ? '' : 'shadow-divider'}
    >
      <div className="flex items-center gap-[12px] px-[16px] sm:px-[30px]">
        <motion.button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          whileHover={{ backgroundColor: 'rgba(0,0,0,0.02)' }}
          transition={SPRING_SOFT}
          className="-mx-[8px] flex min-w-0 flex-1 items-center gap-[12px] rounded-[10px] px-[8px] py-[12px] text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black/30"
        >
          <span
            className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: look.ground, color: look.tint }}
          >
            <Icon name={look.icon} size={12} />
          </span>

          <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
            <span className="flex items-center gap-[7px]">
              {item.actionable ? (
                <span aria-hidden className="h-[6px] w-[6px] shrink-0 rounded-full bg-[#0065F0]" />
              ) : null}
              <span
                className={`truncate text-[14px] leading-[1.3] text-black ${
                  item.actionable ? 'font-medium' : 'font-normal'
                }`}
              >
                {item.title}
              </span>
            </span>
            <span className="truncate text-[12px] font-normal leading-[1.4] text-[#4D4D4D]">
              {item.reason}
            </span>
          </span>

          <span
            className="hidden shrink-0 rounded-[80px] px-[9px] py-[2px] text-[11px] font-normal leading-[1.4] sm:inline"
            style={{ backgroundColor: look.ground, color: look.tint }}
          >
            {look.label}
          </span>

          <span className="hidden w-[92px] shrink-0 text-right text-[12px] font-normal leading-[1.4] text-[#B3B3B3] md:inline">
            {stamp(item.at)}
          </span>

          {/*
            A chevron that turns, not an "expand" glyph that looks like a link
            to somewhere else. The row opens here — the icon should say so, and
            it is inside the same button so it is never a target of its own that
            appears to do nothing.
          */}
          <motion.span
            aria-hidden
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={SPRING_SOFT}
            className="flex shrink-0 text-[#B3B3B3]"
          >
            <Icon name="chevron-down" size={12} />
          </motion.span>
        </motion.button>

        {canReview && item.actionable ? (
          <button
            type="button"
            onClick={onClear}
            aria-label={`Mark "${item.title}" reviewed`}
            className="flex shrink-0 items-center gap-[5px] whitespace-nowrap rounded-[80px] px-[10px] py-[6px] text-[13px] font-normal leading-[1.3] text-[#4D4D4D] outline-none transition-colors hover:bg-black/[0.05] focus-visible:ring-2 focus-visible:ring-black/30"
          >
            <Icon name="check" size={11} />
            <span className="hidden lg:inline">Mark read</span>
          </button>
        ) : null}
      </div>

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={EASE_QUICK}
            className="overflow-hidden"
          >
            {item.kind === 'field' ? (
              <RestrictionDetail item={item} />
            ) : detail ? (
              <>
                {item.anomaly ? <AnomalyDetail item={item} /> : null}
              <LogBrief
                detail={detail}
                employeeLabel={item.from}
                fieldLabel={item.title.split(' on ').pop() ?? ''}
                products={products}
                reference={reference}
                recordContext={item.title}
                canWrite={canWrite}
                canRetract={canRetract}
              />
              </>
            ) : (
              <div className="border-t border-black/[0.06] bg-black/[0.015] px-[16px] py-[20px] sm:px-[30px]">
                <span className="text-[13px] font-normal leading-[1.4] text-[#B3B3B3]">
                  Opening…
                </span>
              </div>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.li>
  );
}

/**
 * The comparison the flag is making, spelled out.
 *
 * A manager cannot act on "unusual" — they can act on "you have applied this
 * five times at 0.5 and this one says 2.0". The claim and its evidence belong
 * in the same place, because the most likely outcome is that the manager knows
 * why and dismisses it, and they should be able to do that in one read.
 */
function AnomalyDetail({ item }: { readonly item: InboxItem }) {
  const anomaly = item.anomaly;
  if (!anomaly) return null;

  const unit = anomaly.rateUnit ? ` ${anomaly.rateUnit}` : '';

  return (
    <div className="flex flex-col gap-[10px] border-t border-black/[0.06] bg-[rgba(91,63,168,0.04)] px-[16px] py-[16px] sm:px-[30px]">
      <div className="flex flex-wrap items-end gap-x-[36px] gap-y-[10px]">
        <span className="flex flex-col gap-[3px]">
          <span className="text-[10px] font-medium uppercase tracking-[0.04em] text-[#B3B3B3]">
            Filed on this log
          </span>
          <span className="text-[20px] font-medium leading-[1.2] tabular-nums text-[#5B3FA8]">
            {anomaly.rate}
            {unit}
          </span>
        </span>

        <span className="flex flex-col gap-[3px]">
          <span className="text-[10px] font-medium uppercase tracking-[0.04em] text-[#B3B3B3]">
            Their average over {anomaly.sampleSize} earlier passes
          </span>
          <span className="text-[20px] font-medium leading-[1.2] tabular-nums text-black">
            {anomaly.average}
            {unit}
          </span>
        </span>

        <span className="flex flex-col gap-[3px]">
          <span className="text-[10px] font-medium uppercase tracking-[0.04em] text-[#B3B3B3]">
            Difference
          </span>
          <span className="text-[20px] font-medium leading-[1.2] tabular-nums text-[#5B3FA8]">
            {anomaly.multiple}x
          </span>
        </span>
      </div>

      <p className="max-w-[720px] text-[13px] font-normal leading-[1.5] text-[#4D4D4D]">
        This is not a transcription problem and not a missing record — the figure is filed and
        legible. It is flagged because it sits outside what this applicator normally puts on with
        this product, which is either a label over-application or a digit that went in wrong. Both
        are worth thirty seconds now rather than at a residue test.
      </p>
    </div>
  );
}

/**
 * A restriction has no log to open — it is a fact about a place and a clock.
 *
 * So it expands to its own particulars rather than sending the reader to the
 * map and making them work out which block turned red. The map link is still
 * offered, but as a choice rather than as what the row does.
 */
function RestrictionDetail({ item }: { readonly item: InboxItem }) {
  const clearsAt = item.restriction?.clearsAt ?? item.at;
  const hoursLeft = Math.max(0, (new Date(clearsAt).getTime() - Date.now()) / 3_600_000);

  return (
    <div className="flex flex-col gap-[12px] border-t border-black/[0.06] bg-black/[0.015] px-[16px] py-[18px] sm:px-[30px]">
      <div className="flex flex-wrap gap-x-[40px] gap-y-[10px]">
        <Fact label="Applied" value={item.restriction?.productName ?? 'a product'} />
        <Fact label="Clears at" value={formatLogDate(clearsAt)} />
        <Fact
          label="Time left"
          value={hoursLeft < 1 ? 'Under an hour' : `${Math.round(hoursLeft)} hours`}
        />
      </div>

      <p className="max-w-[720px] text-[13px] font-normal leading-[1.5] text-[#4D4D4D]">
        Nobody should enter this block without protective equipment until the interval has run.
        It clears on its own — there is nothing to mark done here, which is why this item has no
        Mark read.
      </p>

      <Link
        href={`/map?field=${item.id}`}
        className="flex items-center gap-[6px] self-start rounded-[80px] px-[10px] py-[6px] text-[13px] font-normal leading-[1.3] text-[#4D4D4D] outline-none transition-colors hover:bg-black/[0.05] focus-visible:ring-2 focus-visible:ring-black/30"
      >
        <Icon name="map" size={11} />
        Show the block on the map
      </Link>
    </div>
  );
}

function Fact({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <span className="flex flex-col gap-[3px]">
      <span className="text-[10px] font-medium uppercase tracking-[0.04em] text-[#B3B3B3]">
        {label}
      </span>
      <span className="text-[13px] font-normal leading-[1.3] text-black">{value}</span>
    </span>
  );
}

/** "Sep 14" or "6:00 PM" — today gets a clock, everything else gets a date. */
function stamp(iso: string): string {
  const when = new Date(iso);
  const today = new Date();
  const sameDay =
    when.getUTCFullYear() === today.getUTCFullYear() &&
    when.getUTCMonth() === today.getUTCMonth() &&
    when.getUTCDate() === today.getUTCDate();

  return when.toLocaleString('en-US', {
    timeZone: 'UTC',
    ...(sameDay ? { hour: 'numeric', minute: '2-digit' } : { month: 'short', day: 'numeric' }),
  });
}
