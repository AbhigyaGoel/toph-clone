'use client';

import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { useMemo, useState, useTransition } from 'react';

import { createEmployee, deleteEmployee, updateEmployee } from '@/app/actions/reference';
import { NameDialog } from '@/components/employees/NameDialog';
import { PersonCard } from '@/components/employees/PersonCard';
import { EmptyState } from '@/components/shell/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/ToastProvider';
import { PageEntrance } from '@/components/ui/PageEntrance';
import { EASE_QUICK, SPRING_SOFT } from '@/lib/motion';
import type { EmployeeOverview } from '@/lib/types';

interface EmployeesScreenProps {
  readonly employees: readonly EmployeeOverview[];
  readonly canWrite: boolean;
  readonly writeBlockedReason: string | null;
  /** Deleting reference data is admin-only, so it is gated separately. */
  readonly canDelete: boolean;
}

type Filter = 'active' | 'inactive' | 'all';

/**
 * The crew, as a team rather than a table.
 *
 * The other screens in this app are lists of *events* — logs, records, alerts —
 * and a dense striped table is right for those. People are not events. Eleven
 * names laid out as cards read as a crew you could point at; the same eleven in
 * a table read as inventory, and the actions you take on a person end up
 * squeezed into a final column instead of sitting on the person.
 *
 * So there is no summary strip here either. The counts that would have gone in
 * it are the filter itself — "9 active, 2 inactive" is more useful as something
 * you can click than as a card you cannot.
 *
 * Deactivating rather than deleting is the primary action, and that is a data
 * decision as much as a UI one: a worker who has left still has logs, and those
 * logs are compliance records with their name on them.
 */
export function EmployeesScreen({
  employees,
  canWrite,
  writeBlockedReason,
  canDelete,
}: EmployeesScreenProps) {
  const [filter, setFilter] = useState<Filter>('active');
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<EmployeeOverview | null>(null);
  const [busy, startWrite] = useTransition();
  const toast = useToast();

  const counts = useMemo(
    () => ({
      all: employees.length,
      active: employees.filter((person) => person.isActive).length,
      inactive: employees.filter((person) => !person.isActive).length,
    }),
    [employees]
  );

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return employees
      .filter((person) =>
        filter === 'all' ? true : filter === 'active' ? person.isActive : !person.isActive
      )
      .filter((person) => (needle ? person.name.toLowerCase().includes(needle) : true));
  }, [employees, filter, query]);

  const run = (task: () => Promise<{ success: boolean; error?: string }>) => {
    startWrite(async () => {
      const result = await task();
      if (!result.success && result.error) toast.show({ tone: 'error', message: result.error });
    });
  };

  return (
    <>
      <PageEntrance index={1}>
        <div className="flex w-full flex-col gap-[14px] self-stretch pb-[4px] md:flex-row md:items-center md:justify-between">
          <LayoutGroup>
            <div className="flex items-center gap-[6px]">
              {(['active', 'inactive', 'all'] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  aria-pressed={filter === key}
                  className="relative rounded-[80px] px-[14px] py-[7px] text-[14px] font-normal leading-[1.3] outline-none focus-visible:ring-2 focus-visible:ring-black/30"
                >
                  {filter === key ? (
                    <motion.span
                      layoutId="crew-filter"
                      transition={SPRING_SOFT}
                      className="absolute inset-0 rounded-[80px] bg-black"
                    />
                  ) : null}
                  <span
                    className={`relative capitalize ${filter === key ? 'text-white' : 'text-[#4D4D4D]'}`}
                  >
                    {key}
                    <span className="pl-[6px] tabular-nums opacity-60">{counts[key]}</span>
                  </span>
                </button>
              ))}
            </div>
          </LayoutGroup>

          <div className="flex items-center gap-[10px]">
            <label className="flex items-center gap-[8px] rounded-[80px] bg-white px-[14px] py-[8px] shadow-chip">
              <Icon name="search" className="text-[#B3B3B3]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find someone"
                aria-label="Find someone"
                className="w-[150px] bg-transparent text-[14px] font-normal leading-[1.3] text-black outline-none placeholder:text-[#B3B3B3]"
              />
            </label>

            {canWrite ? (
              <motion.button
                type="button"
                onClick={() => setAdding(true)}
                whileHover={{ y: -1, scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                transition={SPRING_SOFT}
                className="flex shrink-0 items-center gap-[6px] whitespace-nowrap rounded-[80px] bg-black px-[14px] py-[8px] text-[14px] font-normal leading-[1.3] text-white shadow-chip"
              >
                <Icon name="plus" />
                Add worker
              </motion.button>
            ) : (
              <span className="text-[13px] font-normal leading-[1.3] text-[#4D4D4D]">
                {writeBlockedReason}
              </span>
            )}
          </div>
        </div>
      </PageEntrance>


      <PageEntrance index={2}>
        {shown.length === 0 ? (
          <div className="w-full self-stretch rounded-[20px] bg-white shadow-panel">
            <EmptyState
              icon="users"
              title={query ? 'Nobody matches that name' : `No ${filter} workers`}
              body={
                query
                  ? 'Clear the search to see the rest of the crew.'
                  : 'Workers appear here once they are added. Their names become the EMPLOYEE column on every log.'
              }
            />
          </div>
        ) : (
          <LayoutGroup>
            <motion.section
              layout
              aria-label="Crew"
              className="grid w-full grid-cols-1 gap-[10px] self-stretch sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
            >
              <AnimatePresence mode="popLayout" initial={false}>
                {shown.map((person) => (
                  <PersonCard
                    key={person.id}
                    person={person}
                    canWrite={canWrite}
                    canDelete={canDelete}
                    busy={busy}
                    onRename={() => setRenaming(person)}
                    onToggleActive={() =>
                      run(() => updateEmployee(person.id, person.name, !person.isActive))
                    }
                    onRemove={() => run(() => deleteEmployee(person.id))}
                  />
                ))}
              </AnimatePresence>
            </motion.section>
          </LayoutGroup>
        )}
      </PageEntrance>

      <NameDialog
        open={adding}
        title="Add worker"
        label="Full name"
        initial=""
        submitLabel="Add worker"
        onClose={() => setAdding(false)}
        onSubmit={(name) => createEmployee(name)}
      />

      <NameDialog
        open={renaming !== null}
        title="Rename worker"
        label="Full name"
        initial={renaming?.name ?? ''}
        submitLabel="Save name"
        onClose={() => setRenaming(null)}
        onSubmit={(name) =>
          renaming
            ? updateEmployee(renaming.id, name, renaming.isActive)
            : Promise.resolve({ success: false as const, error: 'No worker selected.' })
        }
      />
    </>
  );
}
