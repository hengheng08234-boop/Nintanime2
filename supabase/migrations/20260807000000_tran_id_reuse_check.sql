/*
# NINT ANIME — Transaction-ID reuse check on auto-confirm

1. Purpose
   Name / reference-tag / amount are the same text on every genuine
   receipt, so a screenshot can be edited to pass those three checks
   without a real payment. The one field that's unique per real payment
   is the bank's own transaction ID printed on the receipt. This adds a
   4th checkpoint: if the OCR text contains a transaction ID that was
   already used on a previously CONFIRMED request, auto-confirm is
   refused (distinct 'tran_id_reused' error) even though name/ref/amount
   still match — this is what stops the same real screenshot from being
   replayed on multiple accounts.

   A receipt where no transaction ID could be read (common — OCR miss,
   or the bank app doesn't print one clearly) is NOT treated as fraud;
   it just skips this particular check and falls back to the existing
   name+ref+amount gate, same as before. This keeps the common case
   (genuine, first-time payer) unlocking instantly.

2. Schema changes
   - Unique partial index on subscription_requests(transaction_id) WHERE
     status = 'confirmed' — a second, server-enforced backstop against
     the same transaction_id being confirmed twice, even under a race.

3. Function changes
   - confirm_subscription_via_ocr(...) — new p_tran_id text DEFAULT NULL
     parameter. When provided, the function checks for a prior CONFIRMED
     request with the same transaction_id and raises 'tran_id_reused' if
     found, before doing anything else. The extracted ID is stored on
     the new row's transaction_id column either way.
*/

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_requests_confirmed_tran_id
  ON subscription_requests (transaction_id)
  WHERE status = 'confirmed' AND transaction_id IS NOT NULL;

DROP FUNCTION IF EXISTS confirm_subscription_via_ocr(text, numeric, text, text, integer, text, text);

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
