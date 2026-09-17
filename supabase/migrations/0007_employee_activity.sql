-- Per-worker rollup for the Employees and Performance screens.
--
-- Same reasoning as `field_activity`: these screens want a handful of
-- aggregates per person, and the alternative is shipping every log to the
-- server process to count them. Hours are summed in the database because the
-- interval arithmetic is exact there and rounding it once, late, is what keeps
-- the roster and the reports agreeing.
create view public.employee_activity
  with (security_invoker = true) as
select
  e.id      as employee_id,
  e.org_id,
  e.full_name,
  e.is_active,
  count(l.id)                                                          as log_count,
  count(l.id) filter (where l.status = 'new')                          as unreviewed_count,
  coalesce(sum(extract(epoch from (l.ended_at - l.started_at))), 0)    as worked_seconds,
  max(l.started_at)                                                    as last_logged_at,
  count(distinct l.field_id)                                           as field_count
from public.employees e
left join public.activity_logs l on l.employee_id = e.id
group by e.id, e.org_id, e.full_name, e.is_active;
