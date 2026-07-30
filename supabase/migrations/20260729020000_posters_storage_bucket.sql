/*
# Posters/banners storage bucket

1. Purpose
   Adds a `posters` bucket for show/movie cover images (vertical poster)
   and hero banners (wide image), so the new "Add Show" admin form has
   somewhere to upload them to.

2. Storage bucket
   - `posters` — public bucket, 10 MB file size limit, images only.

3. Storage policies
   - Public read: anyone (anon + authenticated) can view images.
   - Admin-only upload/update/delete — same admin check used for the
     `videos` bucket (profiles.is_admin = true).
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'posters',
  'posters',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "public_read_posters" ON storage.objects;
CREATE POLICY "public_read_posters" ON storage.objects FOR SELECT
  TO anon, authenticated USING (bucket_id = 'posters');

DROP POLICY IF EXISTS "admin_upload_posters" ON storage.objects;
CREATE POLICY "admin_upload_posters" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'posters'
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  );

DROP POLICY IF EXISTS "admin_update_posters" ON storage.objects;
CREATE POLICY "admin_update_posters" ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'posters'
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  )
  WITH CHECK (
    bucket_id = 'posters'
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  );

DROP POLICY IF EXISTS "admin_delete_posters" ON storage.objects;
CREATE POLICY "admin_delete_posters" ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'posters'
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  );
