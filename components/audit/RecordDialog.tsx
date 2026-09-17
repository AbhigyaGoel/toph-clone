'use client';

import { useEffect, useState, useTransition } from 'react';

import { addApplication, updateApplication } from '@/app/actions/applications';
import { Modal } from '@/components/ui/Modal';
import { ERROR_TEXT, INPUT, LABEL, PRIMARY_BUTTON, SELECT, SELECT_CHEVRON } from '@/components/ui/formStyles';
import {
  applicationInputSchema,
  firstApplicationIssue,
  optionalNumber,
} from '@/lib/applicationInput';
import { attempt } from '@/lib/attempt';
import { KIND_LABELS } from '@/lib/compliance';
import type { ApplicationRecord, Product } from '@/lib/types';

interface RecordDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly products: readonly Product[];
  /** Filing a new record against this log. */
  readonly logId?: string;
  /** Or completing one that was filed short. */
  readonly record?: ApplicationRecord;
  /** What the record is about, for the dialog's subtitle. */
  readonly context: string;
}

interface FormState {
  readonly productId: string;
  readonly rate: string;
  readonly areaAcres: string;
  readonly windSpeedMph: string;
  readonly airTempF: string;
}

const EMPTY: FormState = { productId: '', rate: '', areaAcres: '', windSpeedMph: '', airTempF: '' };

/**
 * Files the product record a log owes, or completes one that came in short.
 *
 * The same form for both, because they are the same record at two stages, and
 * an admin correcting a garbled voice log should not have to learn two layouts.
 * Which product is only editable while filing: changing it afterwards would
 * turn one record into a different one under the same id, which is exactly what
 * an audit trail exists to prevent.
 *
 * The conditions are marked optional in the form and required by the compliance
 * rules, and that is deliberate rather than inconsistent — a farm that has lost
 * the wind reading should be able to file what it has and see the record listed
 * as incomplete, instead of being unable to file anything at all.
 */
export function RecordDialog({
  open,
  onClose,
  products,
  logId,
  record,
  context,
}: RecordDialogProps) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  const editing = record !== undefined;
  const selected = products.find((product) => product.id === form.productId);

  useEffect(() => {
    if (!open) return;

    setError(null);
    setForm(
      record
        ? {
            productId: record.productId,
            rate: String(record.rate),
            areaAcres: record.areaAcres === null ? '' : String(record.areaAcres),
            windSpeedMph: record.windSpeedMph === null ? '' : String(record.windSpeedMph),
            airTempF: record.airTempF === null ? '' : String(record.airTempF),
          }
        : EMPTY
    );
  }, [open, record]);

  const set = (key: keyof FormState) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = () => {
    setError(null);

    const numbers = {
      rate: Number(form.rate),
      areaAcres: optionalNumber(form.areaAcres),
      windSpeedMph: optionalNumber(form.windSpeedMph),
      airTempF: optionalNumber(form.airTempF),
    };

    // Validated here with the schema the action uses, so a typed rate of zero
    // is refused before a round trip rather than after one.
    const shape = editing
      ? applicationInputSchema.omit({ logId: true, productId: true })
      : applicationInputSchema;
    const checked = shape.safeParse(
      editing ? numbers : { logId: logId ?? '', productId: form.productId, ...numbers }
    );
    if (!checked.success) {
      setError(firstApplicationIssue(checked.error));
      return;
    }

    startSave(async () => {
      const result = await attempt(() =>
        editing
          ? updateApplication(record.id, numbers)
          : addApplication({ logId: logId ?? '', productId: form.productId, ...numbers })
      );

      if (!result.success) {
        setError(result.error);
        return;
      }
      onClose();
    });
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Complete record' : 'Record product'}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="flex flex-col gap-[16px]"
      >
        <p className="text-[13px] font-normal leading-[1.4] text-[#4D4D4D]">{context}</p>

        <label className="flex flex-col gap-[6px]">
          <span className={LABEL}>Product</span>
          <span className="relative flex">
            <select
              value={form.productId}
              onChange={(event) => set('productId')(event.target.value)}
              disabled={editing}
              className={`${SELECT} disabled:cursor-not-allowed disabled:opacity-60`}
              required
            >
              <option value="" disabled>
                Choose a product
              </option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} · {KIND_LABELS[product.kind]}
                </option>
              ))}
            </select>
            <span className={SELECT_CHEVRON} />
          </span>
        </label>

        <div className="flex flex-col gap-[16px] sm:flex-row">
          <label className="flex flex-1 flex-col gap-[6px]">
            <span className={LABEL}>Rate {selected ? `(${selected.rateUnit})` : ''}</span>
            <input
              value={form.rate}
              onChange={(event) => set('rate')(event.target.value)}
              inputMode="decimal"
              placeholder="0.5"
              className={INPUT}
              required
            />
          </label>

          <label className="flex flex-1 flex-col gap-[6px]">
            <span className={LABEL}>Treated area (acres)</span>
            <input
              value={form.areaAcres}
              onChange={(event) => set('areaAcres')(event.target.value)}
              inputMode="decimal"
              placeholder="18"
              className={INPUT}
            />
          </label>
        </div>

        {/*
          Conditions are asked for only where they are part of the record. A
          fertilizer spreader does not report wind, and a form that demanded it
          would teach people to type something into a compliance field.
        */}
        {(selected?.kind ?? record?.kind) === 'chemical' ? (
          <div className="flex flex-col gap-[16px] sm:flex-row">
            <label className="flex flex-1 flex-col gap-[6px]">
              <span className={LABEL}>Wind speed (mph)</span>
              <input
                value={form.windSpeedMph}
                onChange={(event) => set('windSpeedMph')(event.target.value)}
                inputMode="decimal"
                placeholder="3.5"
                className={INPUT}
              />
            </label>

            <label className="flex flex-1 flex-col gap-[6px]">
              <span className={LABEL}>Air temperature (°F)</span>
              <input
                value={form.airTempF}
                onChange={(event) => set('airTempF')(event.target.value)}
                inputMode="decimal"
                placeholder="74"
                className={INPUT}
              />
            </label>
          </div>
        ) : null}

        {selected && selected.kind === 'chemical' ? (
          <p className="rounded-[10px] bg-black/[0.03] px-[12px] py-[10px] text-[12px] font-normal leading-[1.5] text-[#4D4D4D]">
            {selected.epaRegistration ? `EPA reg. ${selected.epaRegistration}. ` : ''}
            {selected.reiHours ? `Re-entry restricted for ${selected.reiHours}h after application. ` : ''}
            {selected.phiDays ? `Pre-harvest interval ${selected.phiDays} days.` : ''}
          </p>
        ) : null}

        {error ? (
          <p role="alert" className={ERROR_TEXT}>
            {error}
          </p>
        ) : null}

        <div className="flex justify-end">
          <button type="submit" disabled={saving} className={PRIMARY_BUTTON}>
            {saving ? 'Saving…' : editing ? 'Save record' : 'File record'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
