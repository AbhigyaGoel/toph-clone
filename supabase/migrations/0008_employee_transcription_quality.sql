-- Transcription quality per worker.
--
-- The dashboard's "Response Accuracy" card is the farm-wide mean of
-- `recordings.transcription_confidence`. That number is only actionable once it
-- is broken down: a single worker whose recordings transcribe badly is a
-- fixable problem — a noisy cab, a phone held wrong, a heavy accent the model
-- has not seen — while a farm-wide average just says "some of this is bad".
--
-- Replacing the view rather than adding a second one keeps one row per worker,
-- so the Employees roster and the Performance screen cannot disagree about who
-- logged what.
create or replace view public.employee_activity
  with (security_invoker = true) as
select
  e.id      as employee_id,
  e.org_id,
  e.full_name,
  e.is_active,
  count(l.id)                                                        as log_count,
  count(l.id) filter (where l.status = 'new')                        as unreviewed_count,
  coalesce(sum(extract(epoch from (l.ended_at - l.started_at))), 0)  as worked_seconds,
  max(l.started_at)                                                  as last_logged_at,
  count(distinct l.field_id)                                         as field_count,
  count(r.id)                                                        as recording_count,
  avg(r.transcription_confidence)                                    as mean_confidence
from public.employees e
left join public.activity_logs l on l.employee_id = e.id
left join public.recordings    r on r.log_id      = l.id
group by e.id, e.org_id, e.full_name, e.is_active;
