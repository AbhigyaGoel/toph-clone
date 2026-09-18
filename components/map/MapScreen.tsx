'use client';

import Link from 'next/link';
import type { FieldWorker } from '@/lib/repositories/fields';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';

import {
  FarmMap,
  MapLegend,
  STATE_FILL,
  STATE_STROKE,
  type FieldState,
} from '@/components/map/FarmMap';
import { Panel } from '@/components/shell/Panel';
import { Icon } from '@/components/ui/Icon';
import { PageEntrance } from '@/components/ui/PageEntrance';
import { formatRate, governingRestriction, untilClear } from '@/lib/compliance';
import { formatLogDate, formatTimeRange } from '@/lib/format';
import type { ActivityLog, ApplicationRecord, FieldOverview } from '@/lib/types';

interface MapScreenProps {
  readonly fields: readonly FieldOverview[];
  readonly records: readonly ApplicationRecord[];
  readonly logs: readonly ActivityLog[];
  readonly selectedId: string | null;
  /** Who is out right now, and where everyone else last was. */
  readonly workers: readonly FieldWorker[];
}

/** A field counts as active if it was worked inside this window. */
const RECENT_DAYS = 30;

/**
 * The farm, and what is happening on each part of it.
 *
 * The dashboard's map answers "where was this one log"; this one answers "what
 * is the state of my ground". The two questions want opposite layouts — one
 * plot in detail versus every plot at once — but the same tile, the same
 * coordinate space and the same re-entry rules, so those are shared rather than
 * reimplemented.
 *
 * Selection is in the URL so a field is a link you can send to someone: "go
 * look at Field K" is the most common thing said about a map.
 */
