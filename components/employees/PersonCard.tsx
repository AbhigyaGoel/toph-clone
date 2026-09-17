'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { forwardRef } from 'react';

import { Icon } from '@/components/ui/Icon';
import { formatLogDate } from '@/lib/format';
import { SPRING_SOFT } from '@/lib/motion';
import type { EmployeeOverview } from '@/lib/types';

interface PersonCardProps {
  readonly person: EmployeeOverview;
  readonly canWrite: boolean;
  readonly canDelete: boolean;
  readonly busy: boolean;
  readonly onRename: () => void;
  readonly onToggleActive: () => void;
  readonly onRemove: () => void;
}

/** Deterministic ink for a name, so a person keeps the same colour everywhere. */
const INKS = ['#146C44', '#0065F0', '#7A3E9D', '#B06A00', '#00707A', '#A1375B'] as const;

function inkFor(name: string): string {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) % 100_000;
  }
  return INKS[hash % INKS.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '')).toUpperCase();
}

/**
 * One member of the crew.
 *
 * A card rather than a table row, because this screen is about people and a
 * table is about values — eleven names in a grid read as a team, and the same
 * eleven in a striped table read as inventory. It also means the things you
 * actually do to a person (rename, deactivate) can sit on the person rather
 * than in a cramped final column.
 *
 * The monogram's colour is derived from the name, so it is stable across
 * sessions and across screens without storing an avatar nobody has uploaded.
 */
export const PersonCard = forwardRef<HTMLElement, PersonCardProps>(function PersonCard(
  { person, canWrite, canDelete, busy, onRename, onToggleActive, onRemove },
  ref
) {
  const ink = inkFor(person.name);
  const quality = person.meanConfidence;

  return (
    <motion.article
      ref={ref}
      layout
      whileHover={{ y: -2 }}
      transition={SPRING_SOFT}
      className={`flex flex-col gap-[16px] rounded-[16px] bg-white p-[20px] shadow-card ${
        person.isActive ? '' : 'opacity-70'
      }`}
    >
      <div className="flex items-start gap-[12px]">
        <span
          aria-hidden
          className="flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-full text-[14px] font-medium leading-none text-white"
          style={{ backgroundColor: ink }}
        >
          {initials(person.name)}
        </span>

        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[15px] font-medium leading-[1.3] text-black">
            {person.name}
          </span>
          <span className="flex items-center gap-[6px] text-[12px] font-normal leading-[1.4] text-[#4D4D4D]">
            {person.isActive ? 'Active' : 'Inactive'}
            {person.unreviewedCount > 0 ? (
              <>
                <span className="h-[4px] w-[4px] rounded-full bg-[rgba(1,156,37,0.5)]" />
                {person.unreviewedCount} to review
              </>
            ) : null}
          </span>
        </div>
      </div>

      <div className="flex items-end gap-[20px]">
        <Stat value={person.logCount} label="logs" />
        <Stat value={`${person.hours}h`} label="logged" />
        <Stat value={person.fieldCount} label="fields" />
      </div>

      {/*
        Transcription quality earns a place on the card because it is the one
        number here that says something about the *tool* rather than the person
        — a low bar is a phone or a cab to fix, not a performance problem.
      */}
      <div className="flex flex-col gap-[5px]">
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] font-medium uppercase tracking-[0.04em] text-[#B3B3B3]">
            Transcription
          </span>
          <span
            className={`text-[12px] font-normal leading-[1.3] tabular-nums ${
              quality !== null && quality < 0.8 ? 'text-[#B00020]' : 'text-[#4D4D4D]'
            }`}
          >
            {quality === null ? 'no recordings' : `${Math.round(quality * 100)}%`}
          </span>
        </div>
        <span className="h-[6px] w-full overflow-hidden rounded-[80px] bg-black/[0.05]">
          {quality !== null ? (
            <motion.span
              initial={{ scaleX: 0 }}
              animate={{ scaleX: quality }}
              transition={SPRING_SOFT}
              style={{ transformOrigin: 'left' }}
              className={`block h-full w-full rounded-[80px] ${
                quality < 0.8 ? 'bg-[#B00020]' : 'bg-[#146C44]'
              }`}
            />
          ) : null}
        </span>
      </div>

      <div className="flex items-center justify-between gap-[8px] border-t border-black/[0.06] pt-[12px]">
        <span className="text-[12px] font-normal leading-[1.3] text-[#B3B3B3]">
          {person.lastLoggedAt ? formatLogDate(person.lastLoggedAt) : 'never logged'}
        </span>

        <span className="flex items-center gap-[2px]">
          {person.logCount > 0 ? (
            <Link
              href={`/activity-logs?range=all&sort=date-desc&employee=${encodeURIComponent(person.name)}`}
              aria-label={`${person.name}'s logs`}
              className="flex h-[26px] w-[26px] items-center justify-center rounded-full text-[#4D4D4D] outline-none transition-colors hover:bg-black/[0.05] focus-visible:ring-2 focus-visible:ring-black/30"
            >
              <Icon name="audio-lines" size={13} />
            </Link>
          ) : null}

          {canWrite ? (
            <>
              <button
                type="button"
                onClick={onRename}
                disabled={busy}
                aria-label={`Rename ${person.name}`}
                className="flex h-[26px] w-[26px] items-center justify-center rounded-full text-[#4D4D4D] outline-none transition-colors hover:bg-black/[0.05] focus-visible:ring-2 focus-visible:ring-black/30 disabled:opacity-40"
              >
                <Icon name="clipboard-pen" size={13} />
              </button>
              <button
                type="button"
                onClick={onToggleActive}
                disabled={busy}
                className="rounded-[80px] px-[10px] py-[4px] text-[12px] font-normal leading-[1.3] text-[#4D4D4D] outline-none transition-colors hover:bg-black/[0.05] focus-visible:ring-2 focus-visible:ring-black/30 disabled:opacity-40"
              >
                {person.isActive ? 'Deactivate' : 'Reactivate'}
              </button>
              {canDelete && person.logCount === 0 ? (
                <button
                  type="button"
                  onClick={onRemove}
                  disabled={busy}
                  aria-label={`Remove ${person.name}`}
                  className="flex h-[26px] w-[26px] items-center justify-center rounded-full text-[#B00020] outline-none transition-colors hover:bg-[rgba(176,0,32,0.08)] focus-visible:ring-2 focus-visible:ring-[#B00020]/40 disabled:opacity-40"
                >
                  <Icon name="trash" size={13} />
                </button>
              ) : null}
            </>
          ) : null}
        </span>
      </div>
    </motion.article>
  );
});

interface StatProps {
  readonly value: string | number;
  readonly label: string;
}

function Stat({ value, label }: StatProps) {
  return (
    <span className="flex flex-col">
      <span className="text-[20px] font-medium leading-[1.2] tabular-nums text-black">{value}</span>
      <span className="text-[11px] font-normal leading-[1.3] text-[#B3B3B3]">{label}</span>
    </span>
  );
}
