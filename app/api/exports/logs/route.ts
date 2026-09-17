import type { NextRequest } from 'next/server';

import { apiError, apiFile } from '@/lib/apiResponse';

import { exportFilename, toCsv } from '@/lib/csv';
import { formatLogDate, formatTimeRange } from '@/lib/format';
import { logger } from '@/lib/logger';
import { parseLogQuery } from '@/lib/logQuery';
import { findLogCompliance } from '@/lib/repositories/applications';
import { findLogs } from '@/lib/repositories/logs';
import { currentViewer } from '@/lib/viewer';

export const dynamic = 'force-dynamic';

/**
 * The Activity Logs screen's export.
 *
 * A route handler rather than building the file in the browser, for three
 * reasons that all matter in an audit context: the export is the *query's*
 * result rather than whatever the page happened to have rendered, so it cannot
 * silently omit rows a future pagination would hold back; it is a URL, so it can
 * be scripted, bookmarked or handed to an accountant; and it goes through the
 * same repository and the same tenant scoping as the screen, so the two cannot
 * drift apart.
 *
 * Reading is allowed for every signed-in role, including `worker` — the
 * permission model restricts writing, and a crew lead exporting their own
 * season's logs is the product working as intended.
 */
export async function GET(request: NextRequest) {

  try {
    const viewer = await currentViewer();
    if (!viewer.member) {
      return apiError('unauthorised', 'Sign in to export.');
    }

    const query = parseLogQuery(Object.fromEntries(request.nextUrl.searchParams.entries()));
    const logs = await findLogs(viewer.organization.id, query);
    const compliance = await findLogCompliance(
      viewer.organization.id,
      logs.map((log) => log.id)
    );

    const csv = toCsv(
      ['Date', 'Time', 'Employee', 'Activity', 'Field', 'Status', 'Product record'],
      logs.map((log) => {
        const state = compliance.get(log.id);
        const record = !state?.requiresProduct
          ? 'Not required'
          : state.applicationCount > 0
            ? `${state.applicationCount} recorded`
            : 'MISSING';

        return [
          formatLogDate(log.startedAt),
          formatTimeRange(log.startedAt, log.endedAt),
          log.employee,
          log.activity,
          log.field,
          log.status === 'new' ? 'Unreviewed' : 'Reviewed',
          record,
        ];
      })
    );

    return apiFile(csv, 'text/csv; charset=utf-8', exportFilename('activity-logs'));
  } catch (error: unknown) {
    logger.error('exportLogs', error);
    return apiError('server_error', 'Could not build the export.');
  }
}
