/*
# NINT ANIME — Video hosting via Supabase Storage

1. Purpose
   Creates a `videos` storage bucket for hosting episode video files
   (MP4 and HLS .m3u8 segments). Videos are public-read so the player
   can stream them directly. Uploads are restricted to authenticated
   users (the admin who manages episodes).

2. Storage bucket
   - `videos` — public bucket, 500 MB file size limit, allows
     mp4, m3u8, ts, and webm mime types.

3. Storage policies
   - Public read: anyone (anon + authenticated) can SELECT (read/download)
     objects in the `videos` bucket.
   - Authenticated upload/update/delete: any signed-in user can INSERT,
     UPDATE, DELETE objects. In a production app you'd restrict this to
     an admin role, but for now any authenticated user manages content.

4. No table changes
   - The `episodes.video_url` column already exists and will hold either
     a direct MP4 URL (from the videos bucket) or an HLS .m3u8 URL.
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'videos',
  'videos',
  true,
  524288000,
  ARRAY['video/mp4', 'video/webm', 'application/vnd.apple.mpegurl', 'video/mp2t', 'application/x-mpegURL']
)
ON CONFLICT (id) DO NOTHING;

-- Public read
DROP POLICY IF EXISTS "public_read_videos" ON storage.objects;
CREATE POLICY "public_read_videos" ON storage.objects FOR SELECT
  TO anon, authenticated USING (bucket_id = 'videos');

-- Authenticated can upload
DROP POLICY IF EXISTS "auth_upload_videos" ON storage.objects;
CREATE POLICY "auth_upload_videos" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'videos');

-- Authenticated can update
DROP POLICY IF EXISTS "auth_update_videos" ON storage.objects;
CREATE POLICY "auth_update_videos" ON storage.objects FOR UPDATE
  TO authenticated USING (bucket_id = 'videos') WITH CHECK (bucket_id = 'videos');

-- Authenticated can delete
DROP POLICY IF EXISTS "auth_delete_videos" ON storage.objects;
CREATE POLICY "auth_delete_videos" ON storage.objects FOR DELETE
  TO authenticated USING (bucket_id = 'videos');
