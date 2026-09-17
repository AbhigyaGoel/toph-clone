import { z } from 'zod';

import type { RateObservation } from '@/lib/anomaly';
import { logger } from '@/lib/logger';
import { getSupabase, RepositoryError } from '@/lib/supabase/server';
import type { ApplicationRecord, MissingRecord, Product, RestrictedField } from '@/lib/types';

/**
 * The compliance register.
 *
 * Reads come off `application_records`, the view that pre-joins the log, the
 * worker, the field and the product and derives the two dates every screen has
 * to agree about — when the re-entry interval lifts and when the pre-harvest
 * interval clears. Postgres returns `numeric` as a string, hence the coercions.
 */

const recordSchema = z.object({
  id: z.string().uuid(),
  log_id: z.string().uuid(),
  started_at: z.string(),
  ended_at: z.string(),
  status: z.enum(['new', 'reviewed']),
  applicator: z.string(),
  field_id: z.string().uuid(),
  field_name: z.string(),
  activity_name: z.string(),
  product_id: z.string().uuid(),
  product_name: z.string(),
  kind: z.enum(['chemical', 'fertilizer', 'amendment']),
  epa_registration: z.string().nullable(),
  active_ingredient: z.string().nullable(),
  rate_unit: z.string(),
  rei_hours: z.coerce.number().int().nullable(),
  phi_days: z.coerce.number().int().nullable(),
  rate: z.coerce.number(),
  area_acres: z.coerce.number().nullable(),
  wind_speed_mph: z.coerce.number().nullable(),
  air_temp_f: z.coerce.number().nullable(),
  rei_expires_at: z.string(),
  phi_clears_on: z.string(),
});

const toRecord = (row: z.infer<typeof recordSchema>): ApplicationRecord => ({
  id: row.id,
  logId: row.log_id,
  startedAt: row.started_at,
  endedAt: row.ended_at,
  status: row.status,
  applicator: row.applicator,
  fieldId: row.field_id,
  fieldName: row.field_name,
  activityName: row.activity_name,
  productId: row.product_id,
  productName: row.product_name,
  kind: row.kind,
  epaRegistration: row.epa_registration,
  activeIngredient: row.active_ingredient,
  rateUnit: row.rate_unit,
  reiHours: row.rei_hours,
  phiDays: row.phi_days,
  rate: row.rate,
  areaAcres: row.area_acres,
  windSpeedMph: row.wind_speed_mph,
  airTempF: row.air_temp_f,
  reiExpiresAt: row.rei_expires_at,
  phiClearsOn: row.phi_clears_on,
});

export interface RecordFilter {
  /** Inclusive ISO instant. */
  readonly from?: string;
  /** Exclusive ISO instant. */
  readonly to?: string;
  readonly fieldId?: string;
  readonly kind?: ApplicationRecord['kind'];
}

/** Every application record matching a filter, newest first. */
export async function findApplicationRecords(
  orgId: string,
  filter: RecordFilter = {}
): Promise<readonly ApplicationRecord[]> {
  let request = getSupabase().from('application_records').select('*').eq('org_id', orgId);

  if (filter.from) request = request.gte('started_at', filter.from);
  if (filter.to) request = request.lt('started_at', filter.to);
  if (filter.fieldId) request = request.eq('field_id', filter.fieldId);
  if (filter.kind) request = request.eq('kind', filter.kind);

  const { data, error } = await request.order('started_at', { ascending: false });

  if (error) {
    throw new RepositoryError('findApplicationRecords', error.message);
  }

  return z.array(recordSchema).parse(data ?? []).map(toRecord);
}

const productSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  kind: z.enum(['chemical', 'fertilizer', 'amendment']),
  epa_registration: z.string().nullable(),
  active_ingredient: z.string().nullable(),
  rate_unit: z.string(),
  rei_hours: z.coerce.number().int().nullable(),
  phi_days: z.coerce.number().int().nullable(),
  applications: z.array(z.object({ count: z.number() })),
});

