import { findRateAnomalies } from '@/lib/anomaly';
import {
  anomalyItems,
  logItems,
  mergeItems,
  restrictionItems,
  sortInbox,
  summarise,
  type AttentionSummary,
} from '@/lib/inbox';
import { parseLogQuery, type LogQuery, type RawSearchParams } from '@/lib/logQuery';
import {
  findApplicationRecords,
  findProducts,
  findRestrictedFields,
} from '@/lib/repositories/applications';
import { findExceptionInputs, findLogDetails, findLogInputs, findLogs } from '@/lib/repositories/logs';
import { findOrganization } from '@/lib/repositories/organization';
import { filterOptionsFrom, findReferenceData } from '@/lib/repositories/reference';
import { findDashboardStats } from '@/lib/repositories/stats';
import type {
  ActivityLog,
  ApplicationRecord,
  DashboardStats,
  FilterOptions,
  LogDetail,
  LogInput,
  Organization,
  Product,
  ReferenceData,
} from '@/lib/types';

export interface DashboardData {
  readonly organization: Organization;
  readonly stats: DashboardStats;
  readonly filterOptions: FilterOptions;
  readonly reference: ReferenceData;
  readonly query: LogQuery;
  readonly logs: readonly ActivityLog[];
  /** One entry per open row that still exists, in no particular order. */
  readonly details: readonly LogDetail[];
  /** The same logs in the edit form's shape, keyed by id. */
  readonly editables: Readonly<Record<string, LogInput>>;
  /** The product register, so a compliance record can be filed from a row. */
  readonly products: readonly Product[];
  /**
   * How much is waiting, for the banner — not the list itself.
   *
   * Computed from the same functions the Inbox uses, so the dashboard cannot
   * disagree with the screen it is pointing at.
   */
  readonly attention: AttentionSummary;
  /**
   * Ids of logs with something wrong, so the table can mark the rows.
   *
   * A plain array rather than a `Set` because this crosses into a client
   * component and that boundary serialises.
   */
  readonly flaggedLogIds: readonly string[];
}

/**
 * Everything the dashboard needs, fetched in one place.
 *
 * The organisation resolves first because every other query is scoped to it;
 * the rest run in parallel. Details for the open rows are fetched alongside the
 * list rather than after it — the table can already draw the panel's frame from
 * the row it belongs to, so the only thing a second round trip would buy is a
 * later paint.
 *
 * Both collections are plain arrays and objects rather than `Map`s: they cross
 * the server/client boundary into the table, and that boundary serialises.
 *
 * `reference` is the editable side of the same data `filterOptions` exposes for
 * reading — ids and usage counts rather than bare names. They are kept separate
 * on purpose: the filter menus want a flat list of labels, and handing them
 * rows with counts would push presentation decisions into the toolbar.
 */
export async function loadDashboard(searchParams: RawSearchParams): Promise<DashboardData> {
  const organization = await findOrganization();
  const query = parseLogQuery(searchParams);

  const [
    stats,
    reference,
    logs,
    details,
    inputs,
    products,
    exceptionInputs,
    restricted,
    applications,
  ] = await Promise.all([
    findDashboardStats(organization.id),
    findReferenceData(organization.id),
    findLogs(organization.id, query),
    findLogDetails(organization.id, query.open),
    findLogInputs(organization.id, query.open),
    findProducts(organization.id),
    findExceptionInputs(organization.id),
    findRestrictedFields(organization.id),
    findApplicationRecords(organization.id),
  ]);

  /*
   * One read of the register, used twice.
   *
   * The compliance checks needed the records grouped by log, and the anomaly
   * baseline needed the same rows as a flat list. They were two queries — and
   * the grouped one ran *after* the batch above, because it took its log ids
   * from `exceptionInputs`. That made it a serial round trip on the critical
   * path of every navigation, including opening a row, where the only thing
   * actually new is one log's detail. Expanding a row measured about a second
   * on Vercel, and this was a guaranteed slice of it.
   *
   * The register is the smallest table the farm has — one row per product per
   * application — so reading it whole costs less than the extra trip did.
   */
  const recordsByLog = new Map<string, ApplicationRecord[]>();
  for (const record of applications) {
    const bucket = recordsByLog.get(record.logId);
    if (bucket) bucket.push(record);
    else recordsByLog.set(record.logId, [record]);
  }

  const rates = applications.map((record) => ({
    applicationId: record.id,
    logId: record.logId,
    employeeId: record.applicator,
    employeeName: record.applicator,
    productId: record.productId,
    productName: record.productName,
    rateUnit: record.rateUnit,
    rate: record.rate,
    appliedAt: record.startedAt,
    fieldName: record.fieldName,
  }));

  const attention = summarise(
    sortInbox([
      ...restrictionItems(restricted),
      ...mergeItems(
        logItems(
          exceptionInputs.map((input) => ({
            ...input,
            records: recordsByLog.get(input.logId) ?? [],
          }))
        ),
        anomalyItems(findRateAnomalies(rates))
      ),
    ])
  );

  return {
    organization,
    stats,
    filterOptions: filterOptionsFrom(reference),
    reference,
    query,
    logs,
    details,
    editables: Object.fromEntries(inputs),
    products,
    attention,
    flaggedLogIds: attention.flaggedLogIds,
  };
}
