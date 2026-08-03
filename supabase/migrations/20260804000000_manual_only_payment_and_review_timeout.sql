/*
# NINT ANIME — Manual-only payments + 1-hour review timeout

1. Purpose
   The subscription screen is moving to a single "manual payment" flow:
   the user pays via KHQR, uploads a screenshot of the receipt, and the
   app OCR-checks it for (a) the recipient name and (b) the app's
   reference tag before instantly unlocking. If the screenshot doesn't
   match, the request goes into an admin-review queue — and if nobody
   reviews it within 1 hour, it auto-flips to 'failed' so the user isn't
   left waiting forever, and is pointed to Telegram support instead.

2. Schema changes
   - `subscription_requests.status` CHECK now also allows 'failed'
     (distinct from 'rejected', which stays reserved for an admin's
     explicit decision).

3. New / updated functions
   - `confirm_subscription_via_ocr(...)` — now also takes p_ref_phrase
     (default 'S2 NINT ANI') and requires BOTH the name and the
     reference tag to appear in the OCR text before confirming.
     Still re-checks server-side; never trusts a client-supplied flag.
   - `expire_my_pending_subscription_request(p_request_id)` — lets a
     signed-in user flip their OWN request from 'pending' to 'failed'
     once it has been sitting unreviewed for more than 1 hour. This is
     what powers the client-side 1-hour countdown; it cannot touch
     anyone else's request or a request that's still fresh.
*/

ALTER TABLE subscription_requests DROP CONSTRAINT IF EXISTS subscription_requests_status_check;
ALTER TABLE subscription_requests
  ADD CONSTRAINT subscription_requests_status_check
  CHECK (status IN ('pending', 'confirmed', 'rejected', 'failed'));

DROP FUNCTION IF EXISTS confirm_subscription_via_ocr(text, numeric, text, text, integer, text);

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

CREATE OR REPLACE FUNCTION expire_my_pending_subscription_request(p_request_id uuid)
RETURNS subscription_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  updated_row subscription_requests;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE subscription_requests
  SET status = 'failed'
  WHERE id = p_request_id
    AND user_id = auth.uid()
    AND status = 'pending'
    AND created_at < now() - interval '1 hour'
  RETURNING * INTO updated_row;

  IF updated_row.id IS NULL THEN
    SELECT * INTO updated_row FROM subscription_requests
    WHERE id = p_request_id AND user_id = auth.uid();
  END IF;

  RETURN updated_row;
END;
$$;

REVOKE ALL ON FUNCTION expire_my_pending_subscription_request(uuid) FROM public;
GRANT EXECUTE ON FUNCTION expire_my_pending_subscription_request(uuid) TO authenticated;