export function MapScreen({ fields, records, logs, selectedId, workers }: MapScreenProps) {
  const router = useRouter();

  const restrictions = useMemo(() => byField(records), [records]);

  const states = useMemo<Record<string, FieldState>>(() => {
    const cutoff = Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000;
    const entries = fields.map((field): [string, FieldState] => {
      if (governingRestriction(restrictions.get(field.id) ?? [])) return [field.id, 'restricted'];
      const worked = field.lastWorkedAt ? new Date(field.lastWorkedAt).getTime() : 0;
      return [field.id, worked >= cutoff ? 'recent' : 'idle'];
    });

    return Object.fromEntries(entries);
  }, [fields, restrictions]);

  // The legend carries these, so there is no summary strip on this screen: a
  // card saying "9 idle fields" above a map that already shows nine pale
  // rectangles is the same fact twice, and the second one costs a band of
  // vertical space the map could have used.
  const counts = useMemo(() => {
    const tally: Record<FieldState, number> = { restricted: 0, recent: 0, idle: 0 };
    for (const state of Object.values(states)) tally[state] += 1;
    return tally;
  }, [states]);

  const selected = fields.find((field) => field.id === selectedId) ?? null;
  const selectedLogs = useMemo(
    () => (selected ? logs.filter((log) => log.field === selected.name).slice(0, 6) : []),
    [logs, selected]
  );
  const selectedRecords = selected ? (restrictions.get(selected.id) ?? []).slice(0, 4) : [];
  const restriction = selected ? governingRestriction(restrictions.get(selected.id) ?? []) : null;

  const select = (fieldId: string) =>
    router.replace(fieldId === selectedId ? '/map' : `/map?field=${fieldId}`, { scroll: false });

  return (
    <>
      <PageEntrance index={1}>
        <div className="flex w-full flex-col gap-[10px] self-stretch xl:flex-row">
          <div className="flex min-w-0 flex-1 flex-col">
            <Panel title="Farm map" icon="map">
              <div className="px-[16px] pb-[10px] pt-[16px] sm:px-[30px]">
                <FarmMap
                  fields={fields}
                  states={states}
                  workers={workers}
                  onSelectWorker={(logId) => router.push(`/activity-logs?range=all&sort=date-desc&open=${logId}`)}
                  selectedId={selectedId}
                  onSelect={select}
                />
              </div>
              <MapLegend
                  counts={counts}
                  crew={{
                    working: workers.filter((one) => one.working).length,
                    lastSeen: workers.filter((one) => !one.working).length,
                  }}
                />
            </Panel>
          </div>

          <div className="flex w-full flex-col xl:w-[400px] xl:shrink-0">
            <Panel
              title={selected ? selected.name : 'Select a field'}
              icon={selected ? 'book-check' : 'map'}
            >
              {!selected ? (
                /*
                  A list rather than an empty state. The map answers "where",
                  but "which block has had nothing done to it since June" is a
                  sorting question, and a picture is a poor way to sort. Both
                  select the same thing, so whichever you reach for works.
                */
                <div className="flex flex-col">
                  {fields.map((field) => (
                    <button
                      key={field.id}
                      type="button"
                      onClick={() => select(field.id)}
                      className="flex items-center justify-between gap-[10px] px-[30px] py-[12px] text-left shadow-divider outline-none transition-colors hover:bg-[#F8F8F8] focus-visible:ring-2 focus-visible:ring-black/30"
                    >
                      <span className="flex items-center gap-[10px]">
                        <span
                          className="h-[10px] w-[10px] shrink-0 rounded-[3px] border-2"
                          style={{
                            backgroundColor: STATE_FILL[states[field.id] ?? 'idle'],
                            borderColor: STATE_STROKE[states[field.id] ?? 'idle'],
                          }}
                        />
                        <span className="text-[14px] font-normal leading-[1.3] text-black">
                          {field.name}
                        </span>
                      </span>
                      <span className="flex items-baseline gap-[10px]">
                        <span className="text-[12px] font-normal leading-[1.3] text-[#4D4D4D]">
                          {field.logCount} {field.logCount === 1 ? 'log' : 'logs'}
                        </span>
                        <span className="w-[116px] shrink-0 whitespace-nowrap text-right text-[12px] font-normal leading-[1.3] text-[#B3B3B3]">
                          {field.lastWorkedAt ? formatLogDate(field.lastWorkedAt) : 'never worked'}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col">
                  {restriction ? (
                    <div className="flex flex-col gap-[4px] bg-[rgba(176,0,32,0.06)] px-[30px] py-[14px]">
                      <span className="flex items-center gap-[8px] text-[14px] font-medium leading-[1.3] text-[#B00020]">
                        <Icon name="x" size={13} />
                        Do not enter — clears in {untilClear(restriction)}
                      </span>
                      <span className="text-[13px] font-normal leading-[1.4] text-[#4D4D4D]">
                        {restriction.productName}, {restriction.reiHours}h restricted-entry
                        interval, applied {formatLogDate(restriction.startedAt)}.
                      </span>
                    </div>
                  ) : null}

                  <dl className="grid grid-cols-2 gap-x-[10px] gap-y-[12px] px-[30px] py-[16px] shadow-divider">
                    <Fact label="Logs recorded" value={String(selected.logCount)} />
                    <Fact
                      label="Awaiting review"
                      value={String(selected.unreviewedCount)}
                      tone={selected.unreviewedCount > 0 ? 'warning' : 'neutral'}
                    />
                    <Fact
                      label="Last worked"
                      value={selected.lastWorkedAt ? formatLogDate(selected.lastWorkedAt) : 'Never'}
                    />
                    <Fact label="Applications" value={String(selectedRecords.length)} />
                  </dl>

                  {selectedRecords.length > 0 ? (
                    <div className="flex flex-col gap-[8px] px-[30px] py-[16px] shadow-divider">
                      <span className="text-[10px] font-medium uppercase tracking-[0.04em] text-[#B3B3B3]">
                        Applied here
                      </span>
                      {selectedRecords.map((record) => (
                        <div key={record.id} className="flex items-baseline justify-between gap-[10px]">
                          <span className="text-[13px] font-normal leading-[1.4] text-black">
                            {record.productName}
                            <span className="pl-[6px] text-[#4D4D4D]">{formatRate(record)}</span>
                          </span>
                          <span className="shrink-0 text-[12px] font-normal leading-[1.3] text-[#B3B3B3]">
                            {formatLogDate(record.startedAt)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="flex flex-col gap-[8px] px-[30px] py-[16px]">
                    <span className="flex items-baseline justify-between gap-[10px]">
                      <span className="text-[10px] font-medium uppercase tracking-[0.04em] text-[#B3B3B3]">
                        Recent logs
                      </span>
                      {selected.logCount > selectedLogs.length ? (
                        <Link
                          href={`/activity-logs?range=all&sort=date-desc&field=${encodeURIComponent(selected.name)}`}
                          className="text-[12px] font-normal leading-[1.3] text-[#146C44] underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[#146C44]/40"
                        >
                          All {selected.logCount}
                        </Link>
                      ) : null}
                    </span>
                    {selectedLogs.length === 0 ? (
                      <span className="text-[13px] font-normal leading-[1.4] text-[#4D4D4D]">
                        Nothing has been logged on this block yet.
                      </span>
                    ) : (
                      selectedLogs.map((log) => (
                        <Link
                          key={log.id}
                          href={`/?range=all&sort=none&open=${log.id}`}
                          className="flex items-baseline justify-between gap-[10px] rounded-[8px] px-[6px] py-[4px] outline-none transition-colors hover:bg-black/[0.03] focus-visible:ring-2 focus-visible:ring-black/30"
                        >
                          <span className="text-[13px] font-normal leading-[1.4] text-black">
                            {log.activity}
                            <span className="pl-[6px] text-[#4D4D4D]">{log.employee}</span>
                          </span>
                          <span className="shrink-0 text-[12px] font-normal leading-[1.3] text-[#B3B3B3]">
                            {formatTimeRange(log.startedAt, log.endedAt)}
                          </span>
                        </Link>
                      ))
                    )}
                  </div>
                </div>
              )}
            </Panel>
          </div>
        </div>
      </PageEntrance>
    </>
  );
}

interface FactProps {
  readonly label: string;
  readonly value: string;
  readonly tone?: 'neutral' | 'warning';
}

function Fact({ label, value, tone = 'neutral' }: FactProps) {
  return (
    <div className="flex flex-col gap-[2px]">
      <dt className="text-[10px] font-medium uppercase tracking-[0.04em] text-[#B3B3B3]">
        {label}
      </dt>
      <dd
        className={`text-[14px] font-normal leading-[1.3] ${tone === 'warning' ? 'text-[#B00020]' : 'text-black'}`}
      >
        {value}
      </dd>
    </div>
  );
}

/** Groups records by the field they were applied to. */
function byField(
  records: readonly ApplicationRecord[]
): ReadonlyMap<string, readonly ApplicationRecord[]> {
  const index = new Map<string, ApplicationRecord[]>();

  for (const record of records) {
    const bucket = index.get(record.fieldId);
    if (bucket) bucket.push(record);
    else index.set(record.fieldId, [record]);
  }

  return index;
}
