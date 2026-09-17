import { EmployeesScreen } from '@/components/employees/EmployeesScreen';
import { Screen } from '@/components/shell/Screen';
import { can } from '@/lib/permissions';
import { findEmployeeOverviews } from '@/lib/repositories/employees';
import { currentViewer } from '@/lib/viewer';

export const dynamic = 'force-dynamic';

/**
 * The crew.
 *
 * `canDelete` is passed separately from `canWrite` rather than folded into it,
 * because they genuinely differ: a manager can add and rename workers all day
 * and still should not be able to remove one. Reading the matrix here and
 * sending down two booleans keeps the permission model in `lib/permissions.ts`
 * and out of the component — the component only has to know what it may offer,
 * not why.
 */
export default async function EmployeesPage() {
  const viewer = await currentViewer();
  const employees = await findEmployeeOverviews(viewer.organization.id);

  return (
    <Screen title="Employees" subtitle="Who logs the work, and what they have logged">
      <EmployeesScreen
        employees={employees}
        canWrite={viewer.canWrite}
        writeBlockedReason={viewer.writeBlockedReason}
        canDelete={
          viewer.canWrite && viewer.member !== null && can(viewer.member.role, 'reference:delete')
        }
      />
    </Screen>
  );
}
