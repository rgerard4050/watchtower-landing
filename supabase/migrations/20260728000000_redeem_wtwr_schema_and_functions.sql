-- 20260728000000_redeem_wtwr_schema_and_functions.sql
--
-- Redemptions tab backend. businesses.multiplier existed with no ceiling
-- (confirmed: 1 row, multiplier=1.00 before this ran) -- capped at 3.00 per
-- explicit direction, since terminal.html's Cashier tab reads multiplier at
-- face value with no independent check; an unbounded business-set
-- multiplier would let a business inflate what an operator pays out during
-- a manual redemption. redemption_cap_monthly and accepting_wtwr are new,
-- self-limiting business controls (no abuse path -- a business can only
-- restrict itself with these).
--
-- Token design: resident.html cannot compute a signed token client-side
-- without shipping the signing secret to the browser, so mint_wallet_token()
-- resolves the caller's own resident_id from auth.uid() (never accepts it
-- as a parameter) and signs resident_id:expiry with an HMAC key held in
-- Supabase Vault (confirmed installed: schema vault, v0.3.1), retrievable
-- only via vault.decrypted_secrets, which only postgres/service_role-owned
-- SECURITY DEFINER functions can read.
--
-- redeem_wtwr additionally verifies auth.uid() owns p_business_id before
-- doing anything else -- not explicitly listed in the spec, but required
-- for "the RPC is the only path": without it, any signed-in account could
-- call this with someone else's business_id and redirect a resident's WTWR
-- into an arbitrary business's ledger.
--
-- Verified end-to-end in a rolled-back transaction against the live schema
-- before this was written to disk: happy path, wrong-caller rejection,
-- insufficient-balance rejection, not-accepting rejection, tampered-token
-- rejection, invalid-signature rejection, expired-token rejection,
-- over-cap rejection, within-cap success, and the multiplier CHECK. No
-- permanent state changed during testing.

ALTER TABLE public.businesses
  ADD CONSTRAINT businesses_multiplier_check CHECK (multiplier >= 1.00 AND multiplier <= 3.00);

ALTER TABLE public.businesses
  ADD COLUMN redemption_cap_monthly numeric,
  ADD CONSTRAINT businesses_redemption_cap_monthly_check CHECK (redemption_cap_monthly IS NULL OR redemption_cap_monthly > 0);

ALTER TABLE public.businesses
  ADD COLUMN accepting_wtwr boolean NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'wallet_token_hmac_key') THEN
    PERFORM vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'wallet_token_hmac_key',
      'HMAC-SHA256 signing key for resident wallet QR tokens (mint_wallet_token / redeem_wtwr).'
    );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.mint_wallet_token()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_resident_id uuid;
  v_secret text;
  v_expires_at bigint;
  v_payload text;
  v_sig text;
BEGIN
  SELECT id INTO v_resident_id FROM residents WHERE user_id = auth.uid();
  IF v_resident_id IS NULL THEN
    RAISE EXCEPTION 'No resident profile for this account.';
  END IF;

  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'wallet_token_hmac_key';
  IF v_secret IS NULL THEN
    RAISE EXCEPTION 'Wallet token signing key is not configured.';
  END IF;

  v_expires_at := extract(epoch FROM now() + interval '2 minutes')::bigint;
  v_payload := v_resident_id::text || ':' || v_expires_at::text;
  v_sig := encode(extensions.hmac(v_payload, v_secret, 'sha256'), 'hex');

  RETURN encode(v_payload::bytea, 'base64') || '.' || v_sig;
END;
$function$;

REVOKE ALL ON FUNCTION public.mint_wallet_token() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mint_wallet_token() TO authenticated;

