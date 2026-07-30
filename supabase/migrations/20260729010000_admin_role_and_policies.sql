/*
# Admin role + admin-only content management

1. Purpose
   Right now ANY signed-in user can open the "Video Management" screen and
   insert/update/delete episodes, and ANY signed-in user can upload/replace/
   delete files in the `videos` storage bucket. This migration introduces a
   real admin role and restricts all content-writing actions to admins only.

2. Changes
   - `profiles.is_admin` (boolean, default false) — marks a user as admin.
   - A trigger blocks any client-side attempt to flip `is_admin` on your own
     profile (the existing "update_own_profile" policy lets users update
     their own row for name/avatar — without this trigger, a user could
     also set is_admin = true on themselves). Only the Supabase SQL editor /
     dashboard (service role) can grant admin.
   - `genres`, `shows`, `show_genres`, `episodes`: add INSERT/UPDATE/DELETE
     policies that require `profiles.is_admin = true`. SELECT stays public.
   - `storage.objects` (videos bucket): replace the "any authenticated user"
     upload/update/delete policies with admin-only versions.

3. After running this
   Promote yourself (or whoever manages content) to admin from the SQL editor:
     UPDATE profiles SET is_admin = true WHERE id = '<your-user-uuid>';
   Find your user id in Authentication -> Users, or via:
     SELECT id, phone, display_name FROM profiles;
*/

-- 1. Admin flag on profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- Prevent self-escalation: a user updating their own profile row (name,
-- avatar, etc.) can never change is_admin themselves. Only the service role
-- (SQL editor, dashboard, server-side code) bypasses this trigger.
CREATE OR REPLACE FUNCTION prevent_is_admin_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin AND auth.role() <> 'service_role' THEN
    NEW.is_admin := OLD.is_admin;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_is_admin_self_update ON profiles;
CREATE TRIGGER trg_prevent_is_admin_self_update
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION prevent_is_admin_self_update();

-- 2. Admin-only writes on content tables (SELECT policies already exist and
--    stay unchanged; these only add INSERT/UPDATE/DELETE).
DROP POLICY IF EXISTS "admin_write_genres" ON genres;
CREATE POLICY "admin_write_genres" ON genres FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));

DROP POLICY IF EXISTS "admin_write_shows" ON shows;
CREATE POLICY "admin_write_shows" ON shows FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));

DROP POLICY IF EXISTS "admin_write_show_genres" ON show_genres;
CREATE POLICY "admin_write_show_genres" ON show_genres FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));

DROP POLICY IF EXISTS "admin_write_episodes" ON episodes;
CREATE POLICY "admin_write_episodes" ON episodes FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));

-- 3. Admin-only writes on the videos storage bucket (public read is unchanged)
DROP POLICY IF EXISTS "auth_upload_videos" ON storage.objects;
DROP POLICY IF EXISTS "admin_upload_videos" ON storage.objects;
CREATE POLICY "admin_upload_videos" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'videos'
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  );

DROP POLICY IF EXISTS "auth_update_videos" ON storage.objects;
DROP POLICY IF EXISTS "admin_update_videos" ON storage.objects;
CREATE POLICY "admin_update_videos" ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'videos'
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  )
  WITH CHECK (
    bucket_id = 'videos'
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  );

DROP POLICY IF EXISTS "auth_delete_videos" ON storage.objects;
DROP POLICY IF EXISTS "admin_delete_videos" ON storage.objects;
CREATE POLICY "admin_delete_videos" ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'videos'
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  );