/** The farm's product list, with how often each has been used. */
export async function findProducts(orgId: string): Promise<readonly Product[]> {
  const { data, error } = await getSupabase()
    .from('products')
    .select(
      'id, name, kind, epa_registration, active_ingredient, rate_unit, rei_hours, phi_days, applications(count)'
    )
    .eq('org_id', orgId)
    .order('name');

  if (error) {
    throw new RepositoryError('findProducts', error.message);
  }

  return z
    .array(productSchema)
    .parse(data ?? [])
    .map((row) => ({
      id: row.id,
      name: row.name,
      kind: row.kind,
      epaRegistration: row.epa_registration,
      activeIngredient: row.active_ingredient,
      rateUnit: row.rate_unit,
      reiHours: row.rei_hours,
      phiDays: row.phi_days,
      applicationCount: row.applications[0]?.count ?? 0,
    }));
}

/**
 * The records filed against each of several logs, keyed by log id.
 *
 * One query for the open panels rather than one per panel, for the same reason
 * the tags are batched: the dashboard can have six rows expanded, and the number
 * of round trips should not be a function of that.
 */
export async function findApplicationRecordsForLogs(
  orgId: string,
  logIds: readonly string[]
): Promise<ReadonlyMap<string, readonly ApplicationRecord[]>> {
  if (logIds.length === 0) return new Map();

  const { data, error } = await getSupabase()
    .from('application_records')
    .select('*')
    .eq('org_id', orgId)
    .in('log_id', [...logIds])
    .order('product_name');

  if (error) {
    throw new RepositoryError('findApplicationRecordsForLogs', error.message);
  }

  const byLog = new Map<string, ApplicationRecord[]>();
  for (const record of z.array(recordSchema).parse(data ?? []).map(toRecord)) {
    const bucket = byLog.get(record.logId);
    if (bucket) bucket.push(record);
    else byLog.set(record.logId, [record]);
  }

  return byLog;
}

/** Whether one log owes a compliance record, and whether it has one. */
export interface LogCompliance {
  readonly requiresProduct: boolean;
  readonly applicationCount: number;
}

const coverageSchema = z.object({
  id: z.string().uuid(),
  activity_types: z.object({ requires_product: z.boolean() }),
  applications: z.array(z.object({ count: z.number() })),
});

/**
 * Which of these logs owe a record, and which have one.
 *
 * One query for the page's visible rows rather than a flag baked into the log
 * view, because "owes a record" is a policy that can change under existing rows
 * — `requires_product` moving on an activity has to re-colour every log of that
 * activity, including the ones written before the policy did.
 */
export async function findLogCompliance(
  orgId: string,
  logIds: readonly string[]
): Promise<ReadonlyMap<string, LogCompliance>> {
  if (logIds.length === 0) return new Map();

  const { data, error } = await getSupabase()
    .from('activity_logs')
    .select('id, activity_types!inner ( requires_product ), applications ( count )')
    .eq('org_id', orgId)
    .in('id', [...logIds]);

  if (error) {
    throw new RepositoryError('findLogCompliance', error.message);
  }

  return new Map(
    z.array(coverageSchema).parse(data ?? []).map((row) => [
      row.id,
      {
        requiresProduct: row.activity_types.requires_product,
        applicationCount: row.applications[0]?.count ?? 0,
      },
    ])
  );
}

const missingSchema = z.object({
  id: z.string().uuid(),
  started_at: z.string(),
  employees: z.object({ full_name: z.string() }),
  fields: z.object({ name: z.string() }),
  activity_types: z.object({ name: z.string() }),
  applications: z.array(z.object({ count: z.number() })),
});

/**
 * Logs that should have produced a record and did not.
 *
 * The register can only show what was written down; the gaps are what fails an
 * inspection. Which activities are held to this is a column on the activity
 * itself (`requires_product`), so a farm can add "Fumigating" without anyone
 * touching this query.
 *
 * Filtered in memory after the fetch because PostgREST cannot express "having
 * zero rows in an embedded relation" — the alternative is a second round trip
 * for the ids, and the set this scans is the same set the register already
 * loaded.
 */
