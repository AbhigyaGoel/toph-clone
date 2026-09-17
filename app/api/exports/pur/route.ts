import type { NextRequest } from 'next/server';

import { apiError, apiFile } from '@/lib/apiResponse';
import { exportFilename, toCsv } from '@/lib/csv';
import { logger } from '@/lib/logger';
import { findApplicationRecords } from '@/lib/repositories/applications';
import { currentViewer } from '@/lib/viewer';
import type { ApplicationRecord } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * The Pesticide Use Report, as a file.
 *
 * This is the end of the loop the whole product exists to close. A worker talks
 * into a phone in a field; a month later the county agricultural commissioner
 * wants every application on paper. California requires that monthly, by the
 * 10th, for every agricultural pesticide use in the state — and FSMA requires
 * records producible within 24 hours of an inspector asking. Between those two
 * obligations sits a grower with a shoebox of notes.
 *
 * The columns are the ones a PUR asks for: when, who applied it, where, on what
 * crop, over how many acres, which registered product, and how much. Names
 * match the regulator's vocabulary rather than this schema's, because the
 * person opening the file is filling in a form, not reading our database.
 *
 * Only complete records ship. An application with no rate or no EPA number is
 * not a row a commissioner can accept, and submitting it invites the
 * recordkeeping violation the report exists to avoid — so those are counted at
 * the foot of the file instead, where the grower can see exactly how many they
 * have left to fix.
 */

/** A record a county would accept: registered, measured, and attributable. */
function isSubmittable(record: ApplicationRecord): boolean {
  return (
    record.rate > 0 &&
    record.areaAcres !== null &&
    Boolean(record.applicator) &&
    // Fertilizers and soil amendments are not pesticides and are not reported;
    // a chemical without its registration number cannot be.
    (record.kind !== 'chemical' || Boolean(record.epaRegistration))
  );
}

export async function GET(request: NextRequest) {
  try {
    const viewer = await currentViewer();
    if (!viewer.member) {
      return apiError('unauthorised', 'Sign in to export.');
    }

    const from = request.nextUrl.searchParams.get('from');
    const to = request.nextUrl.searchParams.get('to');

    const records = await findApplicationRecords(viewer.organization.id, {
      from: from ?? undefined,
      to: to ?? undefined,
    });

    // A PUR covers pesticide applications. Fertilizer goes in a nutrient plan,
    // which is a different form to a different office.
    const pesticides = records.filter((record) => record.kind === 'chemical');
    const ready = pesticides.filter(isSubmittable);
    const held = pesticides.length - ready.length;

    const rows = ready.map((record) => [
      new Date(record.startedAt).toISOString().slice(0, 10),
      new Date(record.startedAt).toISOString().slice(11, 16),
      record.applicator,
      record.fieldName,
      record.activityName,
      record.areaAcres ?? '',
      record.epaRegistration ?? '',
      record.productName,
      record.rate,
      record.rateUnit,
      // Total applied is what the form asks for; the rate is per acre.
      record.areaAcres === null ? '' : Number((record.rate * record.areaAcres).toFixed(2)),
      record.windSpeedMph ?? '',
      record.airTempF ?? '',
    ]);

    const csv = toCsv(
      [
        'Application date',
        'Start time',
        'Operator',
        'Site / field ID',
        'Application method',
        'Acres treated',
        'EPA registration no.',
        'Product name',
        'Rate',
        'Rate unit',
        'Total applied',
        'Wind speed (mph)',
        'Air temp (F)',
      ],
      rows
    );

    // Appended as a comment row rather than omitted: a grower who exports 40
    // rows needs to know whether that was all of them, and a silent filter is
    // how a farm finds out in August that March was never reported.
    const footer =
      held > 0
        ? `\n"","${held} pesticide ${held === 1 ? 'application was' : 'applications were'} excluded — incomplete records. Fix them in the Audit Manager and export again."\n`
        : '\n"","All pesticide applications in this period are complete and included."\n';

    return apiFile(csv + footer, 'text/csv; charset=utf-8', exportFilename('pesticide-use-report'));
  } catch (error: unknown) {
    logger.error('exports:pur', error);
    return apiError('server_error', 'That report could not be generated.');
  }
}
