'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState, useTransition } from 'react';

import { createLog, updateLog } from '@/app/actions/logs';
import { Modal } from '@/components/ui/Modal';
import {
  ERROR_TEXT,
  INPUT,
  LABEL,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SELECT,
  SELECT_CHEVRON,
} from '@/components/ui/formStyles';
import { attempt } from '@/lib/attempt';
import { firstIssue, logInputSchema } from '@/lib/logInput';
import { EASE_QUICK } from '@/lib/motion';
import type { LogInput, ReferenceData } from '@/lib/types';

interface LogFormDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly reference: ReferenceData;
  /** Present when editing; absent when creating. */
  readonly logId?: string;
  readonly initial?: LogInput;
}

/** Today in UTC, matching how every timestamp on this screen is read. */
const today = (): string => new Date().toISOString().slice(0, 10);

const blankInput = (reference: ReferenceData): LogInput => ({
  employeeId: reference.employees.find((item) => item.isActive)?.id ?? '',
  activityTypeId: reference.activityTypes[0]?.id ?? '',
  fieldId: reference.fields[0]?.id ?? '',
  date: today(),
  startTime: '06:00',
  endTime: '10:40',
  status: 'new',
});

/**
 * Create and edit a log.
 *
 * One dialog for both, because they are the same six fields writing to the same
 * row — splitting them would mean keeping two forms in step every time the log
 * shape changes. Which action runs is decided by whether a `logId` came in.
 *
 * The three foreign keys are `<select>`s over the reference data rather than
 * free text: an activity typed by hand is how "Irrigating" and "Irrigation"
 * become two categories, which is the same argument that made them lookup
 * tables in the first place. Times are plain 24-hour inputs read as UTC, so
 * what is typed is what the table displays.
 */
export function LogFormDialog({
  open,
  onClose,
  reference,
  logId,
  initial,
}: LogFormDialogProps) {
  const [value, setValue] = useState<LogInput>(initial ?? blankInput(reference));
  const [error, setError] = useState<string | null>(null);
  const [busy, startWrite] = useTransition();

  const editing = Boolean(logId);

  // Reopening for a different row has to reload the form; without this the
  // dialog would keep whatever was last typed into it.
  useEffect(() => {
    if (!open) return;
    setValue(initial ?? blankInput(reference));
    setError(null);
    // `initial` is rebuilt by the parent each render, so the identity of the row
    // is the honest dependency here.
  }, [open, logId, initial, reference]);

  const set = <K extends keyof LogInput>(key: K, next: LogInput[K]) => {
    setValue((current) => ({ ...current, [key]: next }));
  };

  const submit = () => {
    setError(null);

    // The same schema the Server Action validates with, run here first.
    // Sharing it — rather than writing a second set of client rules — is what
    // stops the two from disagreeing: a message the form shows is a message the
    // server would have produced. The server still re-validates, because this
    // check is a courtesy and the action is a public endpoint.
    const checked = logInputSchema.safeParse(value);
    if (!checked.success) {
      setError(firstIssue(checked.error));
      return;
    }

    startWrite(async () => {
      const result = await attempt(() =>
        logId ? updateLog(logId, checked.data) : createLog(checked.data)
      );

      if (!result.success) {
        setError(result.error);
        return;
      }
      onClose();
    });
  };

  const incomplete = !value.employeeId || !value.activityTypeId || !value.fieldId;

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit log' : 'New log'}>
      <form
        className="flex flex-col gap-[16px]"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Field label="WORKER">
          <select
            value={value.employeeId}
            onChange={(event) => set('employeeId', event.target.value)}
            className={SELECT}
            style={{ backgroundImage: SELECT_CHEVRON }}
          >
            <option value="">Choose a worker</option>
            {reference.employees.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.isActive === false ? ' (inactive)' : ''}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-1 gap-[16px] sm:grid-cols-2">
          <Field label="ACTIVITY">
            <select
              value={value.activityTypeId}
              onChange={(event) => set('activityTypeId', event.target.value)}
              className={SELECT}
              style={{ backgroundImage: SELECT_CHEVRON }}
            >
              <option value="">Choose an activity</option>
              {reference.activityTypes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="FIELD">
            <select
              value={value.fieldId}
              onChange={(event) => set('fieldId', event.target.value)}
              className={SELECT}
              style={{ backgroundImage: SELECT_CHEVRON }}
            >
              <option value="">Choose a field</option>
              {reference.fields.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-[16px] sm:grid-cols-3">
          <Field label="DATE">
            <input
              type="date"
              value={value.date}
              onChange={(event) => set('date', event.target.value)}
              className={INPUT}
            />
          </Field>

          <Field label="START">
            <input
              type="time"
              value={value.startTime}
              onChange={(event) => set('startTime', event.target.value)}
              className={INPUT}
            />
          </Field>

          <Field label="END">
            <input
              type="time"
              value={value.endTime}
              onChange={(event) => set('endTime', event.target.value)}
              className={INPUT}
            />
          </Field>
        </div>

        <Field label="STATUS">
          <select
            value={value.status}
            onChange={(event) => set('status', event.target.value === 'reviewed' ? 'reviewed' : 'new')}
            className={SELECT}
            style={{ backgroundImage: SELECT_CHEVRON }}
          >
            <option value="new">New — not yet reviewed</option>
            <option value="reviewed">Reviewed</option>
          </select>
        </Field>

        <AnimatePresence>
          {error ? (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={EASE_QUICK}
              role="alert"
              className={ERROR_TEXT}
            >
              {error}
            </motion.p>
          ) : null}
        </AnimatePresence>

        <div className="flex items-center justify-end gap-[10px] pt-[4px]">
          <button type="button" onClick={onClose} className={SECONDARY_BUTTON}>
            Cancel
          </button>
          <button type="submit" disabled={busy || incomplete} className={PRIMARY_BUTTON}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Create log'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Field({ label, children }: { readonly label: string; readonly children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-[6px]">
      <span className={LABEL}>{label}</span>
      {children}
    </label>
  );
}
