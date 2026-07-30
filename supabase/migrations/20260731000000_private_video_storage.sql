/*
# Make video storage private — signed URLs only

1. Problem
   The `videos` bucket is currently `public = true` with a public SELECT
   policy, so every episode has a permanent, unauthenticated, guessable
   URL (`.../storage/v1/object/public/videos/<path>`). Anyone who obtains
   that URL — subscribed or not — can stream or download it forever.
   Subscription gating today only happens in the React client, not at the
   file-serving layer.

2. Fix
   - Flip the `videos` bucket to private and drop the public-read policy.
     Regular clients get NO direct read access to this bucket anymore.
   - Playback now goes exclusively through the `get-video-url` Edge
     Function, which checks the caller's subscription status with the
     service-role key and mints a short-lived signed URL
     (`createSignedUrl`) for just that one episode.
   - Admin upload/update/delete policies are untouched — admins still
     manage files normally from the app.

3. Data migration
   `episodes.video_url` previously stored the full public URL. Since the
   bucket is no longer public, that URL is dead — we rewrite it back down
   to just the storage object path (e.g. `episodeId.mp4`), which is what
   `get-video-url` expects. Rows that hold an external http(s) URL (from
   the "paste URL" admin flow, e.g. a CDN link) are left untouched —
   those were never protected by this bucket's policy and are served as
   given, with no signing possible.

## Important Notes
- Safe to re-run.
- After this migration, do not use `getPublicUrl()` on the `videos`
  bucket anywhere — it will return links that 403 for anonymous callers.
*/

-- 1. Flip bucket to private
UPDATE storage.buckets SET public = false WHERE id = 'videos';

-- 2. Remove public read access; only the service role (used inside the
--    get-video-url Edge Function) can read objects in this bucket now.
DROP POLICY IF EXISTS "public_read_videos" ON storage.objects;

-- 3. Rewrite existing episodes.video_url values that point at the old
--    public URL down to a bare storage path.
UPDATE episodes
SET video_url = regexp_replace(
  video_url,
  '^.*/storage/v1/object/public/videos/',
  ''
)
WHERE video_url LIKE '%/storage/v1/object/public/videos/%';
