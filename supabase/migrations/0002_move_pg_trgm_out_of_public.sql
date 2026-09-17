-- The Supabase security advisor flags extensions installed in `public`; the
-- trigram operator class keeps working from its own schema.
create schema if not exists extensions;
alter extension pg_trgm set schema extensions;
