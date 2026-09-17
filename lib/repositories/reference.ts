import { z } from 'zod';

import { getSupabase, RepositoryError } from '@/lib/supabase/server';
import type { ReferenceData, ReferenceItem } from '@/lib/types';

/**
 * The reference rows behind the table's columns, with their usage counts.
 *
 * PostgREST returns an embedded aggregate as `[{ count: n }]`, so each shape is
 * normalised here rather than in the components. The counts exist so the
 * management screen can refuse a delete that would break a log *before*
 * attempting it — the foreign keys restrict rather than cascade, deliberately:
 * losing eleven logs because someone tidied up a field name would be worse than
 * being told to reassign them first.
 */

const countSchema = z.array(z.object({ count: z.number() })).max(1);

const toCount = (rows: z.infer<typeof countSchema>): number => rows[0]?.count ?? 0;

const employeeSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string(),
  is_active: z.boolean(),
  activity_logs: countSchema,
});

const namedSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  activity_logs: countSchema,
});

/** Activity types carry one extra fact: whether the work owes a product record. */
const activitySchema = namedSchema.extend({ requires_product: z.boolean() });

const tagSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  log_tags: countSchema,
});

export async function findReferenceData(orgId: string): Promise<ReferenceData> {
  const supabase = getSupabase();

  const [employees, fields, activityTypes, tags] = await Promise.all([
    supabase
      .from('employees')
      .select('id, full_name, is_active, activity_logs(count)')
      .eq('org_id', orgId)
      .order('full_name'),
    supabase
      .from('fields')
      .select('id, name, activity_logs(count)')
      .eq('org_id', orgId)
      .order('name'),
    supabase
      .from('activity_types')
      .select('id, name, requires_product, activity_logs(count)')
      .order('name'),
    supabase.from('tags').select('id, name, log_tags(count)').eq('org_id', orgId).order('name'),
  ]);

  const failed = [employees, fields, activityTypes, tags].find((result) => result.error);
  if (failed?.error) {
    throw new RepositoryError('findReferenceData', failed.error.message);
  }

  const toNamed = (row: z.infer<typeof namedSchema>): ReferenceItem => ({
    id: row.id,
    name: row.name,
    logCount: toCount(row.activity_logs),
  });

  return {
    employees: z
      .array(employeeSchema)
      .parse(employees.data)
      .map((row) => ({
        id: row.id,
        name: row.full_name,
        logCount: toCount(row.activity_logs),
        isActive: row.is_active,
      })),
    fields: z.array(namedSchema).parse(fields.data).map(toNamed),
    activityTypes: z
      .array(activitySchema)
      .parse(activityTypes.data)
      .map((row) => ({ ...toNamed(row), requiresProduct: row.requires_product })),
    tags: z
      .array(tagSchema)
      .parse(tags.data)
      .map((row) => ({ id: row.id, name: row.name, logCount: toCount(row.log_tags) })),
  };
}
