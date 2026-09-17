-- `seq` and `hash` are assigned by the BEFORE INSERT trigger, never by a caller.
--
-- They carry placeholder defaults so that callers — and the generated
-- TypeScript Insert type, which is what actually forced this — are not asked to
-- supply a value the trigger will immediately overwrite. Anything a caller does
-- pass is discarded by `link_audit_event`.
alter table public.audit_events
  alter column seq  set default 0,
  alter column hash set default '\x'::bytea;
