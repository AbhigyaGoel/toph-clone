-- Closing three findings from the Supabase security advisor.
--
-- `verify_audit_chain` does not need elevated rights: `audit_events` already
-- grants select to the same roles that call it, so SECURITY INVOKER gives the
-- identical answer without an exposed definer function on the REST surface.
create or replace function public.verify_audit_chain(target_org uuid)
returns table (broken_seq bigint, reason text)
language plpgsql
stable
security invoker
set search_path = public, extensions
as $$
declare
  event        public.audit_events%rowtype;
  expected_seq bigint := 0;
  last_hash    bytea := null;
  recomputed   bytea;
begin
  for event in
    select * from public.audit_events where org_id = target_org order by seq
  loop
    expected_seq := expected_seq + 1;

    if event.seq <> expected_seq then
      return query select event.seq, format('expected sequence %s, found %s', expected_seq, event.seq);
      return;
    end if;

    if event.prev_hash is distinct from last_hash then
      return query select event.seq, 'does not follow the previous event'::text;
      return;
    end if;

    recomputed := extensions.digest(
      coalesce(encode(last_hash, 'hex'), '') ||
      event.org_id::text || '|' ||
      event.seq::text || '|' ||
      coalesce(event.actor_id::text, '') || '|' ||
      event.actor_label || '|' ||
      event.action::text || '|' ||
      event.entity_type || '|' ||
      event.entity_id::text || '|' ||
      event.summary || '|' ||
      event.changes::text || '|' ||
      to_char(event.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.USOF'),
      'sha256'
    );

    if recomputed <> event.hash then
      return query select event.seq, 'contents do not match the recorded digest'::text;
      return;
    end if;

    last_hash := event.hash;
  end loop;
end;
$$;

-- `link_audit_event` stays SECURITY DEFINER — it must read the chain's tail
-- regardless of who is inserting — but it is a trigger function and has no
-- business being reachable as an RPC. Calling it outside a trigger would error
-- anyway; revoking EXECUTE takes it off the REST surface entirely.
revoke execute on function public.link_audit_event() from anon, authenticated, public;

-- A trigger function with a mutable search_path can be made to resolve `now()`
-- or an operator to something else by whoever sets the session path.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
