-- A tamper-evident record of every change made to a compliance record.
--
-- Why this exists at all: the product's whole claim is that a farm can answer an
-- inspector. "Here is the spray record" is only half an answer — the other half
-- is "and here is what it said before someone edited it, who edited it, and
-- when". Until now the application could change an application record's rate
-- and leave no trace whatsoever, which is precisely the gap a paper logbook
-- does not have.
--
-- Why a hash chain rather than a plain log: an append-only table proves nothing
-- on its own, because anyone with database credentials can delete a row and
-- renumber. Each event here carries the digest of the event before it, so
-- removing or altering any event breaks every link after it, and
-- `verify_audit_chain` finds the break in one pass. It does not make tampering
-- impossible — nothing at this layer can — it makes tampering *evident*, which
-- is the property an auditor actually needs.

create extension if not exists pgcrypto with schema extensions;

create type public.audit_action as enum ('create', 'update', 'delete', 'restore');

create table public.audit_events (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  -- Position in this organisation's chain. Gapless by construction: the trigger
  -- assigns it from the previous event, so a deleted row leaves a visible hole
  -- rather than closing silently over itself.
  seq           bigint not null,
  -- Null for events the pipeline raised on its own — a voice upload that filed
  -- a log with nobody at a keyboard. The distinction matters to a reviewer.
  actor_id      uuid references public.members (id) on delete set null,
  -- Denormalised deliberately. An actor can leave the organisation and their
  -- member row can go; the trail still has to say who it was at the time.
  actor_label   text not null,
  action        public.audit_action not null,
  entity_type   text not null,
  entity_id     uuid not null,
  -- One line a person can read without expanding anything.
  summary       text not null,
  -- Only the fields that actually changed, as { field: { from, to } }. Storing
  -- whole rows would bloat the table and bury the change in unchanged noise.
  changes       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  prev_hash     bytea,
  hash          bytea not null,

  constraint audit_events_org_seq_key unique (org_id, seq),
  constraint audit_events_entity_type_check
    check (entity_type in ('log', 'application', 'product', 'employee', 'field', 'activity_type', 'tag', 'recording', 'member'))
);

-- The two ways this table is read: one entity's history, and the org's feed.
create index audit_events_entity_idx  on public.audit_events (org_id, entity_type, entity_id, seq desc);
create index audit_events_org_seq_idx on public.audit_events (org_id, seq desc);
create index audit_events_actor_idx   on public.audit_events (actor_id) where actor_id is not null;

/**
 * Assigns the sequence number and links the event to the one before it.
 *
 * In the trigger rather than the application because the chain is worthless if
 * a caller can choose its own `prev_hash`. Anything that inserts — the app, a
 * migration, someone at a psql prompt — gets linked whether it meant to or not.
 */
create or replace function public.link_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  previous public.audit_events%rowtype;
begin
  -- Serialised per organisation. Two concurrent writes must not read the same
  -- tail and produce two events claiming the same predecessor; the advisory
  -- lock is held to the end of the transaction and costs nothing at this write
  -- rate. `hashtext` narrows the uuid to the bigint the lock API takes.
  perform pg_advisory_xact_lock(hashtext('audit_events:' || new.org_id::text));

  select * into previous
  from public.audit_events
  where org_id = new.org_id
  order by seq desc
  limit 1;

  new.seq := coalesce(previous.seq, 0) + 1;
  new.prev_hash := previous.hash;
  new.created_at := coalesce(new.created_at, now());

  -- Every field that carries meaning goes into the digest. A field left out
  -- could be edited without breaking the chain, which would make the guarantee
  -- a half-truth.
  new.hash := extensions.digest(
    coalesce(encode(previous.hash, 'hex'), '') ||
    new.org_id::text || '|' ||
    new.seq::text || '|' ||
    coalesce(new.actor_id::text, '') || '|' ||
    new.actor_label || '|' ||
    new.action::text || '|' ||
    new.entity_type || '|' ||
    new.entity_id::text || '|' ||
    new.summary || '|' ||
    new.changes::text || '|' ||
    to_char(new.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.USOF'),
    'sha256'
  );

  return new;
end;
$$;

create trigger audit_events_link
  before insert on public.audit_events
  for each row execute function public.link_audit_event();

/**
 * Walks an organisation's chain and reports the first event that does not hold.
 *
 * Returns no rows when the trail is intact. Deliberately recomputes every
 * digest rather than trusting a stored flag — a flag is just one more thing an
 * attacker would set.
 */
create or replace function public.verify_audit_chain(target_org uuid)
returns table (broken_seq bigint, reason text)
language plpgsql
stable
security definer
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

alter table public.audit_events enable row level security;

-- Readable by anyone who can read the farm's data — the trail is the point, and
-- hiding it from the people it protects would be backwards.
create policy "public read" on public.audit_events for select to anon, authenticated using (true);

-- Append-only, and enforced here rather than by convention: no update policy and
-- no delete policy exist, so PostgREST refuses both regardless of what the
-- application asks for. Correcting a mistaken event means appending a
-- correction, which is how a ledger has always worked.
create policy "service insert" on public.audit_events for insert to anon, authenticated with check (true);

revoke update, delete on public.audit_events from anon, authenticated;
