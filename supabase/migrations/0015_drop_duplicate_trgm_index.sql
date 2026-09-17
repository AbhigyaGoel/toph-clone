-- `employees_full_name_trgm_idx` already covered this column; 0013 added a
-- second identical index under a different name. Two identical GIN indexes cost
-- double on every write and buy nothing on reads.
drop index if exists public.employees_name_trgm_idx;