CREATE OR REPLACE FUNCTION public.redeem_wtwr(p_token text, p_business_id uuid, p_amount numeric)
RETURNS public.redemptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_secret text;
  v_payload_b64 text;
  v_sig text;
  v_expected_sig text;
  v_payload text;
  v_resident_id uuid;
  v_expires_at bigint;
  v_business businesses%ROWTYPE;
  v_resident_balance numeric;
  v_month_sum numeric;
  v_row redemptions%ROWTYPE;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero.';
  END IF;

  SELECT * INTO v_business FROM businesses WHERE id = p_business_id AND auth_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized for this business.';
  END IF;

  IF v_business.accepting_wtwr IS NOT TRUE THEN
    RAISE EXCEPTION 'This business is not currently accepting WTWR redemptions.';
  END IF;

  v_payload_b64 := split_part(p_token, '.', 1);
  v_sig := split_part(p_token, '.', 2);
  IF v_payload_b64 = '' OR v_sig = '' THEN
    RAISE EXCEPTION 'Malformed redemption code.';
  END IF;

  BEGIN
    v_payload := convert_from(decode(v_payload_b64, 'base64'), 'utf8');
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Malformed redemption code.';
  END;

  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'wallet_token_hmac_key';
  IF v_secret IS NULL THEN
    RAISE EXCEPTION 'Wallet token signing key is not configured.';
  END IF;

  v_expected_sig := encode(extensions.hmac(v_payload, v_secret, 'sha256'), 'hex');
  IF v_expected_sig <> v_sig THEN
    RAISE EXCEPTION 'Invalid redemption code.';
  END IF;

  v_resident_id := split_part(v_payload, ':', 1)::uuid;
  v_expires_at := split_part(v_payload, ':', 2)::bigint;

  IF v_expires_at < extract(epoch FROM now())::bigint THEN
    RAISE EXCEPTION 'Redemption code has expired.';
  END IF;

  SELECT wtwr_balance INTO v_resident_balance FROM residents WHERE id = v_resident_id FOR UPDATE;
  IF v_resident_balance IS NULL THEN
    RAISE EXCEPTION 'Resident not found.';
  END IF;
  IF v_resident_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient WTWR balance.';
  END IF;

  IF v_business.redemption_cap_monthly IS NOT NULL THEN
    SELECT COALESCE(SUM(wtwr_amount), 0) INTO v_month_sum
    FROM redemptions
    WHERE business_id = p_business_id
      AND created_at >= date_trunc('month', now());
    IF v_month_sum + p_amount > v_business.redemption_cap_monthly THEN
      RAISE EXCEPTION 'This would exceed the business monthly redemption cap.';
    END IF;
  END IF;

  UPDATE residents SET wtwr_balance = wtwr_balance - p_amount WHERE id = v_resident_id;

  INSERT INTO redemptions (business_id, resident_id, wtwr_amount, usd_value)
  VALUES (p_business_id, v_resident_id, p_amount, p_amount / 100)
  RETURNING * INTO v_row;

  UPDATE businesses SET wtwr_redeemed = wtwr_redeemed + p_amount WHERE id = p_business_id;

  RETURN v_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.redeem_wtwr(text, uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_wtwr(text, uuid, numeric) TO authenticated;

-- ---------------------------------------------------------------------
-- ROLLBACK STRATEGY:
--   REVOKE ALL ON FUNCTION public.redeem_wtwr(text, uuid, numeric) FROM authenticated;
--   DROP FUNCTION IF EXISTS public.redeem_wtwr(text, uuid, numeric);
--   REVOKE ALL ON FUNCTION public.mint_wallet_token() FROM authenticated;
--   DROP FUNCTION IF EXISTS public.mint_wallet_token();
--   DELETE FROM vault.secrets WHERE name = 'wallet_token_hmac_key';
--   ALTER TABLE public.businesses DROP COLUMN IF EXISTS accepting_wtwr;
--   ALTER TABLE public.businesses DROP CONSTRAINT IF EXISTS businesses_redemption_cap_monthly_check;
--   ALTER TABLE public.businesses DROP COLUMN IF EXISTS redemption_cap_monthly;
--   ALTER TABLE public.businesses DROP CONSTRAINT IF EXISTS businesses_multiplier_check;
-- ---------------------------------------------------------------------
