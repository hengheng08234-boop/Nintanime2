/*
# Single-device sign-in enforcement

1. Purpose
   Restrict each account to exactly one signed-in device/browser at a time.
   When a user signs in on a new device, any previously signed-in device
   should detect the change and be signed out automatically.

2. Changes
   - Adds `active_session_id` (text) to `profiles`: a random token generated
     client-side on every successful sign-in, stored both in the row and in
     the signed-in device's localStorage.
   - Adds `active_session_started_at` (timestamptz): when that session began,
     shown to the user for transparency ("signed in since...").
   - Enables Realtime UPDATE events on `profiles` so other open sessions for
     the same user are notified immediately when `active_session_id` changes
     (rather than only finding out on next page load).

3. Security
   - No RLS changes needed: the existing `update_own_profile` policy already
     allows a user to update any column on their own row, which covers these
     two new columns.
   - This is a best-effort UX guard enforced by the client watching for
     realtime changes; it is not a hard server-side session revocation
     (Supabase Auth JWTs remain valid until they expire). Combine with short
     JWT expiry if a stricter guarantee is required.
*/

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS active_session_id text,
  ADD COLUMN IF NOT EXISTS active_session_started_at timestamptz;

-- Make sure UPDATE payloads carry full row data for realtime subscribers.
ALTER TABLE profiles REPLICA IDENTITY FULL;

-- Add profiles to the realtime publication (no-op if already present).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
  END IF;
END $$;
