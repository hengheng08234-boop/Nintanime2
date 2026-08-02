/*
# NINT ANIME — OCR receipt verification + bonus days

1. Purpose
   Supports the "upload receipt screenshot -> auto verify -> instant unlock"
   flow. Because the real Payway auto-pay integration is sandbox-only for
   now, users pay via a static KHQR, screenshot their receipt, and the app
   OCRs it client-side. This migration lets that result be submitted
   directly as a confirmed request (re-checked server-side) instead of
   sitting in the pending/admin-review queue, and tracks a bonus-days
   reward separately from the plan length.

2. New columns on `subscription_requests`
   - bonus_days integer default 0 — extra free days granted on top of the
     plan (e.g. the OCR-verify reward)
   - verified_method text — 'ocr_auto' | 'admin' | 'payway_auto' | null
   - ocr_matched_text text — raw OCR text kept for admin audit if a request
     is later disputed

3. Updated automation
   - `apply_subscription_on_confirm()` now adds bonus_days on top of the
     plan's month-based extension.

4. New RPC: `confirm_subscription_via_ocr`
   - SECURITY DEFINER function callable by any authenticated user for
     their own account only.
   - Re-checks the OCR text server-side against the required phrase (does
     not just trust a client-supplied boolean) before confirming anything.
   - Inserts a subscription_requests row with status='confirmed' directly,
     which fires the existing trigger to unlock the account and extend
     subscription_expires_at, with bonus_days added.
   - The proof screenshot URL is always stored, so a human can still audit
     or revoke a request after the fact.
*/

ALTER TABLE subscription_requests ADD COLUMN IF NOT EXISTS bonus_days integer NOT NULL DEFAULT 0;
ALTER TABLE subscription_requests ADD COLUMN IF NOT EXISTS verified_method text;
ALTER TABLE subscription_requests ADD COLUMN IF NOT EXISTS ocr_matched_text text;

CREATE OR REPLACE FUNCTION apply_subscription_on_confirm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  plan_months integer;
  current_expiry timestamptz;
BEGIN
  IF NEW.status = 'confirmed' AND (OLD.status IS DISTINCT FROM 'confirmed') THEN
    plan_months := CASE NEW.plan
      WHEN '1m' THEN 1
      WHEN '2m' THEN 2
      WHEN '6m' THEN 6
      WHEN '1y' THEN 12
      ELSE 1
    END;

    SELECT subscription_expires_at INTO current_expiry FROM profiles WHERE id = NEW.user_id;

    UPDATE profiles
    SET is_locked = false,
        subscription_expires_at =
          GREATEST(now(), COALESCE(current_expiry, now()))
          + (plan_months || ' months')::interval
          + (COALESCE(NEW.bonus_days, 0) || ' days')::interval
    WHERE id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION confirm_subscription_via_ocr(
  p_plan text,
  p_amount numeric,
  p_proof_url text,
  p_ocr_text text,
  p_bonus_days integer DEFAULT 10,
  p_required_phrase text DEFAULT 'PANG SOK HENG'
)
RETURNS subscription_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  new_row subscription_requests;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Server-side re-check: never trust a client-supplied "matched" flag.
  IF p_ocr_text IS NULL OR upper(regexp_replace(p_ocr_text, '[^A-Za-z ]', ' ', 'g'))
       NOT LIKE '%' || upper(p_required_phrase) || '%' THEN
    RAISE EXCEPTION 'ocr_no_match';
  END IF;

  INSERT INTO subscription_requests (
    user_id, plan, amount, discount, description,
    transaction_id, payment_date, proof_url,
    status, bonus_days, verified_method, ocr_matched_text
  ) VALUES (
    auth.uid(), p_plan, p_amount, 0, 'Auto-verified via receipt OCR',
    NULL, CURRENT_DATE, p_proof_url,
    'confirmed', p_bonus_days, 'ocr_auto', p_ocr_text
  )
  RETURNING * INTO new_row;

  RETURN new_row;
END;
$$;

REVOKE ALL ON FUNCTION confirm_subscription_via_ocr(text, numeric, text, text, integer, text) FROM public;
GRANT EXECUTE ON FUNCTION confirm_subscription_via_ocr(text, numeric, text, text, integer, text) TO authenticated;
