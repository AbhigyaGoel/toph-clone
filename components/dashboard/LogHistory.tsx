'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';

import { Icon } from '@/components/ui/Icon';
import { EASE_QUICK, SPRING_SOFT } from '@/lib/motion';
import type { AuditAction, AuditEvent, ChangeValue } from '@/lib/types';

interface LogHistoryProps {
  readonly events: readonly AuditEvent[];
}

/** How many entries show before the list asks to be expanded. */
const COLLAPSED = 3;

const ACTION_TINT: Record<AuditAction, string> = {
  create: '#146C44',
  update: '#7A5B00',
  delete: '#B00020',
  restore: '#146C44',
};

const ACTION_ICON: Record<AuditAction, 'plus' | 'clipboard-pen' | 'trash' | 'check'> = {
  create: 'plus',
  update: 'clipboard-pen',
  delete: 'trash',
  restore: 'check',
};

/**
 * What has happened to this log, and who did it.
 *
 * This is the half of a compliance record the product did not have. An
 * inspector asking "was this rate always 2.0?" could previously only be told
 * what the row says now — which is exactly the question a paper logbook, with
 * its crossings-out, answers better than a database does. Each entry names the
 * person, the field, and both values.
 *
 * Collapsed to three by default. The common case is a log with one entry and a
 * reviewer who wants the recording, not the ledger; the ledger matters
 * enormously on the rare log where something was changed, and that log is the
 * one with enough entries to be worth expanding.
 */
export function LogHistory({ events }: LogHistoryProps) {
  const [expanded, setExpanded] = useState(false);

  if (events.length === 0) {
    return (
      <div className="flex w-full flex-col gap-[8px]">
        <Heading count={0} />
        <p className="text-[12px] font-normal leading-[1.4] text-[#4D4D4D]">
          Nothing has been changed since this log was filed.
        </p>
      </div>
    );
  }

  const shown = expanded ? events : events.slice(0, COLLAPSED);
  const hidden = events.length - shown.length;

  return (
    <div className="flex w-full flex-col gap-[8px]">
      <Heading count={events.length} />

      <ol className="flex flex-col">
        <AnimatePresence initial={false}>
          {shown.map((event, index) => (
            <motion.li
              key={event.id}
              layout
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={SPRING_SOFT}
              className="relative flex gap-[10px] pb-[10px] pl-[2px]"
            >
              {/*
                The rail is drawn per entry rather than as one absolutely
                positioned line, so it cannot fall out of step with the list
                when an entry animates in.
              */}
              {index < shown.length - 1 ? (
                <span
                  aria-hidden
                  className="absolute bottom-0 left-[10px] top-[20px] w-[1px] bg-black/[0.08]"
                />
              ) : null}

              <span
                className="mt-[1px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: `${ACTION_TINT[event.action]}1A`, color: ACTION_TINT[event.action] }}
              >
                <Icon name={ACTION_ICON[event.action]} size={9} />
              </span>

              <span className="flex min-w-0 flex-col gap-[2px]">
                <span className="text-[13px] font-normal leading-[1.35] text-black">
                  {event.summary}
                </span>
                <span className="text-[11px] font-normal leading-[1.3] text-[#B3B3B3]">
                  {event.actorLabel} · <Ago iso={event.createdAt} />
                </span>

                {Object.entries(event.changes).length > 0 ? (
                  <span className="mt-[3px] flex flex-wrap gap-x-[10px] gap-y-[2px]">
                    {Object.entries(event.changes).map(([field, change]) => (
                      <span
                        key={field}
                        className="text-[11px] font-normal leading-[1.4] text-[#4D4D4D]"
                      >
                        {field}{' '}
                        <span className="text-[#B3B3B3] line-through">{show(change.from)}</span>{' '}
                        <span aria-hidden>→</span> <span className="text-black">{show(change.to)}</span>
                      </span>
                    ))}
                  </span>
                ) : null}
              </span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>

      {events.length > COLLAPSED ? (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="self-start rounded-[80px] px-[8px] py-[2px] text-[12px] font-normal leading-[1.3] text-[#4D4D4D] outline-none transition-colors hover:bg-black/[0.04] focus-visible:ring-2 focus-visible:ring-black/30"
        >
          {expanded ? 'Show less' : `Show ${hidden} earlier ${hidden === 1 ? 'change' : 'changes'}`}
        </button>
      ) : null}
    </div>
  );
}

function Heading({ count }: { readonly count: number }) {
  return (
    <div className="flex items-baseline justify-between gap-[10px]">
      <span className="text-[10px] font-medium uppercase tracking-[0.04em] text-[#B3B3B3]">
        History
      </span>
      {count > 0 ? (
        <motion.span
          initial={false}
          animate={{ opacity: 1 }}
          transition={EASE_QUICK}
          className="text-[11px] font-normal leading-[1.3] text-[#B3B3B3]"
        >
          {count} {count === 1 ? 'entry' : 'entries'}
        </motion.span>
      ) : null}
    </div>
  );
}

/**
 * A value as it should read in a ledger.
 *
 * An absent value is "—" rather than "null": the entry is read by a farm
 * manager, and the distinction the word `null` is carrying — the field had
 * nothing in it — is said better by a dash.
 */
function show(value: ChangeValue): string {
  if (value === null) return '—';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';

  const text = String(value);
  // Timestamps are the one machine format that turns up here often enough to
  // be worth recognising; everything else is already a number or a name.
  const asDate = /^\d{4}-\d{2}-\d{2}T/.test(text) ? new Date(text) : null;
  if (asDate && !Number.isNaN(asDate.getTime())) {
    return asDate.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'UTC',
    });
  }

  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

/**
 * A relative time that does not break hydration.
 *
 * "just now" and "1 min ago" are the same instant rendered a minute apart, and
 * the server renders this a measurable moment before the browser does — which
 * React reports as a text mismatch and then discards the server's markup for.
 * So the first client render deliberately reproduces the server's absolute
 * date, and the relative wording arrives in an effect, after hydration has
 * agreed with itself.
 */
function Ago({ iso }: { readonly iso: string }) {
  const [relative, setRelative] = useState<string | null>(null);

  useEffect(() => {
    setRelative(when(iso));
    // Re-read on a slow tick so an open panel does not sit on "just now" for an
    // hour. One minute is the smallest unit this renders, so nothing finer.
    const timer = setInterval(() => setRelative(when(iso)), 60_000);
    return () => clearInterval(timer);
  }, [iso]);

  return <>{relative ?? absolute(iso)}</>;
}

/** The stable form: identical on the server and on the first client render. */
function absolute(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  return at.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** "3 hours ago" while it is recent, an absolute date once it is not. */
function when(iso: string): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';

  const minutes = Math.round((Date.now() - then.getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;

  return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
