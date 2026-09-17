import type { NextRequest } from 'next/server';

import { apiError, apiFile } from '@/lib/apiResponse';

import { parseAuditQuery, periodBounds } from '@/lib/auditQuery';
import { formatRate, isComplete, KIND_LABELS, recordIssues } from '@/lib/compliance';
import { exportFilename, toCsv } from '@/lib/csv';
import { formatLogDate } from '@/lib/format';
import { logger } from '@/lib/logger';
import { findApplicationRecords } from '@/lib/repositories/applications';
import { currentViewer } from '@/lib/viewer';

export const dynamic = 'force-dynamic';

/**
 * The application register as a file.
 *
 * This is the artefact the whole compliance half of the product exists to
 * produce: the thing a grower hands an auditor. It carries the incomplete rows
 * *and says they are incomplete*, rather than filtering them out — an export
 * that quietly dropped the weak records would be worse than useless, because the
 * gap would only surface when somebody else found it.
 */
export async function GET(request: NextRequest) {

  try {
    const viewer = await currentViewer();
    if (!viewer.member) {
      return apiError('unauthorised', 'Sign in to export.');
    }

    const query = parseAuditQuery(Object.fromEntries(request.nextUrl.searchParams.entries()));
    const records = await findApplicationRecords(viewer.organization.id, {
      ...periodBounds(query.period),
      kind: query.kind ?? undefined,
      fieldId: query.fieldId ?? undefined,
    });

    const csv = toCsv(
      [
        'Date',
        'Field',
        'Activity',
        'Product',
        'Kind',
        'EPA registration',
        'Active ingredient',
        'Rate',
        'Treated area (acres)',
        'Applicator',
        'Wind (mph)',
        'Air temp (F)',
        'REI (hours)',
        'Re-entry clear at',
        'PHI (days)',
        'Harvest clear from',
        'Record status',
      ],
      records.map((record) => [
        formatLogDate(record.startedAt),
        record.fieldName,
        record.activityName,
        record.productName,
        KIND_LABELS[record.kind],
        record.epaRegistration,
        record.activeIngredient,
        formatRate(record),
        record.areaAcres,
        record.applicator,
        record.windSpeedMph,
        record.airTempF,
        record.reiHours,
        record.reiExpiresAt,
        record.phiDays,
        record.phiClearsOn,
        isComplete(record)
          ? 'Complete'
          : `INCOMPLETE — ${recordIssues(record)
              .map((issue) => issue.message)
              .join('; ')}`,
      ])
    );

    return apiFile(csv, 'text/csv; charset=utf-8', exportFilename('application-records'));
  } catch (error: unknown) {
    logger.error('exportRecords', error);
    return apiError('server_error', 'Could not build the export.');
  }
}
