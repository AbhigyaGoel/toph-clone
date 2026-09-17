-- The witness only sees changes made after it existed, so the events it is
-- compared against have to be scoped the same way. Without this, historical
-- events — the seeded trail, anything recorded before this table shipped —
-- count towards covering changes that happened long afterwards, and a genuine
-- omission is masked by an unrelated entry from last month.
alter table public.audit_witness
  add column if not exists first_seen_at timestamptz not null default now();

/**
 * Records that changed more times than the trail says.
 *
 * Returns nothing when every change has an entry. A positive `unrecorded` is
 * not necessarily malice — a crashed request between the write and its audit
 * insert produces one — but it is always something a compliance officer is
 * entitled to see rather than have smoothed over.
 */
create or replace function public.audit_coverage(target_org uuid)
returns table (
  entity_type  text,
  entity_id    uuid,
  changes      bigint,
  recorded     bigint,
  unrecorded   bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    w.entity_type,
    w.entity_id,
    w.changes,
    coalesce(e.recorded, 0) as recorded,
    w.changes - coalesce(e.recorded, 0) as unrecorded
  from public.audit_witness w
  left join lateral (
    select count(*) as recorded
    from public.audit_events a
    where a.org_id = target_org
      and a.entity_type = w.entity_type
      and a.entity_id = w.entity_id
      -- A small grace on the lower bound: the application records its event a
      -- moment *after* the write that the trigger counted, and both orderings
      -- turn up under clock skew between statements.
      and a.created_at >= w.first_seen_at - interval '5 seconds'
  ) e on true
  where w.org_id = target_org
    and w.changes > coalesce(e.recorded, 0)
  order by (w.changes - coalesce(e.recorded, 0)) desc, w.last_changed_at desc
  limit 50;
$$;
