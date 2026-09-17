-- Proof that the trail is *complete*, not merely unaltered.
--
-- The hash chain answers "has anyone edited the history?" It does not answer
-- the harder question: "did anything happen that the history never mentions?"
-- Until now nothing did. The application wrote its own audit events, so an
-- application that forgot — a new action shipped without the call, a bug, a
-- compromised deploy — produced a trail that was internally consistent and
-- quietly incomplete. That is the failure mode an auditor actually cares about.
--
-- This table is written by triggers on the audited tables themselves, so it
-- counts every change regardless of what made it: the app, a migration, or
-- somebody at a psql prompt. The trail is then checked against it. A count that
-- exceeds the number of recorded events is a change nobody wrote down, and
-- `audit_coverage` names the record it happened to.
--
-- Deliberately not foreign-keyed to the rows it witnesses: when a record is
-- deleted, the evidence that it changed five times must outlive it.
create table public.audit_witness (
  org_id           uuid not null references public.organizations (id) on delete cascade,
  entity_type      text not null,
  entity_id        uuid not null,
  changes          bigint not null default 0,
  last_changed_at  timestamptz not null default now(),
  primary key (org_id, entity_type, entity_id)
);

create index audit_witness_org_idx on public.audit_witness (org_id, last_changed_at desc);

/**
 * Counts one change against the row that changed.
 *
 * The entity's organisation is passed as a trigger argument where the table
 * carries `org_id`, and looked up through the parent log where it does not —
 * `applications` and `recordings` inherit their tenant rather than storing it.
 */
create or replace function public.witness_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  entity   text := tg_argv[0];
  row_id   uuid;
  owner    uuid;
begin
  if tg_op = 'DELETE' then
    row_id := old.id;
  else
    row_id := new.id;
  end if;

  if entity in ('log', 'product') then
    owner := case when tg_op = 'DELETE' then old.org_id else new.org_id end;
  else
    -- applications and recordings hang off a log; take the tenant from it.
    select l.org_id into owner
    from public.activity_logs l
    where l.id = case when tg_op = 'DELETE' then old.log_id else new.log_id end;
  end if;

  if owner is null then
    return coalesce(new, old);
  end if;

  insert into public.audit_witness (org_id, entity_type, entity_id, changes, last_changed_at)
  values (owner, entity, row_id, 1, now())
  on conflict (org_id, entity_type, entity_id)
  do update set changes = public.audit_witness.changes + 1, last_changed_at = now();

  return coalesce(new, old);
end;
$$;

create trigger activity_logs_witness
  after insert or update or delete on public.activity_logs
  for each row execute function public.witness_change('log');

create trigger applications_witness
  after insert or update or delete on public.applications
  for each row execute function public.witness_change('application');

create trigger products_witness
  after insert or update or delete on public.products
  for each row execute function public.witness_change('product');

create trigger recordings_witness
  after insert or update or delete on public.recordings
  for each row execute function public.witness_change('recording');

alter table public.audit_witness enable row level security;
create policy "public read" on public.audit_witness for select to anon, authenticated using (true);
revoke insert, update, delete on public.audit_witness from anon, authenticated;
