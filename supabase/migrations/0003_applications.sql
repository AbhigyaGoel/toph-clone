-- ---------------------------------------------------------------------------
-- What was applied to the field.
--
-- The brief describes Toph's most common use case as logging "what
-- fertilizer/chemical is used on what fields", and the platform's own material
-- is about turning field activity into audit-ready compliance records. Neither
-- was representable: a log knew who, where, when and what kind of work, but not
-- the substance. These two tables close that, and are what the Audit Manager
-- reads.
-- ---------------------------------------------------------------------------

create type public.product_kind as enum ('chemical', 'fertilizer', 'amendment');

-- The farm's product list. Rates and intervals belong to the product, not to
-- the application: REI and PHI are properties of the registered label, so
-- storing them per-application would let two records of the same product
-- disagree about the law.
create table public.products (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations (id) on delete cascade,
  name               text not null,
  kind               public.product_kind not null,
  -- EPA registration number. Required on a pesticide label and on the record;
  -- null for a fertilizer, which is why completeness is checked per kind.
  epa_registration   text,
  active_ingredient  text,
  rate_unit          text not null,
  -- Restricted-entry interval, in hours after application.
  rei_hours          integer check (rei_hours >= 0),
  -- Pre-harvest interval, in days.
  phi_days           integer check (phi_days >= 0),
  created_at         timestamptz not null default now(),
  unique (org_id, name)
);

-- One product applied during one log. A tank mix is several rows against the
-- same log, which is why the key is the pair rather than the log alone.
create table public.applications (
  id              uuid primary key default gen_random_uuid(),
  log_id          uuid not null references public.activity_logs (id) on delete cascade,
  product_id      uuid not null references public.products (id),
  rate            numeric(10, 3) not null check (rate > 0),
  area_acres      numeric(10, 2) check (area_acres > 0),
  -- Conditions at application. A pesticide record is not complete without them,
  -- and they are the first thing an inspector asks about drift.
  wind_speed_mph  numeric(5, 1) check (wind_speed_mph >= 0),
  air_temp_f      numeric(5, 1),
  created_at      timestamptz not null default now(),
  unique (log_id, product_id)
);

create index applications_log_idx     on public.applications (log_id);
create index applications_product_idx on public.applications (product_id);
create index products_org_idx         on public.products (org_id);

-- ---------------------------------------------------------------------------
-- The compliance register, pre-joined.
--
-- REI and PHI are derived here rather than in the app: they are a function of
-- the log's clock and the product's label, and computing them in one place
-- means the Audit Manager, the Map's re-entry warnings and the Schedule cannot
-- disagree about when a field is safe.
-- ---------------------------------------------------------------------------
create view public.application_records
  with (security_invoker = true) as
select
  a.id,
  l.org_id,
  a.log_id,
  l.started_at,
  l.ended_at,
  l.status,
  e.full_name      as applicator,
  f.id             as field_id,
  f.name           as field_name,
  act.name         as activity_name,
  p.id             as product_id,
  p.name           as product_name,
  p.kind,
  p.epa_registration,
  p.active_ingredient,
  p.rate_unit,
  p.rei_hours,
  p.phi_days,
  a.rate,
  a.area_acres,
  a.wind_speed_mph,
  a.air_temp_f,
  l.ended_at + make_interval(hours => coalesce(p.rei_hours, 0)) as rei_expires_at,
  (l.started_at at time zone 'UTC')::date + coalesce(p.phi_days, 0)  as phi_clears_on
from public.applications a
join public.activity_logs  l   on l.id   = a.log_id
join public.employees      e   on e.id   = l.employee_id
join public.fields         f   on f.id   = l.field_id
join public.activity_types act on act.id = l.activity_type_id
join public.products       p   on p.id   = a.product_id;

-- Same posture as every other table: readable by the anon role, writable only
-- through a Server Action holding the secret key.
alter table public.products     enable row level security;
alter table public.applications enable row level security;

create policy "public read" on public.products     for select to anon, authenticated using (true);
create policy "public read" on public.applications for select to anon, authenticated using (true);
