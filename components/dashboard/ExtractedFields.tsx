'use client';

import { motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';

import { correctExtractedField } from '@/app/actions/extraction';
import { FieldCombobox } from '@/components/dashboard/FieldCombobox';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/ToastProvider';
import { attempt } from '@/lib/attempt';
import {
  complianceChecks,
  FIELD_LABELS,
  FIELD_ORDER,
  FIELD_SUGGESTIONS,
  isUncertain,
  LISTEN_BELOW,
  type CheckState,
  type ComplianceCheck,
} from '@/lib/extraction';
import { EASE_QUICK } from '@/lib/motion';
import type {
  ApplicationRecord,
  ExtractedFields as Fields,
  ExtractedValue,
  Product,
  ReferenceData,
} from '@/lib/types';

interface ExtractedFieldsProps {
  readonly logId: string;
  readonly extracted: Fields | null;
  readonly records: readonly ApplicationRecord[];
  readonly requiresProduct: boolean;
  readonly products: readonly Product[];
  /** The farm's own fields and activities, for the correction suggestions. */
  readonly reference: ReferenceData;
  readonly canWrite: boolean;
}

/**
 * The voice log, as a compliance record — and the place it gets corrected.
 *
 * This is the whole product in one card. A worker says "ran spinosad at half a
 * gallon an acre, wind was light, about three" and the manager needs that as
 * five labelled lines they can scan, not a paragraph to read and re-key.
 *
 * Every field is editable in place, because speech recognition degrades exactly
 * where this product needs it most: chemical names, engine noise, wind. The
 * extraction is a starting point. The admin fixes the 5% the machine got wrong,
 * the checks below re-derive on the spot, and the record becomes audit-ready —
 * without that, the extracted fields are decoration.
 *
 * Per-field confidence rather than one score for the recording, because that is
 * how a reviewer's attention should be spent. "This log is 94% accurate" tells
 * them nothing to do. "The rate came through at 61%" tells them which line to
 * listen back to.
 */
export function ExtractedFields({
  logId,
  extracted,
  records,
  requiresProduct,
  products,
  reference,
  canWrite,
}: ExtractedFieldsProps) {
  const checks = complianceChecks(extracted, records, requiresProduct, products);
  const [editing, setEditing] = useState<string | null>(null);

  // What each correctable field can be, drawn from the farm's own lists rather
  // than typed freehand — see FIELD_SUGGESTIONS for why only three of the five.
  const suggestions = useMemo(
    () => ({
      products: products.map((product) => product.name),
      fields: reference.fields.map((item) => item.name),
      activities: reference.activityTypes.map((item) => item.name),
    }),
    [products, reference]
  );

  return (
    <div className="flex w-full flex-col gap-[10px] self-stretch">
      <div className="flex items-center justify-between gap-[10px]">
        <span className="text-[10px] font-medium uppercase tracking-[0.04em] text-[#B3B3B3]">
          Extracted
        </span>
        <span className="text-[11px] font-normal leading-[1.3] text-[#B3B3B3]">
          {canWrite ? 'Click a field to correct it' : 'Read from the recording'}
        </span>
      </div>

      <div className="flex flex-col overflow-hidden rounded-[10px] bg-black/[0.03]">
        {FIELD_ORDER.map((key, index) => (
          <Row
            key={key}
            logId={logId}
            field={key}
            label={FIELD_LABELS[key]}
            value={extracted?.[key]}
            first={index === 0}
            canWrite={canWrite}
            options={
              FIELD_SUGGESTIONS[key] ? suggestions[FIELD_SUGGESTIONS[key]] : []
            }
            editing={editing === key}
            onEdit={() => setEditing(key)}
            onDone={() => setEditing(null)}
          />
        ))}
      </div>

      {/*
        The checks sit directly under the fields they are drawn from, because
        the manager's question is not "are these five values right" — it is
        "will this log survive an inspection". The fields answer the first, the
        badges answer the second, and keeping them apart would make the reviewer
        hold both in their head.
      */}
      <div className="flex flex-wrap gap-[6px]">
        {checks.map((check) => (
          <Badge key={check.id} check={check} />
        ))}
      </div>
    </div>
  );
}

interface RowProps {
  readonly logId: string;
  readonly field: (typeof FIELD_ORDER)[number];
  readonly label: string;
  readonly value: ExtractedValue | undefined;
  readonly first: boolean;
  readonly canWrite: boolean;
  /** The farm's own values for this field, if it has a closed list. */
  readonly options: readonly string[];
  readonly editing: boolean;
  readonly onEdit: () => void;
  readonly onDone: () => void;
}

function Row({
  logId,
  field,
  label,
  value,
  first,
  canWrite,
  options,
  editing,
  onEdit,
  onDone,
}: RowProps) {
  const captured = value?.value ?? null;
  const uncertain = isUncertain(value);
  const corrected = value?.corrected === true;

  const [saving, startSave] = useTransition();
  const toast = useToast();

  const save = (next: string) => {
    if (next === (captured ?? '')) {
      onDone();
      return;
    }

    startSave(async () => {
      const result = await attempt(() => correctExtractedField(logId, field, next));
      if (!result.success) {
        toast.show({ tone: 'error', message: result.error });
        return;
      }
      onDone();
    });
  };

  const shell = `flex items-baseline justify-between gap-[12px] px-[14px] py-[8px] ${
    first ? '' : 'border-t border-black/[0.04]'
  }`;

  if (editing) {
    return (
      <div className={shell}>
        <span className="shrink-0 text-[12px] font-normal leading-[1.4] text-[#4D4D4D]">
          {label}
        </span>
        <FieldCombobox
          label={label}
          initial={captured ?? ''}
          options={options}
          disabled={saving}
          onCommit={save}
          onCancel={onDone}
        />
      </div>
    );
  }

  return (
    <div className={shell}>
      <span className="shrink-0 text-[12px] font-normal leading-[1.4] text-[#4D4D4D]">{label}</span>

      <span className="flex min-w-0 items-baseline justify-end gap-[8px]">
        {canWrite ? (
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Correct ${label.toLowerCase()}`}
            className="flex min-w-0 items-baseline gap-[8px] rounded-[6px] px-[6px] py-[1px] text-right outline-none transition-colors hover:bg-black/[0.05] focus-visible:ring-2 focus-visible:ring-black/30"
          >
            <Value captured={captured} uncertain={uncertain} confidence={value?.confidence ?? null} />
          </button>
        ) : (
          <Value captured={captured} uncertain={uncertain} confidence={value?.confidence ?? null} />
        )}

        {corrected ? (
          <motion.span
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={EASE_QUICK}
            title="Checked and corrected by a person, not read from the audio."
            className="flex shrink-0 items-center gap-[4px] whitespace-nowrap rounded-[80px] bg-[rgba(20,108,68,0.1)] px-[7px] py-[1px] text-[11px] font-normal leading-[1.4] text-[#146C44]"
          >
            <Icon name="check" size={9} />
            edited
          </motion.span>
        ) : null}
      </span>
    </div>
  );
}

interface ValueProps {
  readonly captured: string | null;
  readonly uncertain: boolean;
  readonly confidence: number | null;
}

function Value({ captured, uncertain, confidence }: ValueProps) {
  if (captured === null) {
    return (
      <span className="text-[13px] font-normal leading-[1.3] text-[#B3B3B3]">not mentioned</span>
    );
  }

  return (
    <>
      <span
        className={`truncate text-[13px] leading-[1.3] ${
          uncertain ? 'font-medium text-[#7A5B00]' : 'font-normal text-black'
        }`}
      >
        {captured}
      </span>
      {uncertain ? (
        <span
          title={`Heard at ${Math.round((confidence ?? 0) * 100)}% confidence — below the ${Math.round(LISTEN_BELOW * 100)}% worth trusting without listening.`}
          className="flex shrink-0 items-center gap-[4px] whitespace-nowrap rounded-[80px] bg-[rgba(122,91,0,0.1)] px-[7px] py-[1px] text-[11px] font-normal leading-[1.4] text-[#7A5B00]"
        >
          {Math.round((confidence ?? 0) * 100)}% · check
        </span>
      ) : null}
    </>
  );
}

const CHECK_LOOK: Record<CheckState, { readonly tint: string; readonly ground: string }> = {
  pass: { tint: '#146C44', ground: 'rgba(20,108,68,0.1)' },
  warn: { tint: '#7A5B00', ground: 'rgba(122,91,0,0.12)' },
  na: { tint: '#B3B3B3', ground: 'rgba(0,0,0,0.04)' },
};

function Badge({ check }: { readonly check: ComplianceCheck }) {
  const look = CHECK_LOOK[check.state];

  return (
    <motion.span
      layout
      title={check.detail || undefined}
      className="flex items-center gap-[5px] rounded-[80px] px-[10px] py-[3px] text-[12px] font-normal leading-[1.3]"
      style={{ backgroundColor: look.ground, color: look.tint }}
    >
      <Icon
        name={check.state === 'pass' ? 'check' : check.state === 'warn' ? 'clipboard-pen' : 'x'}
        size={11}
      />
      {check.label}
      {check.state === 'warn' ? <span aria-hidden>⚠</span> : null}
    </motion.span>
  );
}
