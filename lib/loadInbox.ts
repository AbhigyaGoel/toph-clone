import { findRateAnomalies } from '@/lib/anomaly';
import { anomalyItems, logItems, mergeItems, restrictionItems, sortInbox } from '@/lib/inbox';
import {
  findApplicationRecordsForLogs,
  findProducts,
  findRateObservations,
  findRestrictedFields,
} from '@/lib/repositories/applications';
import { findExceptionInputs, findLogDetails } from '@/lib/repositories/logs';
import { findOrganization } from '@/lib/repositories/organization';
import { findReferenceData } from '@/lib/repositories/reference';
import type { InboxItem, LogDetail, Product, ReferenceData } from '@/lib/types';

export interface InboxData {
  readonly items: readonly InboxItem[];
  /** How many of them a person could clear from the inbox itself. */
  readonly actionable: number;
  /** Detail for the rows the URL asks to be open. */
  readonly details: readonly LogDetail[];
  readonly products: readonly Product[];
  readonly reference: ReferenceData;
}

/**
 * Everything waiting on the manager, plus the detail to act on it here.
 *
 * The detail load is what makes this screen a worklist rather than a menu.
 * Opening an item used to mean navigating to the dashboard and hunting for a
 * row a thousand pixels down the table — which is the same complaint as "it
 * just took me to the dashboard", one screen further along. An item now opens
 * where it is.
 *
 * Only the rows the URL names are fetched, so a full inbox costs one list query
 * and nothing more until something is opened.
 */
export async function loadInbox(open: readonly string[]): Promise<InboxData> {
  const organization = await findOrganization();

  const [inputs, restricted, details, products, reference, rates] = await Promise.all([
    findExceptionInputs(organization.id),
    findRestrictedFields(organization.id),
    findLogDetails(organization.id, open),
    findProducts(organization.id),
    findReferenceData(organization.id),
    findRateObservations(organization.id),
  ]);

  const recordsByLog = await findApplicationRecordsForLogs(
    organization.id,
    inputs.map((input) => input.logId)
  );

  const items = sortInbox([
    ...restrictionItems(restricted),
    ...mergeItems(
      logItems(inputs.map((input) => ({ ...input, records: recordsByLog.get(input.logId) ?? [] }))),
      anomalyItems(findRateAnomalies(rates))
    ),
  ]);

  return {
    items,
    actionable: items.filter((item) => item.actionable).length,
    details,
    products,
    reference,
  };
}
