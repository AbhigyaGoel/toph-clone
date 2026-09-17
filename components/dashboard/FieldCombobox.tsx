'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { Popover } from '@/components/ui/Popover';

interface FieldComboboxProps {
  readonly label: string;
  readonly initial: string;
  /** The farm's own list for this field — products, fields, activities. */
  readonly options: readonly string[];
  readonly disabled: boolean;
  readonly onCommit: (value: string) => void;
  readonly onCancel: () => void;
}

/** More than this and it stops being a shortlist and becomes a scroll. */
const SHOWN = 6;

/**
 * Correcting a field by picking, not by typing it correctly.
 *
 * The values these fields hold are not free text — a product has to match the
 * register or it has no EPA number, and a block has to match a real field or
 * the log points nowhere. Left as a bare input, "Glyphosate 41%", "glyphosate
 * 41" and "Glyphosate" file as three different things, and the compliance check
 * that looks the product up fails on two of them for no reason a user can see.
 *
 * So the correction offers what the farm already has. Typing still works — the
 * list narrows as you go, and a value not on it can still be committed, because
 * a worker naming a product nobody has registered yet is information rather
 * than an error.
 */
export function FieldCombobox({
  label,
  initial,
  options,
  disabled,
  onCommit,
  onCancel,
}: FieldComboboxProps) {
  const [draft, setDraft] = useState(initial);
  /**
   * -1 until the user actually picks a suggestion.
   *
   * Pre-highlighting the first match reads as helpful and is not: it makes
   * Enter commit a value the user never chose. Clear the field and press Enter
   * and you file the first product on the list; type a chemical the register
   * has not got and press Enter and you file a *different* chemical that
   * happens to share a substring. On a field that carries the EPA number, a
   * silent substitution is the worst outcome available.
   */
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(true);
  const input = useRef<HTMLInputElement>(null);
  /** What the list hangs from — see the Popover note on why it is not in flow. */
  const anchor = useRef<HTMLSpanElement>(null);
  const listId = `suggestions-${label.replace(/\W+/g, '-').toLowerCase()}`;
  /** Set when a commit is already under way, so blur cannot fire a second. */
  const committed = useRef(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => input.current?.select());
    return () => cancelAnimationFrame(frame);
  }, []);

  const matches = useMemo(() => {
    const needle = draft.trim().toLowerCase();
    const pool = needle
      ? options.filter((option) => option.toLowerCase().includes(needle))
      : options;
    return pool.slice(0, SHOWN);
  }, [draft, options]);

  // Narrowing the list drops any highlight rather than sliding it onto whatever
  // now sits at that index.
  useEffect(() => {
    setActive(-1);
  }, [matches.length]);

  const commit = (value: string) => {
    if (committed.current) return;
    committed.current = true;
    onCommit(value.trim());
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && matches.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActive((current) => (current + 1) % matches.length);
    } else if (event.key === 'ArrowUp' && matches.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActive((current) =>
        current < 0 ? matches.length - 1 : (current - 1 + matches.length) % matches.length
      );
    } else if (event.key === 'Enter') {
      event.preventDefault();
      // A suggestion wins only once it has been deliberately highlighted.
      // Otherwise Enter files exactly what is in the box — including nothing,
      // which is how a field gets cleared back to "not mentioned".
      commit(open && active >= 0 && matches[active] ? matches[active] : draft);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      if (open && draft !== initial) setOpen(false);
      else onCancel();
    }
  };

  return (
    <span ref={anchor} className="relative flex min-w-0 flex-1 justify-end">
      <input
        ref={input}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        // Blur commits rather than discards: the gesture after typing a
        // correction is usually to click the next field, and losing the edit
        // for that would teach people not to trust the control. Delayed a beat
        // so a click *on a suggestion* lands first.
        onBlur={() => window.setTimeout(() => commit(draft), 120)}
        disabled={disabled}
        role="combobox"
        aria-controls={listId}
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        aria-expanded={open && matches.length > 0}
        aria-autocomplete="list"
        aria-label={`${label} — corrected value`}
        placeholder="not mentioned"
        className="min-w-0 flex-1 rounded-[6px] border border-black/10 bg-white px-[8px] py-[3px] text-right text-[13px] font-normal leading-[1.3] text-black outline-none focus:border-black/30 disabled:opacity-60"
      />

      {/*
        Rendered at the document root, not under the input. The extracted
        fields sit in a rounded card with `overflow-hidden`, so a list declared
        in flow is cut off at the card's edge — and the field most likely to
        need a suggestion, Conditions, is the bottom row, where every option
        was clipped away. The Popover also keeps the list on screen when the
        row is near the foot of the window.
      */}
      <Popover
        open={open && matches.length > 0}
        anchor={anchor}
        align="end"
        id={listId}
        role="listbox"
        className="w-[240px]"
      >
        <ul aria-label={`${label} suggestions`} className="flex flex-col">
          {matches.map((option, index) => (
            <li key={option}>
              <button
                type="button"
                role="option"
                id={`${listId}-${index}`}
                aria-selected={index === active}
                // `mousedown`, not `click`: the input's blur fires first and
                // would commit the typed text before a click ever landed.
                onMouseDown={(event) => {
                  event.preventDefault();
                  commit(option);
                }}
                onPointerMove={() => setActive(index)}
                className={`flex w-full items-center rounded-[8px] px-[10px] py-[6px] text-left text-[13px] font-normal leading-[1.3] text-black transition-colors ${
                  index === active ? 'bg-black/[0.06]' : 'bg-transparent'
                }`}
              >
                {option}
              </button>
            </li>
          ))}
        </ul>
      </Popover>
    </span>
  );
}
