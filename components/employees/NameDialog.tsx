'use client';

import { useState, useTransition } from 'react';

import { ERROR_TEXT, INPUT, LABEL, PRIMARY_BUTTON } from '@/components/ui/formStyles';
import { Modal } from '@/components/ui/Modal';

type Outcome = { readonly success: true } | { readonly success: false; readonly error: string };

interface NameDialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly label: string;
  readonly initial: string;
  readonly submitLabel: string;
  readonly onClose: () => void;
  readonly onSubmit: (name: string) => Promise<Outcome>;
}

/**
 * One text field and a button.
 *
 * Add and rename are the same dialog with different words, so they are the same
 * component — the alternative is two nearly-identical forms that drift apart the
 * first time one of them gets a validation message.
 */
export function NameDialog({
  open,
  title,
  label,
  initial,
  submitLabel,
  onClose,
  onSubmit,
}: NameDialogProps) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  // Derived during render rather than in an effect: re-seeding is a reaction to
  // a prop, and an effect would paint the previous name for one frame.
  const [seed, setSeed] = useState(initial);
  if (seed !== initial) {
    setSeed(initial);
    setValue(initial);
    setError(null);
  }

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          startSave(async () => {
            const result = await onSubmit(value);
            if (!result.success) {
              setError(result.error);
              return;
            }
            onClose();
          });
        }}
        className="flex flex-col gap-[16px]"
      >
        <label className="flex flex-col gap-[6px]">
          <span className={LABEL}>{label}</span>
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            maxLength={80}
            autoFocus
            className={INPUT}
            required
          />
        </label>

        {error ? (
          <p role="alert" className={ERROR_TEXT}>
            {error}
          </p>
        ) : null}

        <div className="flex justify-end">
          <button type="submit" disabled={saving} className={PRIMARY_BUTTON}>
            {saving ? 'Saving…' : submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
