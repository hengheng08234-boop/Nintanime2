/*
# NINT ANIME — Restore the OCR amount check (regression fix)

1. Problem
   `20260806000000_ocr_amount_verification.sql` added a server-side check
   that the plan's price must appear in the OCR text before
   confirm_subscription_via_ocr() auto-confirms a subscription. But the
   very next migration, `20260807000000_tran_id_reuse_check.sql`, dropped
   and recreated the same function (to add the transaction-ID reuse
   check) and — by mistake — never carried the amount check over. Since
   then, the live function has only checked name + reference tag +
   tran_id reuse, NOT the amount, so a genuine receipt for a cheap plan
   (e.g. $2 / 1 month) could be re-submitted while a more expensive plan
   (e.g. $28 / 1 year) is selected, and the server would auto-confirm the
   expensive plan for free. The client-side check in receiptOcr.ts is not
   a safeguard on its own since it can be bypassed and also passes when
   the amount simply couldn't be read (null is treated as "not false").

2. Fix
   Recreate confirm_subscription_via_ocr(...) with the exact same
   signature as 20260807000000 (name, ref, tran_id-reuse checks all kept
   unchanged) and re-add the amount check from 20260806000000: the plan's
   price (formatted like "28.00") must appear in the raw OCR text, or the
   function raises 'ocr_amount_mismatch' instead of confirming. The
   client already falls back to the manual admin-review queue whenever
   this RPC errors or returns falsy, so this fails safe into human
   review rather than silently unlocking the wrong tier.
*/

DROP FUNCTION IF EXISTS confirm_subscription_via_ocr(text, numeric, text, text, integer, text, text, text);

CREATE OR REPLACE FUNCTION confirm_subscription_via_ocr(
  p_plan text,
  p_amount numeric,
  p_proof_url text,
  p_ocr_text text,
  p_bonus_days integer DEFAULT 10,
  p_required_phrase text DEFAULT 'PANG SOK HENG',
  p_ref_phrase text DEFAULT 'S2 NINT ANI',
  p_tran_id text DEFAULT NULL
)
RETURNS subscription_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  new_row subscription_requests;
  cleaned text;
  cleaned_tran_id text;
  amount_text text;
  digits_only text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_ocr_text IS NULL THEN
    RAISE EXCEPTION 'ocr_no_match';
  END IF;

  cleaned := upper(regexp_replace(p_ocr_text, '[^A-Za-z ]', ' ', 'g'));
  cleaned := regexp_replace(cleaned, '\s+', ' ', 'g');

  -- Server-side re-check: never trust a client-supplied "matched" flag.
  IF cleaned NOT LIKE '%' || upper(p_required_phrase) || '%' THEN
    RAISE EXCEPTION 'ocr_no_match';
  END IF;

  IF p_ref_phrase IS NOT NULL AND p_ref_phrase <> ''
     AND cleaned NOT LIKE '%' || upper(regexp_replace(p_ref_phrase, '[^A-Za-z ]', ' ', 'g')) || '%' THEN
    RAISE EXCEPTION 'ocr_no_match';
  END IF;

  -- Restored checkpoint: the plan's price must appear somewhere in the
  -- raw OCR text (ignoring commas/currency symbols/spaces), or this is
  -- almost certainly a receipt for a different (cheaper) plan.
  IF p_amount IS NOT NULL THEN
    amount_text := to_char(p_amount, 'FM999990.00');
    digits_only := regexp_replace(p_ocr_text, '[,$\s]', '', 'g');
    IF position(amount_text IN digits_only) = 0 THEN
      RAISE EXCEPTION 'ocr_amount_mismatch';
    END IF;
  END IF;

  -- Checkpoint 4: reject a receipt whose transaction ID has already been
  -- used on a different confirmed request (screenshot reuse / fraud).
  cleaned_tran_id := NULLIF(upper(trim(p_tran_id)), '');
  IF cleaned_tran_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM subscription_requests
      WHERE status = 'confirmed'
        AND transaction_id = cleaned_tran_id
        AND user_id <> auth.uid()
    ) THEN
      RAISE EXCEPTION 'tran_id_reused';
    END IF;
  END IF;

  INSERT INTO subscription_requests (
    user_id, plan, amount, discount, description,
    transaction_id, payment_date, proof_url,
    status, bonus_days, verified_method, ocr_matched_text
  ) VALUES (
    auth.uid(), p_plan, p_amount, 0, 'Auto-verified via receipt OCR',
    cleaned_tran_id, CURRENT_DATE, p_proof_url,
    'confirmed', p_bonus_days, 'ocr_auto', p_ocr_text
  )
  RETURNING * INTO new_row;

  RETURN new_row;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'tran_id_reused';
END;
$$;

REVOKE ALL ON FUNCTION confirm_subscription_via_ocr(text, numeric, text, text, integer, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION confirm_subscription_via_ocr(text, numeric, text, text, integer, text, text, text) TO authenticated;
