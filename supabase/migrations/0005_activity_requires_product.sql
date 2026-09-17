-- Which kinds of work must produce a product record.
--
-- The Audit Manager's first question is "is anything missing", and answering it
-- means knowing that a spray with no product recorded is a gap while a harvest
-- with no product recorded is simply a harvest. That is a policy of the farm's
-- certification scheme, not a fact about the UI, so it lives on the activity
-- rather than in a list of names compiled into the app — where adding an
-- activity would silently opt it out of the audit.
alter table public.activity_types
  add column if not exists requires_product boolean not null default false;

update public.activity_types
set requires_product = true
where name in ('Spraying', 'Fertilizing', 'Pest Control');
