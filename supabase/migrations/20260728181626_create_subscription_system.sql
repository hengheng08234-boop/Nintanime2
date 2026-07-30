/*
# NINT ANIME — Subscription system (requests + trial + auto-unlock)

1. Purpose
   Adds the subscription payment flow: users pick a plan (1m / 6m / 1y),
   scan a QR to pay, and either the admin confirms manually or the
   check-qr-status edge function confirms automatically. On confirm, the
   account unlocks and the paid-until date extends.

2. New Tables
   - `subscription_requests`
     - id, user_id (defaults to auth.uid()), plan ('1m'|'6m'|'1y'),
       amount, status ('pending'|'confirmed'|'rejected'),
       payway_tran_id (unique, for auto flow), qr_expires_at,
       discount, description, transaction_id (user's manual claim),
       payment_date, proof_url, created_at

3. New columns on `profiles`
   - is_locked (bool, default true) — gates video playback
   - trial_started_at (timestamptz) — when the free trial began
   - subscription_expires_at (timestamptz) — paid-until date

4. Automation
   - `apply_subscription_on_confirm()` trigger: when a request's status
     flips to 'confirmed', extends subscription_expires_at by the plan's
     months and sets is_locked = false. SECURITY DEFINER so it works
     regardless of caller.

5. Security
   - RLS on subscription_requests: users can insert + read their own rows
     only. No update/delete for users — status changes are admin/edge-only.
   - profiles already has owner-scoped RLS from the earlier migration.
*/
CREATE TABLE IF NOT EXISTS subscription_requests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text NOT NULL CHECK (plan IN ('1m','6m','1y')),
  amount numeric NOT NULL,
  discount numeric NOT NULL DEFAULT 0,
  description text,
  transaction_id text,
  payment_date date,
  proof_url text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','rejected')),
  payway_tran_id text UNIQUE,
  qr_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscription_requests_user ON subscription_requests(user_id, created_at);

ALTER TABLE subscription_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_subscription_requests" ON subscription_requests;
CREATE POLICY "select_own_subscription_requests" ON subscription_requests FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_subscription_requests" ON subscription_requests;
CREATE POLICY "insert_own_subscription_requests" ON subscription_requests FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS trial_started_at timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_expires_at timestamptz;

-- Auto-set trial_started_at on first profile insert
CREATE OR REPLACE FUNCTION set_trial_start()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.trial_started_at IS NULL THEN
    NEW.trial_started_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_trial_start ON profiles;
CREATE TRIGGER trg_set_trial_start
  BEFORE INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION set_trial_start();

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
      WHEN '6m' THEN 6
      WHEN '1y' THEN 12
      ELSE 1
    END;

    SELECT subscription_expires_at INTO current_expiry FROM profiles WHERE id = NEW.user_id;

    UPDATE profiles
    SET is_locked = false,
        subscription_expires_at = GREATEST(now(), COALESCE(current_expiry, now())) + (plan_months || ' months')::interval
    WHERE id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_subscription_on_confirm ON subscription_requests;
CREATE TRIGGER trg_apply_subscription_on_confirm
  AFTER UPDATE ON subscription_requests
  FOR EACH ROW
  EXECUTE FUNCTION apply_subscription_on_confirm();
