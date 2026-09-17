-- Relational integrity and access-path hardening.
--
-- Found by auditing pg_constraint/pg_index rather than by reading the DDL:
-- seven foreign keys had no leading index, four declared NO ACTION where the
-- intent was RESTRICT, and employees could hold duplicates.

-- 1. Index every foreign key.
--
-- An unindexed FK makes the *parent's* delete a sequential scan of the child:
-- removing one worker scanned every log on the farm. These columns are also
-- what field_activity and employee_activity group by, so the same indexes serve
-- the rollups the Map and Employees screens read.
create index if not exists activity_logs_employee_idx      on public.activity_logs (employee_id);
create index if not exists activity_logs_field_idx         on public.activity_logs (field_id);
create index if not exists activity_logs_activity_type_idx on public.activity_logs (activity_type_id);
create index if not exists employees_org_idx               on public.employees (org_id);
create index if not exists members_org_idx                 on public.members (org_id);
create index if not exists log_tags_tag_idx                on public.log_tags (tag_id);
create index if not exists ingest_jobs_employee_idx        on public.ingest_jobs (employee_id);
create index if not exists ingest_jobs_log_idx             on public.ingest_jobs (log_id);

-- Covers the dashboard's default query: this org, this month, arrival order.
create index if not exists activity_logs_org_created_idx
  on public.activity_logs (org_id, created_at desc);

-- 2. Say what a delete does, rather than defaulting to it.
--
-- NO ACTION and RESTRICT enforce the same rule here; the difference is that
-- RESTRICT states it. A log's worker, field and activity are the evidence in a
-- compliance record — removing one out from under a season of logs must fail
-- loudly, and the schema should be where that policy is written down.
alter table public.activity_logs
  drop constraint activity_logs_employee_id_fkey,
  add  constraint activity_logs_employee_id_fkey
       foreign key (employee_id) references public.employees (id) on delete restrict;

alter table public.activity_logs
  drop constraint activity_logs_field_id_fkey,
  add  constraint activity_logs_field_id_fkey
       foreign key (field_id) references public.fields (id) on delete restrict;

alter table public.activity_logs
  drop constraint activity_logs_activity_type_id_fkey,
  add  constraint activity_logs_activity_type_id_fkey
       foreign key (activity_type_id) references public.activity_types (id) on delete restrict;

alter table public.applications
  drop constraint applications_product_id_fkey,
  add  constraint applications_product_id_fkey
       foreign key (product_id) references public.products (id) on delete restrict;

-- 3. Uniqueness the app assumed but the database did not enforce.
--
-- Two workers called "Isaac Wang" would make the EMPLOYEE column ambiguous on
-- every compliance record, and the ingestion pipeline resolves spoken names
-- against this table — a duplicate would make that resolution arbitrary.
alter table public.employees
  add constraint employees_org_id_full_name_key unique (org_id, full_name);

alter table public.members
  add constraint members_org_id_display_name_key unique (org_id, display_name);

-- 4. Range checks the actions already enforce, now also true of the data.
--
-- Validation in the app protects the app's writes. These protect the table from
-- anything else that ever touches it — a migration, a backfill, psql.
alter table public.recordings
  add constraint recordings_duration_check check (duration_seconds > 0);

alter table public.applications
  add constraint applications_air_temp_check check (air_temp_f between -60 and 150),
  add constraint applications_wind_upper_check check (wind_speed_mph <= 120);

alter table public.ingest_jobs
  add constraint ingest_jobs_duration_check check (duration_seconds is null or duration_seconds >= 0);

-- 5. updated_at that is actually maintained.
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger ingest_jobs_touch
  before update on public.ingest_jobs
  for each row execute function public.touch_updated_at();
