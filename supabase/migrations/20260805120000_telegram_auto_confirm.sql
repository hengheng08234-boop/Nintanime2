/*
# NINT ANIME — Telegram auto-confirm via ABA Merchant group notifications

1. Purpose
   ABA Merchant (the personal/shop app, not the PayWay business API) can
   post a notification into a Telegram group every time a payment is
   received. A bot sitting in that same group can read those
   notifications and confirm the matching `subscription_requests` row
   automatically — no admin, no OCR, no 1-hour wait.

   To reliably match a notification to the right user (several people
   can pay the same plan amount around the same time), each request now
   gets a short, unique `match_code` that the user is asked to type into
   the "Message / Note" field of the ABA transfer. That code usually
   flows straight through into the notification text ABA posts.

2. Schema changes
   - `subscription_requests.match_code` — short unique code, auto-
     generated on insert. Indexed for fast lookup by the webhook.
   - `subscription_requests.verified_method` already exists from the
     OCR migration; the telegram-webhook function will set it to
     'telegram_auto'.

3. Notes
   - The telegram-webhook edge function updates status using the
     service role key, which bypasses RLS — no new RPC needed. It only
     ever flips a row from 'pending' to 'confirmed', and only for a row
     it matched by (a) match_code found in the notification text, or,
     failing that, (b) a single unambiguous amount match within a short
     recent window. The existing `apply_subscription_on_confirm`
     trigger still does the actual unlock + expiry extension.
*/

ALTER TABLE subscription_requests
  ADD COLUMN IF NOT EXISTS match_code text;

CREATE OR REPLACE FUNCTION generate_match_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  code text;
  tries integer := 0;
BEGIN
  LOOP
    code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM subscription_requests WHERE match_code = code
    ) OR tries > 5;
    tries := tries + 1;
  END LOOP;
  RETURN code;
END;
$$;

ALTER TABLE subscription_requests
  ALTER COLUMN match_code SET DEFAULT generate_match_code();

-- Backfill any existing rows that predate this column.
UPDATE subscription_requests SET match_code = generate_match_code() WHERE match_code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_requests_match_code
  ON subscription_requests(match_code);
