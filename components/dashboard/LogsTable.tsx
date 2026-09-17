'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type MouseEvent } from 'react';

import { deleteLogs, restoreLogs, setLogsStatus } from '@/app/actions/logs';
import { BulkActionBar } from '@/components/dashboard/BulkActionBar';
import { ExpandedLogDetail } from '@/components/dashboard/ExpandedLogDetail';
import { LogDetailSkeleton } from '@/components/dashboard/LogDetailSkeleton';
import { LogFormDialog } from '@/components/dashboard/LogFormDialog';
import { LogRow } from '@/components/dashboard/LogRow';
import { LogsTableHeader } from '@/components/dashboard/LogsTableHeader';
import { RowHighlight, useRowRegistry } from '@/components/dashboard/RowHighlight';
import {
  headerState,
  isSelected,
  prune,
  rangeBetween,
  selectRange,
  toggle,
  toggleAll,
  type Selection,
} from '@/components/dashboard/selection';
import { useLogQueryNavigation } from '@/components/dashboard/useLogQueryNavigation';
import { useToast } from '@/components/ui/ToastProvider';
import { attempt } from '@/lib/attempt';
import { formatLogDate } from '@/lib/format';
import {
  EMPTY_LOG_QUERY,
  narrowedMessageFor,
  narrowingReasons,
  toggleOpenLog,
} from '@/lib/logQuery';
import { EASE_QUICK, SPRING_PANEL } from '@/lib/motion';
import type {
  ActivityLog,
  LogDetail,
  LogInput,
  LogStatus,
  Product,
  ReferenceData,
} from '@/lib/types';

interface LogsTableProps {
  readonly logs: readonly ActivityLog[];
  /** Panels for the open rows; absent while one is still being fetched. */
  readonly details: readonly LogDetail[];
  /** The open logs in the edit form's shape, keyed by log id. */
  readonly editables: Readonly<Record<string, LogInput>>;
  /** Every tag the organisation has, offered by the expanded panel's picker. */
  readonly availableTags: readonly string[];
  /** False when this viewer cannot write; disables the bulk actions. */
  readonly canWrite: boolean;
  /** Why, when they cannot — shown in place of the bar's hint. */
  readonly writeBlockedReason: string | null;
  /** Reference collections the forms pick from. */
  readonly reference: ReferenceData;
  /** The product register, for filing a compliance record from a row. */
  readonly products: readonly Product[];
  /** Retracting a filed compliance record is admin-only. */
  readonly canRetract: boolean;
  /** True while the create dialog is requested from the toolbar. */
  /** Logs with a compliance gap or shaky audio, marked in the row. */
  readonly flaggedLogIds: readonly string[];
  readonly creating: boolean;
  readonly onCloseCreate: () => void;
}

/**
 * How long the wash waits before returning to rest.
 *
 * Long enough that crossing the gap between two rows, or passing over the action
 * button, does not read as leaving the table; short enough that it still feels
 * like a release rather than a stuck state.
 */
const HOVER_RELEASE_MS = 90;

/**
 * The table body: hover, selection, and the rows that open.
 *
 * Which rows are open is the URL's business, because it should survive a
 * refresh and travel in a link. Everything else here — what the pointer is
 * over, what is ticked, which dialog is up — is pointer and keyboard state that
 * should not, and is held in this component.
 */
