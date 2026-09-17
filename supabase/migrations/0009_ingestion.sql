-- Voice ingestion: the pipeline that turns a phone recording into a log.

create type public.ingest_status as enum (
  'received', 'transcribing', 'extracting', 'complete', 'failed'
);

-- Where the audio actually lives, and what language it was spoken in.
alter table public.recordings
  add column if not exists audio_path text,
  add column if not exists language  text not null default 'en';

-- One row per upload. Keeps the pipeline observable and retryable instead of
-- being a request that either worked or did not.
create table public.ingest_jobs (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations (id) on delete cascade,
  employee_id    uuid references public.employees (id) on delete set null,
  status         public.ingest_status not null default 'received',
  audio_path     text,
  duration_seconds integer,
  language       text not null default 'en',
  transcript     text,
  confidence     numeric(4, 3) check (confidence between 0 and 1),
  -- What the extractor made of the transcript, before it became rows.
  extracted      jsonb,
  -- Set when the extractor could not resolve a field; the job completes with a
  -- log anyway so nothing is lost, and the gaps surface in the Audit Manager.
  warnings       text[] not null default '{}',
  error          text,
  log_id         uuid references public.activity_logs (id) on delete set null,
  device_label   text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index ingest_jobs_org_created_idx on public.ingest_jobs (org_id, created_at desc);
create index ingest_jobs_status_idx      on public.ingest_jobs (status);

alter table public.ingest_jobs enable row level security;
create policy "public read" on public.ingest_jobs for select to anon, authenticated using (true);
