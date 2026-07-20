-- 20260719100000_fix_marketplace_schema.sql
-- (mirrors operations/migrations/010_fix_marketplace_schema.sql, adapted)
--
-- Adds businesses.multiplier (terminal.html Cashier tab already reads it,
-- column never existed) and repoints/re-types redemptions.resident_id to a
-- real FK against residents.id. 0 rows in redemptions at the time this was
-- applied, so the type cast from text to uuid is safe.

ALTER TABLE public.businesses
  ADD COLUMN multiplier numeric NOT NULL DEFAULT 1.00;

ALTER TABLE public.redemptions
  ALTER COLUMN resident_id TYPE uuid USING resident_id::uuid;

ALTER TABLE public.redemptions
  ADD CONSTRAINT redemptions_resident_id_fkey
  FOREIGN KEY (resident_id) REFERENCES public.residents(id);

-- ---------------------------------------------------------------------
-- ROLLBACK STRATEGY:
--   ALTER TABLE public.redemptions DROP CONSTRAINT redemptions_resident_id_fkey;
--   ALTER TABLE public.redemptions ALTER COLUMN resident_id TYPE text;
--   ALTER TABLE public.businesses DROP COLUMN multiplier;
-- ---------------------------------------------------------------------
