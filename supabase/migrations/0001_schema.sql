-- Toph dashboard schema.
--
-- Every table here backs something visible on the dashboard; see README for
-- the element-by-element trace. Timestamps are stored as timestamptz and
-- formatted in the UI so that the "Date" sort and the "This Month" range are
-- real queries rather than string comparisons.

create extension if not exists pg_trgm;

create type public.member_role as enum ('admin', 'worker');
create type public.log_status as enum ('new', 'reviewed');

-- ---------------------------------------------------------------------------
-- Tenancy
-- ---------------------------------------------------------------------------

create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  avatar_url  text,
  created_at  timestamptz not null default now()
);

-- The signed-in person. There is no auth in this build, so the dashboard reads
-- the seeded admin; the table exists so the "Admin" badge is data, not a
-- string literal.
create table public.members (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  display_name  text not null,
  role          public.member_role not null default 'worker',
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------

create table public.employees (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  full_name   text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- map_plot is the field's boundary on the dashboard's satellite tile, in the
-- design's 594 x 335 pixel space: {"x", "y", "width", "height"}.
create table public.fields (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references public.organizations (id) on delete cascade,
  name      text not null,
  map_plot  jsonb not null,
  unique (org_id, name)
);

-- The guided voice log asks "spraying, fertilizing, planting, ..." — a closed
-- set, so it is a lookup table rather than free text.
create table public.activity_types (
  id    uuid primary key default gen_random_uuid(),
  name  text not null unique
);

-- ---------------------------------------------------------------------------
-- Logs
-- ---------------------------------------------------------------------------

create table public.activity_logs (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations (id) on delete cascade,
  employee_id       uuid not null references public.employees (id),
  field_id          uuid not null references public.fields (id),
  activity_type_id  uuid not null references public.activity_types (id),
  started_at        timestamptz not null,
  ended_at          timestamptz not null,
  status            public.log_status not null default 'new',
  created_at        timestamptz not null default now(),
  check (ended_at > started_at)
);

create index activity_logs_org_started_idx on public.activity_logs (org_id, started_at);
create index activity_logs_org_status_idx  on public.activity_logs (org_id, status);

-- One recording per log. `waveform` is {"amplitudes": number[98] in 0..1,
-- "voiced_bars": n} — the first n bars carry signal and render dark, the rest
-- are trailing silence. `map_pin` is {"x", "y"} in the same space as map_plot.
create table public.recordings (
  id                        uuid primary key default gen_random_uuid(),
  log_id                    uuid not null unique references public.activity_logs (id) on delete cascade,
  audio_url                 text,
  duration_seconds          integer not null,
  recorded_at               timestamptz not null,
  transcript                text not null,
  transcription_confidence  numeric(4, 3) not null check (transcription_confidence between 0 and 1),
  waveform                  jsonb not null,
  map_pin                   jsonb not null
);

create index recordings_recorded_at_idx on public.recordings (recorded_at);

-- "Add Tag" on the expanded panel.
create table public.tags (
  id      uuid primary key default gen_random_uuid(),
  org_id  uuid not null references public.organizations (id) on delete cascade,
  name    text not null,
  unique (org_id, name)
);

create table public.log_tags (
  log_id  uuid not null references public.activity_logs (id) on delete cascade,
  tag_id  uuid not null references public.tags (id) on delete cascade,
  primary key (log_id, tag_id)
);

-- ---------------------------------------------------------------------------
-- Read models
-- ---------------------------------------------------------------------------

-- One row per table row on the dashboard, pre-joined so the list query is a
-- single select. security_invoker makes the underlying RLS policies apply.
create view public.activity_log_rows
  with (security_invoker = true) as
select
  l.id,
  l.org_id,
  l.started_at,
  l.ended_at,
  l.status,
  l.created_at,
  e.full_name as employee_name,
  a.name      as activity_name,
  f.name      as field_name,
  (r.id is not null) as has_recording
from public.activity_logs l
join public.employees      e on e.id = l.employee_id
join public.activity_types a on a.id = l.activity_type_id
join public.fields         f on f.id = l.field_id
left join public.recordings r on r.log_id = l.id;

-- Trigram indexes back the search box's ILIKE queries on the joined names.
create index employees_full_name_trgm_idx  on public.employees      using gin (full_name gin_trgm_ops);
create index activity_types_name_trgm_idx  on public.activity_types using gin (name gin_trgm_ops);
create index fields_name_trgm_idx          on public.fields         using gin (name gin_trgm_ops);

-- The three stat cards plus the nav badge, derived rather than stored.
create view public.dashboard_stats
  with (security_invoker = true) as
select
  o.id as org_id,
  (
    select count(*)
    from public.recordings r
    join public.activity_logs l on l.id = r.log_id
    where l.org_id = o.id
      and r.recorded_at::date = current_date
  ) as todays_recordings,
  (
    select count(*)
    from public.activity_logs l
    where l.org_id = o.id and l.status = 'new'
  ) as new_logs,
  (
    select count(*)
    from public.employees e
    where e.org_id = o.id and e.is_active
  ) as active_workers,
  (
    select round(avg(r.transcription_confidence) * 100)
    from public.recordings r
    join public.activity_logs l on l.id = r.log_id
    where l.org_id = o.id
  ) as response_accuracy
from public.organizations o;

-- ---------------------------------------------------------------------------
-- Row Level Security: the dashboard is read-only and unauthenticated, so every
-- table is readable by the anon role and nothing is writable through the API.
-- ---------------------------------------------------------------------------

alter table public.organizations  enable row level security;
alter table public.members        enable row level security;
alter table public.employees      enable row level security;
alter table public.fields         enable row level security;
alter table public.activity_types enable row level security;
alter table public.activity_logs  enable row level security;
alter table public.recordings     enable row level security;
alter table public.tags           enable row level security;
alter table public.log_tags       enable row level security;

create policy "public read" on public.organizations  for select to anon, authenticated using (true);
create policy "public read" on public.members        for select to anon, authenticated using (true);
create policy "public read" on public.employees      for select to anon, authenticated using (true);
create policy "public read" on public.fields         for select to anon, authenticated using (true);
create policy "public read" on public.activity_types for select to anon, authenticated using (true);
create policy "public read" on public.activity_logs  for select to anon, authenticated using (true);
create policy "public read" on public.recordings     for select to anon, authenticated using (true);
create policy "public read" on public.tags           for select to anon, authenticated using (true);
create policy "public read" on public.log_tags       for select to anon, authenticated using (true);
