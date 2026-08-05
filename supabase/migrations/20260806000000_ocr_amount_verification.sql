/*
# NINT ANIME — OCR verification now also checks the paid amount

1. Problem
   `confirm_subscription_via_ocr()` only checked the recipient name and
   the app reference tag before auto-confirming a subscription. It never
   checked that the amount on the receipt matched the plan being bought
   — so a screenshot of a genuine $2 payment could be reused to
   auto-unlock the $28 plan, since name + reference were the only gate.

2. Fix
   `confirm_subscription_via_ocr(...)` now also requires the plan's price
   (formatted like "2.00") to appear somewhere in the raw OCR text before
   confirming. If the amount can't be found, it raises 'ocr_amount_mismatch'
   instead of confirming — the client already falls back to the manual
   admin-review queue whenever this RPC errors or returns falsy, so this
   fails safe into human review rather than silently unlocking.
*/

DROP FUNCTION IF EXISTS confirm_subscription_via_ocr(text, numeric, text, text, integer, text, text);

CREATE OR REPLACE FUNCTION confirm_subscription_via_ocr(
  p_plan text,
  p_amount numeric,
  p_proof_url text,
  p_ocr_text text,
  p_bonus_days integer DEFAULT 10,
  p_required_phrase text DEFAULT 'PANG SOK HENG',
  p_ref_phrase text DEFAULT 'S2 NINT ANI'
)
RETURNS subscription_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  new_row subscription_requests;
  cleaned text;
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

  -- Amount check: the plan price (e.g. "2.00") must appear in the raw OCR
  -- text somewhere, ignoring commas/currency symbols and stray spaces
  -- around the decimal point (OCR sometimes reads "2 . 00").
  IF p_amount IS NOT NULL THEN
    amount_text := to_char(p_amount, 'FM999990.00');
    digits_only := regexp_replace(p_ocr_text, '[,$\s]', '', 'g');
    IF position(amount_text IN digits_only) = 0 THEN
      RAISE EXCEPTION 'ocr_amount_mismatch';
    END IF;
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

REVOKE ALL ON FUNCTION confirm_subscription_via_ocr(text, numeric, text, text, integer, text, text) FROM public;
GRANT EXECUTE ON FUNCTION confirm_subscription_via_ocr(text, numeric, text, text, integer, text, text) TO authenticated;
