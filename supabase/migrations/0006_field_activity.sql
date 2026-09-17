-- Per-field rollup for the Map screen.
--
-- The alternative was to load every log and aggregate in TypeScript, which is
-- fine at eleven rows and wrong at eleven thousand: the map only ever needs one
-- number and one date per field, and shipping a season of logs to the server
-- process to count them is work the database is better at and already indexed
-- for (`activity_logs_org_started_idx`).
--
-- A left join, so a field with no logs still appears — an unworked block is
-- exactly the thing a farm manager opens this screen to notice.
create view public.field_activity
  with (security_invoker = true) as
select
  f.id       as field_id,
  f.org_id,
  f.name,
  f.map_plot,
  count(l.id)                                        as log_count,
  count(l.id) filter (where l.status = 'new')        as unreviewed_count,
  max(l.started_at)                                  as last_worked_at
from public.fields f
left join public.activity_logs l on l.field_id = f.id
group by f.id, f.org_id, f.name, f.map_plot;
