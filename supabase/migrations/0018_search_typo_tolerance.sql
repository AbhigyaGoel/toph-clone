-- Tolerate a misspelling.
--
-- `ilike '%needle%'` demands that the user type a substring of the answer
-- correctly. That is a fair assumption at a desk and a poor one here: the
-- person searching is often on a phone, outdoors, with the name of a chemical
-- they have heard more often than read. "glifosate", "benjamn" and "sprying"
-- all returned nothing at all, which reads as "this farm has no such thing"
-- rather than "check your spelling".
--
-- The `%` operator answers "is this within trigram similarity distance", and
-- crucially it uses the same GIN indexes the substring match already uses — so
-- this costs an index condition, not a sequential scan. Verified with
-- `enable_seqscan = off`: the plan is a BitmapOr over two bitmap index scans on
-- the same trigram index, one per branch.
--
-- The two are complementary: `ilike` catches a short fragment of a long name
-- ("gly"), which similarity scores far too low to match, and `%` catches a full
-- word spelled wrong, which `ilike` cannot match at all.
--
-- The transcript is deliberately left on substring matching only. It is a
-- paragraph, and trigram similarity between a paragraph and a single word is
-- near zero however it is spelled, so adding `%` there would cost an index
-- lookup that can never succeed.
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
    where e.org_id = target_org
      and (e.full_name ilike '%' || q.needle || '%' or e.full_name % q.needle)

    union all
    select 'field', f.id, f.name, 'Field',
           extensions.similarity(f.name, (select needle from q)) + 0.30
    from public.fields f, q
    where f.org_id = target_org
      and (f.name ilike '%' || q.needle || '%' or f.name % q.needle)

    union all
    select 'product', p.id, p.name,
           case p.kind
             when 'chemical' then 'Chemical'
             when 'fertilizer' then 'Fertilizer'
             else 'Amendment'
           end,
           extensions.similarity(p.name, (select needle from q)) + 0.30
    from public.products p, q
    where p.org_id = target_org
      and (p.name ilike '%' || q.needle || '%' or p.name % q.needle)

    union all
    select 'tag', t.id, t.name, 'Tag',
           extensions.similarity(t.name, (select needle from q)) + 0.20
    from public.tags t, q
    where t.org_id = target_org
      and (t.name ilike '%' || q.needle || '%' or t.name % q.needle)

    union all
    select 'activity', a.id, a.name, 'Activity',
           extensions.similarity(a.name, (select needle from q)) + 0.20
    from public.activity_types a, q
    where a.name ilike '%' || q.needle || '%' or a.name % q.needle

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
        e.full_name ilike '%' || q.needle || '%' or e.full_name % q.needle
        or f.name ilike '%' || q.needle || '%' or f.name % q.needle
        or at.name ilike '%' || q.needle || '%' or at.name % q.needle
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
