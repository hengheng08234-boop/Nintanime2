/*
# New-member Lucky Draw promo

1. Purpose
   New-member promotion: the first time an account becomes a paying VIP
   member, they get exactly one free "lucky draw" that grants bonus VIP
   days on top of whatever plan they just bought. The reward tier is
   picked server-side (weighted random) so it can't be manipulated from
   the client, and each account can only ever claim it once.

2. New columns on `profiles`
   - lucky_draw_used (bool, default false) — flips to true the moment the
     one-time spin is claimed. Client uses this + isSubscribed to decide
     whether to show the "spin now" prompt.

3. New Tables
   - `lucky_draw_spins` — audit trail of every claimed spin
     (id, user_id, reward_days, reward_label, created_at). Users can read
     their own rows; nothing else writes to it except the function below.

4. Reward table (weighted lottery, weight out of 283)
     15 days   -> weight 80  (most common)
     20 days   -> weight 70
     1 month   -> weight 60
     2 months  -> weight 40
     3 months  -> weight 30
     4 months  -> weight 1
     5 months  -> weight 1
     6 months  -> weight 1   (rarest, jackpot)

5. Function
   - `claim_new_member_spin()` — SECURITY DEFINER RPC callable by any
     authenticated user. Locks the caller's profile row, verifies the
     spin hasn't been used yet and that the account is currently an
     active VIP (subscription_expires_at in the future), rolls the
     weighted draw, extends subscription_expires_at by the reward,
     marks lucky_draw_used = true, and logs the spin. Raises a plain-text
     exception ('not_authenticated' | 'already_used' | 'not_vip') on
     failure so the client can show the right message.
*/

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS lucky_draw_used boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS lucky_draw_spins (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reward_days integer NOT NULL,
  reward_label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lucky_draw_spins_user ON lucky_draw_spins(user_id);

ALTER TABLE lucky_draw_spins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_spins" ON lucky_draw_spins;
CREATE POLICY "select_own_spins" ON lucky_draw_spins FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

-- Intentionally no INSERT/UPDATE/DELETE policy for regular users: only the
-- SECURITY DEFINER function below is allowed to write rows, so the reward
-- and the "already used" flag can't be forged from the client.

CREATE OR REPLACE FUNCTION claim_new_member_spin()
RETURNS TABLE(reward_days integer, reward_label text, new_expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid uuid := auth.uid();
  already_used boolean;
  current_expiry timestamptz;
  is_vip boolean;
  roll numeric;
  picked_days integer;
  picked_label text;
  updated_expiry timestamptz;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT lucky_draw_used, subscription_expires_at,
         (subscription_expires_at IS NOT NULL AND subscription_expires_at > now())
    INTO already_used, current_expiry, is_vip
    FROM profiles WHERE id = uid FOR UPDATE;

  IF already_used IS NOT FALSE THEN
    RAISE EXCEPTION 'already_used';
  END IF;

  IF NOT COALESCE(is_vip, false) THEN
    RAISE EXCEPTION 'not_vip';
  END IF;

  roll := random() * 283;

  IF roll < 80 THEN
    picked_days := 15;  picked_label := '15 days';
  ELSIF roll < 150 THEN
    picked_days := 20;  picked_label := '20 days';
  ELSIF roll < 210 THEN
    picked_days := 30;  picked_label := '1 month';
  ELSIF roll < 250 THEN
    picked_days := 60;  picked_label := '2 months';
  ELSIF roll < 280 THEN
    picked_days := 90;  picked_label := '3 months';
  ELSIF roll < 281 THEN
    picked_days := 120; picked_label := '4 months';
  ELSIF roll < 282 THEN
    picked_days := 150; picked_label := '5 months';
  ELSE
    picked_days := 180; picked_label := '6 months';
  END IF;

  updated_expiry := GREATEST(now(), current_expiry) + (picked_days || ' days')::interval;

  UPDATE profiles
  SET lucky_draw_used = true,
      subscription_expires_at = updated_expiry
  WHERE id = uid;

  INSERT INTO lucky_draw_spins (user_id, reward_days, reward_label)
  VALUES (uid, picked_days, picked_label);

  RETURN QUERY SELECT picked_days, picked_label, updated_expiry;
END;
$$;

GRANT EXECUTE ON FUNCTION claim_new_member_spin() TO authenticated;
