-- One search across everything a farm has, answered by Postgres.
--
-- The obvious implementation is to ship the whole dataset to the browser and
-- filter it there — and with eleven logs it would be indistinguishable from
-- this one. It stops working at the first real customer: a farm two seasons in
-- has tens of thousands of logs and a megabyte of transcripts, and none of that
-- belongs in a keystroke handler.
--
-- So the search runs where the data is, over trigram indexes, and returns at
-- most a screenful. The screens themselves are matched in the client, because
-- those are a fixed list of thirteen and a round trip to find "Settings" would
-- be slower than the thing it replaces.

-- Trigram indexes on every column the search reads. `gin_trgm_ops` is what
-- makes `ilike '%needle%'` an index scan rather than a sequential one — an
-- unanchored LIKE cannot use a btree at all, which is the whole reason this
-- extension is installed.
-- `employees.full_name` already carries a trigram index from 0001; adding a
-- second would double the write cost for nothing (see 0015).
create index if not exists fields_name_trgm_idx
  on public.fields using gin (name extensions.gin_trgm_ops);
create index if not exists products_name_trgm_idx
  on public.products using gin (name extensions.gin_trgm_ops);
create index if not exists tags_name_trgm_idx
  on public.tags using gin (name extensions.gin_trgm_ops);
create index if not exists activity_types_name_trgm_idx
  on public.activity_types using gin (name extensions.gin_trgm_ops);
create index if not exists recordings_transcript_trgm_idx
  on public.recordings using gin (transcript extensions.gin_trgm_ops);

/**
 * Everything matching `needle`, ranked, across the kinds worth jumping to.
 *
 * One function rather than six queries from the application: the ranking only
 * means something if the candidates are compared against each other, and six
 * round trips would each return their own best matches with no way to say that
 * a worker's exact name beats a transcript that merely contains the word.
 *
 * `similarity` decides the order and `ilike` decides membership. Trigram
 * similarity alone would drop a search for "gly" against "Glyphosate 41%" — a
 * three-character needle shares little of a long name — while `ilike` alone has
 * no notion of better or worse. Together: substring matches get in, and the
 * closest ones come first.
 */
create or replace function public.search_everything(
  target_org uuid,
  needle text,
  max_results integer default 20
)
returns table (
  kind      text,
  id        uuid,
  label     text,
  sublabel  text,
  score     real
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with q as (select trim(needle) as needle),
  hits as (
    select
      'worker'::text as kind,
      e.id,
      e.full_name as label,
      case when e.is_active then 'Worker' else 'Worker · inactive' end as sublabel,
      -- Workers, fields and products are things people navigate *to*, so they
      -- outrank a log that merely mentions the same word.
      extensions.similarity(e.full_name, (select needle from q)) + 0.30 as score
    from public.employees e, q
    where e.org_id = target_org and e.full_name ilike '%' || q.needle || '%'

    union all
    select 'field', f.id, f.name, 'Field',
           extensions.similarity(f.name, (select needle from q)) + 0.30
    from public.fields f, q
    where f.org_id = target_org and f.name ilike '%' || q.needle || '%'

    union all
    select 'product', p.id, p.name,
           case p.kind
             when 'chemical' then 'Chemical'
             when 'fertilizer' then 'Fertilizer'
             else 'Amendment'
           end,
           extensions.similarity(p.name, (select needle from q)) + 0.30
    from public.products p, q
    where p.org_id = target_org and p.name ilike '%' || q.needle || '%'

    union all
    select 'tag', t.id, t.name, 'Tag',
           extensions.similarity(t.name, (select needle from q)) + 0.20
    from public.tags t, q
    where t.org_id = target_org and t.name ilike '%' || q.needle || '%'

    union all
    select 'activity', a.id, a.name, 'Activity',
           extensions.similarity(a.name, (select needle from q)) + 0.20
    from public.activity_types a, q
    where a.name ilike '%' || q.needle || '%'

    union all
    -- A log matches on any of the four things it is described by, or on the
    -- words that were actually spoken. The transcript is the reason this has to
    -- be a database search: it is the largest column in the schema and the one
    -- people search most.
    select 'log', l.id,
           coalesce(e.full_name, 'Log') || ' · ' || coalesce(at.name, ''),
           to_char(l.started_at at time zone 'UTC', 'Mon FMDD, YYYY') ||
             coalesce(' · ' || f.name, '') ||
             case when r.transcript ilike '%' || q.needle || '%'
                  then ' · mentioned in the recording' else '' end,
           greatest(
             extensions.similarity(coalesce(e.full_name, ''), q.needle),
             extensions.similarity(coalesce(f.name, ''), q.needle),
             extensions.similarity(coalesce(at.name, ''), q.needle),
             extensions.similarity(coalesce(r.transcript, ''), q.needle)
           )
    from public.activity_logs l
    join public.employees e       on e.id = l.employee_id
    join public.fields f          on f.id = l.field_id
    join public.activity_types at on at.id = l.activity_type_id
    left join public.recordings r on r.log_id = l.id,
    q
    where l.org_id = target_org
      and (
        e.full_name ilike '%' || q.needle || '%'
        or f.name ilike '%' || q.needle || '%'
        or at.name ilike '%' || q.needle || '%'
        or r.transcript ilike '%' || q.needle || '%'
      )
  )
  select kind, id, label, sublabel, score
  from hits, q
  -- A single character matches nearly everything and ranks nothing; the client
  -- also holds back, but the guard belongs on the endpoint too.
  where length(q.needle) >= 2
  order by score desc, label asc
  limit least(greatest(max_results, 1), 50);
$$;
