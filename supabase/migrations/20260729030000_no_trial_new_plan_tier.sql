/*
# Update subscription plans (no free trial, add 2-month tier)

1. Plans
   Allow 'plan' = '2m' on subscription_requests (previously only
   '1m' | '6m' | '1y'), and teach the manual-confirm trigger the new
   2-month duration. Pricing itself is enforced server-side in the
   create-qr-payment edge function (PLAN_AMOUNTS), not in the database.

2. Remove free trial
   Previously every new profile got `trial_started_at` auto-set on
   insert, and the app granted 30 days of access from that date even
   with no subscription. The app no longer reads trial_started_at for
   access at all (client-side change), and this migration removes the
   trigger that used to set it, so no trial period is granted at the
   database level either. Existing profiles keep whatever value they
   already have in trial_started_at (harmless, unused column) — only
   new signups are affected.
*/

-- 1. Allow the new 2-month plan
ALTER TABLE subscription_requests DROP CONSTRAINT IF EXISTS subscription_requests_plan_check;
ALTER TABLE subscription_requests ADD CONSTRAINT subscription_requests_plan_check
  CHECK (plan IN ('1m','2m','6m','1y'));

-- 2. Teach the manual-confirm trigger about the 2-month plan
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
        subscription_expires_at = GREATEST(now(), COALESCE(current_expiry, now())) + (plan_months || ' months')::interval
    WHERE id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;

-- 3. No more auto-granted free trial on signup
DROP TRIGGER IF EXISTS trg_set_trial_start ON profiles;
DROP FUNCTION IF EXISTS set_trial_start();
