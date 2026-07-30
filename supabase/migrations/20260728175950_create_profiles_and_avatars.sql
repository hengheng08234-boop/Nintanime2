/*
# AnimeVerse — Profiles table + avatar storage (multi-user, auth required)

1. Purpose
   Adds user accounts to the anime streaming app. Each signed-up user gets a
   profile row storing their display name, phone, and avatar image URL.
   Sign-in is required before browsing/watching shows.

2. New Tables
   - `profiles`
     - id (uuid PK, matches auth.users.id)
     - display_name (text, the user's name)
     - phone (text, the phone number used at sign-up)
     - avatar_url (text, public URL of the uploaded avatar image)
     - created_at (timestamptz)

3. Storage
   - Creates a public bucket `avatars` for profile image uploads.
   - A storage policy lets each authenticated user manage files under their
     own user-id folder only.

4. Security
   - RLS enabled on `profiles`.
   - Each authenticated user can read/update their own profile row.
   - INSERT is allowed for authenticated users creating their own profile.

5. Notes
   - Email confirmation stays OFF (phone-based auth uses a fake email of
     the form <digits>@animeverse.app).
   - The existing public-read policies on genres/shows/show_genres/episodes
     remain unchanged so signed-in users can still browse content.
*/

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT '',
  phone text,
  avatar_url text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Avatar storage bucket + per-user folder policy
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "avatar_upload_own" ON storage.objects;
CREATE POLICY "avatar_upload_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "avatar_update_own" ON storage.objects;
CREATE POLICY "avatar_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "avatar_read_own" ON storage.objects;
CREATE POLICY "avatar_read_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