export async function findMissingRecords(
  orgId: string,
  filter: Pick<RecordFilter, 'from' | 'to'> = {}
): Promise<readonly MissingRecord[]> {
  let request = getSupabase()
    .from('activity_logs')
    .select(
      'id, started_at, employees!inner ( full_name ), fields!inner ( name ), activity_types!inner ( name ), applications ( count )'
    )
    .eq('org_id', orgId)
    .eq('activity_types.requires_product', true);

  if (filter.from) request = request.gte('started_at', filter.from);
  if (filter.to) request = request.lt('started_at', filter.to);

  const { data, error } = await request.order('started_at', { ascending: false });

  if (error) {
    throw new RepositoryError('findMissingRecords', error.message);
  }

  return z
    .array(missingSchema)
    .parse(data ?? [])
    .filter((row) => (row.applications[0]?.count ?? 0) === 0)
    .map((row) => ({
      logId: row.id,
      startedAt: row.started_at,
      employee: row.employees.full_name,
      fieldName: row.fields.name,
      activityName: row.activity_types.name,
    }));
}

/**
 * Fields still inside a restricted-entry interval, longest first.
 *
 * Asked of the database rather than computed from loaded records because the
 * question is "which fields, across everything ever sprayed" — not "what about
 * these logs". The `application_records` view already derives `rei_expires_at`
 * from the log's end time and the product's interval, so this is one indexed
 * read of rows whose window has not closed.
 *
 * Where two products were tank-mixed, the longest interval governs: the field
 * is safe when the *last* restriction lifts, not the first.
 */
/**
 * Every filed rate, for the anomaly comparison.
 *
 * The whole register rather than a window, because "what does this person
 * normally apply" is a question about their history and a 30-day slice of it
 * would make the baseline move with the calendar. It is a narrow projection of
 * a small table — six columns over the farm's applications — not a scan of the
 * logs.
 *
 * Grouped on the applicator's name because that is what the view exposes and
 * `employees.full_name` is unique per organisation, so it identifies a person
 * as well as the id would.
 */
export async function findRateObservations(orgId: string): Promise<readonly RateObservation[]> {
  const { data, error } = await getSupabase()
    .from('application_records')
    .select('id, log_id, applicator, product_id, product_name, rate_unit, rate, started_at, field_name')
    .eq('org_id', orgId)
    .not('rate', 'is', null)
    .order('started_at', { ascending: true });

  if (error) {
    logger.error('findRateObservations', error.message);
    return [];
  }

  return (data ?? [])
    .filter((row) => row.product_id && row.applicator && row.rate !== null)
    .map((row) => ({
      applicationId: row.id as string,
      logId: row.log_id as string,
      employeeId: row.applicator as string,
      employeeName: row.applicator as string,
      productId: row.product_id as string,
      productName: row.product_name ?? 'a product',
      rateUnit: row.rate_unit ?? null,
      rate: Number(row.rate),
      appliedAt: row.started_at as string,
      fieldName: row.field_name ?? 'a field',
    }));
}

export async function findRestrictedFields(orgId: string): Promise<readonly RestrictedField[]> {
  const { data, error } = await getSupabase()
    .from('application_records')
    .select('field_id, field_name, product_name, rei_expires_at')
    .eq('org_id', orgId)
    .gt('rei_expires_at', new Date().toISOString())
    .order('rei_expires_at', { ascending: false });

  if (error) {
    logger.error('findRestrictedFields', error.message);
    return [];
  }

  const governing = new Map<string, RestrictedField>();
  for (const row of data ?? []) {
    if (!row.field_id || !row.field_name || !row.rei_expires_at) continue;
    // Ordered longest-first, so the first sighting of a field is the one that
    // governs and later rows for the same field are shorter intervals.
    if (governing.has(row.field_id)) continue;
    governing.set(row.field_id, {
      fieldId: row.field_id,
      fieldName: row.field_name,
      productName: row.product_name ?? 'an application',
      clearsAt: row.rei_expires_at,
    });
  }

  return [...governing.values()];
}
