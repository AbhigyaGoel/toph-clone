'use client';

import { motion } from 'framer-motion';
import { useLayoutEffect, useRef, useState } from 'react';

import {
  createActivityType,
  createEmployee,
  createField,
  deleteActivityType,
  deleteEmployee,
  deleteField,
  updateActivityType,
  updateEmployee,
  updateField,
} from '@/app/actions/reference';
import { createTag, deleteTag, renameTag } from '@/app/actions/tags';
import { ReferenceList } from '@/components/dashboard/ReferenceList';
import { Modal } from '@/components/ui/Modal';
import { SPRING_SNAP } from '@/lib/motion';
import type { ReferenceData } from '@/lib/types';

interface ManageDataDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly reference: ReferenceData;
}

type TabId = 'workers' | 'fields' | 'activities' | 'tags';

const TABS: ReadonlyArray<{ id: TabId; label: string }> = [
  { id: 'workers', label: 'Workers' },
  { id: 'fields', label: 'Fields' },
  { id: 'activities', label: 'Activities' },
  { id: 'tags', label: 'Tags' },
];

/**
 * Editing the data behind the table's columns.
 *
 * The dashboard reads five things per row — worker, activity, field, times,
 * status — and four of them are foreign keys. Without somewhere to manage those
 * collections, "create a log" can only ever pick from the seed, so this is what
 * makes the table's contents genuinely open-ended rather than a fixed set
 * rearranged.
 *
 * One dialog with tabs rather than four entries in the toolbar: these are
 * administrative, they are visited rarely, and grouping them keeps the chip row
 * about filtering — which is what the design put there.
 */
export function ManageDataDialog({ open, onClose, reference }: ManageDataDialogProps) {
  const [tab, setTab] = useState<TabId>('workers');
  const tabs = useRef(new Map<TabId, HTMLButtonElement>());
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);

  /*
   * The selected pill is positioned from measured layout rather than carrying a
   * shared `layoutId`.
   *
   * Framer's layout animations work by comparing bounding rects between
   * renders, and this dialog's panel animates its own transform as it opens —
   * so a `layoutId` here was being measured against a mid-animation, scaled
   * ancestor and landed in the wrong place or refused to move at all.
   * `offsetLeft` / `offsetWidth` are layout values that transforms do not
   * touch, so this is correct no matter what the panel is doing around it.
   */
  useLayoutEffect(() => {
    if (!open) return;
    const element = tabs.current.get(tab);
    if (element) setPill({ left: element.offsetLeft, width: element.offsetWidth });
  }, [tab, open]);

  return (
    <Modal open={open} onClose={onClose} title="Manage farm data" size="wide">
      <div
        role="tablist"
        className="relative flex flex-wrap items-center gap-[4px] border-b border-black/5 pb-[10px]"
      >
        {pill ? (
          <motion.span
            aria-hidden
            initial={false}
            animate={{ x: pill.left, width: pill.width }}
            transition={SPRING_SNAP}
            className="pointer-events-none absolute left-0 top-0 h-[30px] rounded-[80px] bg-black"
          />
        ) : null}

        {TABS.map((entry) => (
          <button
            key={entry.id}
            ref={(node) => {
              if (node) tabs.current.set(entry.id, node);
              else tabs.current.delete(entry.id);
            }}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            onClick={() => setTab(entry.id)}
            className="relative rounded-[80px] px-[14px] py-[6px] text-[14px] font-normal leading-[1.3] outline-none focus-visible:ring-2 focus-visible:ring-black/30"
          >
            <span className={tab === entry.id ? 'text-white' : 'text-[#4D4D4D]'}>{entry.label}</span>
          </button>
        ))}
      </div>

      {tab === 'workers' ? (
        <ReferenceList
          items={reference.employees}
          noun="worker"
          withActiveFlag
          countLabel="log"
          deleteBlockedByUse
          onCreate={createEmployee}
          onRename={(id, name, isActive) => updateEmployee(id, name, isActive)}
          onDelete={deleteEmployee}
        />
      ) : null}

      {tab === 'fields' ? (
        <ReferenceList
          items={reference.fields}
          noun="field"
          countLabel="log"
          deleteBlockedByUse
          onCreate={createField}
          onRename={(id, name) => updateField(id, name)}
          onDelete={deleteField}
        />
      ) : null}

      {tab === 'activities' ? (
        <ReferenceList
          items={reference.activityTypes}
          noun="activity"
          countLabel="log"
          deleteBlockedByUse
          onCreate={createActivityType}
          onRename={(id, name) => updateActivityType(id, name)}
          onDelete={deleteActivityType}
        />
      ) : null}

      {tab === 'tags' ? (
        <ReferenceList
          items={reference.tags}
          noun="tag"
          countLabel="use"
          deleteBlockedByUse={false}
          onCreate={createTag}
          onRename={(id, name) => renameTag(id, name)}
          onDelete={deleteTag}
        />
      ) : null}
    </Modal>
  );
}