export function LogsTable({
  logs,
  details,
  editables,
  availableTags,
  canWrite,
  writeBlockedReason,
  reference,
  products,
  canRetract,
  flaggedLogIds,
  creating,
  onCloseCreate,
}: LogsTableProps) {
  const { query, replace, isPending: queryPending } = useLogQueryNavigation();

  const toast = useToast();

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  /**
   * Statuses the user has changed but the server has not confirmed.
   *
   * Marking a row reviewed is the most repeated action on this screen, and it
   * costs a round trip plus a revalidation — long enough that ticking six rows
   * and pressing the button felt like nothing had happened. The change is
   * applied here immediately and reconciled when the rows come back; a failure
   * puts every one of them back and says why.
   */
  const [pendingStatus, setPendingStatus] = useState<ReadonlyMap<string, LogStatus>>(new Map());
  const [selection, setSelection] = useState<Selection>([]);
  const [busy, startWrite] = useTransition();
  /**
   * Undo gets its own transition, and that is not tidiness.
   *
   * Sharing `busy` with the delete meant the Undo button was disabled for as
   * long as the delete's own transition was settling — and that transition
   * includes the `revalidatePath` round trip the delete triggers, which is
   * comfortably longer than the moment somebody realises they have made a
   * mistake. The offer was on screen, looked live, and silently swallowed the
   * click.
   */
  const [, startUndo] = useTransition();
  const [editingLogId, setEditingLogId] = useState<string | null>(null);

  /** Anchor for shift-click range selection. */
  const lastToggled = useRef<string | null>(null);
  /** Pending return-to-rest, cancelled if the pointer lands on another row. */
  const release = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * The query as it stands *now*, for callbacks that resolve after an await.
   *
   * A delete takes a round trip, and the filters can change during it. Writing
   * the post-delete URL from the `query` captured when the click happened would
   * quietly undo whatever was changed in between.
   */
  const latestQuery = useRef(query);
  latestQuery.current = query;

  const flagged = useMemo(() => new Set(flaggedLogIds), [flaggedLogIds]);

  const visibleIds = useMemo(() => logs.map((log) => log.id), [logs]);
  const visibleKey = visibleIds.join(',');

  const detailById = useMemo(
    () => new Map(details.map((detail) => [detail.logId, detail])),
    [details]
  );

  // Why the table might be empty, worked out once rather than twice in the JSX.
  const reasons = useMemo(() => narrowingReasons(query), [query]);
  const narrowed = reasons.length > 0;
  const narrowedMessage = narrowedMessageFor(reasons);

  // The rows as the user believes them to be.
  const shown = useMemo(
    () =>
      pendingStatus.size === 0
        ? logs
        : logs.map((log) => {
            const optimistic = pendingStatus.get(log.id);
            return optimistic && optimistic !== log.status ? { ...log, status: optimistic } : log;
          }),
    [logs, pendingStatus]
  );

  // Once the server agrees, the override is noise — drop it rather than let it
  // shadow a later change made somewhere else.
  useEffect(() => {
    setPendingStatus((current) => {
      if (current.size === 0) return current;
      const next = new Map(current);
      for (const log of logs) {
        if (next.get(log.id) === log.status) next.delete(log.id);
      }
      return next.size === current.size ? current : next;
    });
  }, [logs]);

  // A filter change can remove rows that were ticked. Keeping them selected
  // would let a bulk action hit logs the user can no longer see.
  useEffect(() => {
    setSelection((current) => {
      const next = prune(current, visibleKey ? visibleKey.split(',') : []);
      return next.length === current.length ? current : next;
    });
  }, [visibleKey]);

  useEffect(() => () => {
    if (release.current) clearTimeout(release.current);
  }, []);


  /**
   * Where the wash sits when the pointer is elsewhere: the first open row, or
   * the first row, as the design draws it.
   */
  const restingId = useMemo(
    () => logs.find((log) => query.open.includes(log.id))?.id ?? logs[0]?.id ?? null,
    [logs, query.open]
  );

  const registry = useRowRegistry(visibleKey);


  const claimHover = useCallback((id: string) => {
    if (release.current) {
      clearTimeout(release.current);
      release.current = null;
    }
    setHoveredId(id);
  }, []);

  /**
   * Released by the table, not by the row being left.
   *
   * A row's own `mouseleave` fires *before* the next row's `mouseenter`, so
   * clearing there sent the wash home between every pair of neighbours — the
   * flicker that showed up as hovering across names too quickly.
   */
  const releaseHover = useCallback(() => {
    if (release.current) clearTimeout(release.current);
    release.current = setTimeout(() => setHoveredId(null), HOVER_RELEASE_MS);
  }, []);

  const handleToggleSelect = (id: string, event: MouseEvent<HTMLButtonElement>) => {

    if (event.shiftKey && lastToggled.current) {
      const range = rangeBetween(visibleIds, lastToggled.current, id);
      if (range.length > 0) {
        setSelection((current) => selectRange(current, range));
        return;
      }
    }

    lastToggled.current = id;
    setSelection((current) => toggle(current, id));
  };

  const handleToggleAll = () => {
    lastToggled.current = null;
    setSelection((current) => toggleAll(current, visibleIds));
  };

  const applyStatus = (status: LogStatus) => {
    const target = [...selection];
    if (target.length === 0) return;

    const previous = new Map(
      target.map((id) => [id, logs.find((log) => log.id === id)?.status ?? 'new'] as const)
    );

    setPendingStatus((current) => {
      const next = new Map(current);
      for (const id of target) next.set(id, status);
      return next;
    });
    setSelection([]);
    lastToggled.current = null;

    startWrite(async () => {
      const result = await attempt(() => setLogsStatus(target, status));
      if (result.success) return;

      // Roll back to exactly what each row was, not to a blanket default: two
      // of the six may already have been reviewed before this click.
      setPendingStatus((current) => {
        const next = new Map(current);
        for (const [id, was] of previous) {
          if (next.get(id) === status) next.set(id, was);
        }
        return next;
      });
      setSelection(target);
      toast.show({ tone: 'error', message: result.error });
    });
  };

  /**
   * Deletes on the press, and offers the way back.
   *
   * There is no confirm step. Delete used to arm on the first click and fire on
   * the second, which taxes every deliberate delete to protect against the rare
   * accidental one. The server keeps the removed rows for a minute instead, so
   * the accident costs one more click to reverse and the deliberate case costs
   * nothing.
   */
  const removeLogs = (ids: readonly string[]) => {
    if (ids.length === 0) return;

    startWrite(async () => {
      const result = await attempt(() => deleteLogs(ids));

      if (!result.success) {
        toast.show({ tone: 'error', message: result.error });
        return;
      }

      setSelection((current) => current.filter((id) => !ids.includes(id)));
      lastToggled.current = null;

      // A deleted row cannot stay in `open`, or the next render would ask the
      // server for a panel belonging to a log that no longer exists.
      const current = latestQuery.current;
      const stillOpen = current.open.filter((id) => !ids.includes(id));
      if (stillOpen.length !== current.open.length) {
        replace({ ...current, open: stillOpen });
      }

      // Nothing was removed, or nothing was kept to put back. Either way an
      // undo offer would promise something this component cannot deliver.
      const { deleted, undoToken } = result.data;
      if (deleted === 0 || !undoToken) return;

      toast.show({
        message: deleted === 1 ? 'Log deleted' : `${deleted} logs deleted`,
        durationMs: 8_000,
        action: { label: 'Undo', onSelect: () => undoDelete(undoToken) },
      });
    });
  };

  const undoDelete = (token: string) => {
    startUndo(async () => {
      const result = await attempt(() => restoreLogs(token));
      if (!result.success) toast.show({ tone: 'error', message: result.error });
    });
  };

  return (
    <>
      <LogsTableHeader
        state={headerState(selection, visibleIds)}
        onToggleAll={handleToggleAll}
        disabled={logs.length === 0}
      />

      {/*
        Dimmed, not replaced. A filter change re-runs the query on the server;
        swapping in a spinner would throw away the rows the user is comparing
        against, and at this latency they are usually right anyway.
      */}
      <motion.div
        ref={registry.container}
        animate={{ opacity: queryPending ? 0.45 : 1 }}
        transition={EASE_QUICK}
        className="relative flex w-full flex-col"
        onMouseLeave={releaseHover}
      >
        {/*
          One wash for the whole table, positioned over the hovered row. Sits
          first in the DOM so the cells — which are positioned, for their own
          reasons — paint over it.
        */}
        <RowHighlight registry={registry} activeId={hoveredId} rowsKey={visibleKey} />

        <AnimatePresence initial={false}>
          {logs.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={EASE_QUICK}
              className="sticky left-0 flex w-[100cqw] flex-col items-start gap-[10px] px-[30px] py-[24px]"
            >
              {/*
                An empty table has two quite different causes and they need
                different answers. Narrowed to nothing, the way out is to widen
                the search — so say what is narrowing it and offer to drop it,
                rather than leaving someone to hunt the chip that did it. With
                no filters at all, the farm simply has no logs yet, and telling
                that person to clear filters would be nonsense.
              */}
              <p className="text-[14px] font-normal leading-[1.3] text-[#4D4D4D]">
                {narrowed ? narrowedMessage : 'No logs recorded yet.'}
              </p>

              {narrowed ? (
                <button
                  type="button"
                  onClick={() => replace({ ...EMPTY_LOG_QUERY, q: '', open: query.open })}
                  className="rounded-[80px] bg-black px-[14px] py-[6px] text-[13px] font-normal leading-[1.3] text-white shadow-chip outline-none focus-visible:ring-2 focus-visible:ring-black/40"
                >
                  Show every log
                </button>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>

        {shown.map((log) => {
          const expanded = query.open.includes(log.id);
          const detail = detailById.get(log.id);
          const panelId = `log-panel-${log.id}`;

          return (
            /*
              The hover claim is on the wrapper rather than the row, so the
              expanded panel counts as part of the row it belongs to. Without
              that, dragging the pointer from a row above a panel to the row
              below it crossed a region that claimed nothing, and the wash stayed
              behind on the row the pointer had already left.
            */
            <div
              key={log.id}
              className="flex w-full flex-col"
              onMouseEnter={() => claimHover(log.id)}
            >
              <LogRow
                log={log}
                highlighted={log.id === (hoveredId ?? restingId)}
                resting={log.id === restingId && (hoveredId === null || hoveredId === restingId)}
                selected={isSelected(selection, log.id)}
                flagged={flagged.has(log.id)}
                expanded={expanded}
                panelId={panelId}
                rowRef={registry.register(log.id)}
                onOpen={() => replace(toggleOpenLog(query, log.id))}
                onToggleSelect={handleToggleSelect}
              />

              <AnimatePresence initial={false}>
                {expanded ? (
                  <motion.div
                    key={panelId}
                    id={panelId}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={SPRING_PANEL}
                    className="overflow-hidden"
                  >
                    {detail ? (
                      <ExpandedLogDetail
                        detail={detail}
                        employeeLabel={log.employee}
                        fieldLabel={log.field}
                        availableTags={availableTags}
                        canWrite={canWrite}
                        canRetract={canRetract}
                        products={products}
                        reference={reference}
                        recordContext={`${log.activity} on ${log.field}, ${formatLogDate(log.startedAt)}, logged by ${log.employee}.`}
                        onEdit={() => setEditingLogId(log.id)}
                        onDelete={() => removeLogs([log.id])}
                      />
                    ) : (
                      <LogDetailSkeleton
                        expectRecord={
                          reference.activityTypes.find((type) => type.name === log.activity)
                            ?.requiresProduct ?? false
                        }
                      />
                    )}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          );
        })}
      </motion.div>

      <BulkActionBar
        count={selection.length}
        busy={busy || !canWrite}
        refusal={canWrite ? null : writeBlockedReason}
        onMarkReviewed={() => applyStatus('reviewed')}
        onMarkNew={() => applyStatus('new')}
        onDelete={() => removeLogs([...selection])}
        onClear={() => {
          setSelection([]);
          lastToggled.current = null;
        }}
      />

      {/* Create — opened from the toolbar, owned here so one dialog serves both. */}
      <LogFormDialog open={creating} onClose={onCloseCreate} reference={reference} />

      {/*
        Edit — only mountable while the row is open, because its form payload is
        fetched alongside the expanded panel rather than for every row.
      */}
      <LogFormDialog
        open={Boolean(editingLogId && editables[editingLogId])}
        onClose={() => setEditingLogId(null)}
        reference={reference}
        logId={editingLogId ?? undefined}
        initial={editingLogId ? editables[editingLogId] : undefined}
      />
    </>
  );
}
