-- 20260722110000_residents_email_unique.sql
-- NOT YET APPLIED. Written for review; run manually when approved.
--
-- PROBLEM SOLVED:
-- residents has no uniqueness constraint on email at all (confirmed live via
-- pg_indexes/pg_constraint -- only id and wallet_id are unique). Signup
-- (index.html createResident()) does an unconditional INSERT. Supabase Auth's
-- signUp() silently no-ops on an already-registered email (by design, to
-- avoid leaking which emails are registered) and returns no error, so
-- execution falls straight through to the INSERT every time -- a repeat
-- signup always creates a second residents row, never updates the first.
--
-- DECISION: normalize email to lowercase (both existing data and all future
-- writes) and add a real UNIQUE constraint on the column itself, not a
-- functional index on lower(email). This is deliberate: PostgREST's upsert
-- (onConflict) needs its target to be a real, named unique constraint --
-- it cannot target an expression like lower(email). Normalizing at write
-- time and constraining the plain column is the correct, idiomatic way to
-- get case-insensitive uniqueness through Supabase's client, not a
-- workaround.
--
-- Checked before writing: current live residents data has 4 rows, all with
-- distinct lower(email) values -- no pre-existing duplicates, so this
-- constraint can be added directly with no cleanup migration needed.

UPDATE public.residents SET email = lower(email) WHERE email IS NOT NULL AND email <> lower(email);

ALTER TABLE public.residents ADD CONSTRAINT residents_email_key UNIQUE (email);

-- ---------------------------------------------------------------------
-- ROLLBACK STRATEGY:
--   ALTER TABLE public.residents DROP CONSTRAINT IF EXISTS residents_email_key;
-- Lowercased email values are not reverted -- non-destructive (case has no
-- practical meaning for these addresses), and reverting would just
-- reintroduce the mismatch this migration exists to fix.
-- ---------------------------------------------------------------------
