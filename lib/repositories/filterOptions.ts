import { z } from 'zod';

import { getSupabase, RepositoryError } from '@/lib/supabase/server';
import type { FilterOptions } from '@/lib/types';

const names = z.array(z.object({ name: z.string() }));
const fullNames = z.array(z.object({ full_name: z.string() }));

/**
 * The values the Filter menu offers. They come from the reference tables rather
 * than from the current result set so a filter can widen a search, not only
 * narrow it.
 */
export async function findFilterOptions(orgId: string): Promise<FilterOptions> {
  const supabase = getSupabase();

  const [activities, fields, employees, tags] = await Promise.all([
    supabase.from('activity_types').select('name').order('name'),
    supabase.from('fields').select('name').eq('org_id', orgId).order('name'),
    supabase.from('employees').select('full_name').eq('org_id', orgId).eq('is_active', true).order('full_name'),
    supabase.from('tags').select('name').eq('org_id', orgId).order('name'),
  ]);

  const failed = [activities, fields, employees, tags].find((result) => result.error);
  if (failed?.error) {
    throw new RepositoryError('findFilterOptions', failed.error.message);
  }

  return {
    activities: names.parse(activities.data).map((row) => row.name),
    fields: names.parse(fields.data).map((row) => row.name),
    employees: fullNames.parse(employees.data).map((row) => row.full_name),
    tags: names.parse(tags.data).map((row) => row.name),
  };
}
