'use client';

import { useState } from 'react';

import { LogPanelToolbar } from '@/components/dashboard/LogPanelToolbar';
import { LogsTable } from '@/components/dashboard/LogsTable';
import { ManageDataDialog } from '@/components/dashboard/ManageDataDialog';
import type {
  ActivityLog,
  FilterOptions,
  LogDetail,
  LogInput,
  Product,
  ReferenceData,
} from '@/lib/types';

interface LogsPanelProps {
  readonly title: string;
  readonly filterOptions: FilterOptions;
  readonly logs: readonly ActivityLog[];
  /** Panels for the rows currently open, in no particular order. */
  readonly details: readonly LogDetail[];
  /** True when at least one row is open, which changes how the panel is sized. */
  readonly expanded: boolean;
  readonly canWrite: boolean;
  /** Why writing is unavailable, when it is: read-only build, or a role. */
  readonly writeBlockedReason: string | null;
  readonly reference: ReferenceData;
  readonly products: readonly Product[];
  readonly canRetract: boolean;
  /** The open logs in the edit form's shape, keyed by log id. */
  readonly editables: Readonly<Record<string, LogInput>>;
  /** Logs with a compliance gap or shaky audio, marked in the row. */
  readonly flaggedLogIds: readonly string[];
}

/**
 * Figma `Frame 32` — the "New Employee Logs" panel.
 *
 * The design has two variants of this frame. Collapsed, it hugs its rows and the
 * page ends wherever the table does. Expanded, it stretches to the bottom of the
 * 935px viewport and the table body scrolls inside it, because the open detail
 * panel makes the content taller than the screen. That single difference is what
 * `expanded` drives — at the design's breakpoint and up. Narrower than that
 * the page itself scrolls, and the table scrolls sideways within the panel.
 *
 * The scroll area is an inline-size container so the expanded detail and the
 * bulk action bar can be sized to the visible width (`100cqw`) and pinned with
 * `sticky`: the rows slide under them, they do not. Note that the same property
 * makes this element the containing block for `position: fixed` descendants,
 * which is why every dialog opened from inside it renders through a portal.
 *
 * The panel owns which dialog is open because both entry points live in its
 * toolbar while the create form itself belongs with the table's other writes.
 */
export function LogsPanel({
  title,
  filterOptions,
  logs,
  details,
  expanded,
  canWrite,
  writeBlockedReason,
  reference,
  products,
  canRetract,
  editables,
  flaggedLogIds,
}: LogsPanelProps) {
  const [creating, setCreating] = useState(false);
  const [managing, setManaging] = useState(false);

  const fill = expanded ? 'xl:min-h-0 xl:flex-1' : '';

  return (
    <section
      className={`flex w-full flex-col items-center self-stretch overflow-hidden rounded-[20px] bg-white shadow-panel ${fill}`}
    >
      <LogPanelToolbar
        title={title}
        count={logs.length}
        options={filterOptions}
        canWrite={canWrite}
        onNewLog={() => setCreating(true)}
        onManage={() => setManaging(true)}
      />

      <div
        className={`flex w-full flex-col self-stretch overflow-x-auto bg-white [container-type:inline-size] ${fill} ${
          expanded ? 'xl:overflow-y-auto' : ''
        }`}
      >
        <LogsTable
          logs={logs}
          details={details}
          editables={editables}
          flaggedLogIds={flaggedLogIds}
          availableTags={filterOptions.tags}
          canWrite={canWrite}
          writeBlockedReason={writeBlockedReason}
          reference={reference}
          products={products}
          canRetract={canRetract}
          creating={creating}
          onCloseCreate={() => setCreating(false)}
        />
      </div>

      <ManageDataDialog
        open={managing}
        onClose={() => setManaging(false)}
        reference={reference}
      />
    </section>
  );
}
