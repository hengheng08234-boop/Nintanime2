/*
# Free-preview episodes + admin bypass for signed video URLs

1. Purpose
   Two things the subscription-gated video signing (see
   20260731000000_private_video_storage.sql + the get-video-url function)
   didn't account for yet:
   - Admins need to be able to open any episode to check that an upload
     played back correctly, even without a paid subscription.
   - The team wants to let non-subscribers sample a handful of episodes
     for free (a trial taste) without granting a full subscription.

2. New column
   - `episodes.is_free_preview` (boolean, default false) — when true,
     get-video-url signs a playback URL for ANY signed-in user, no
     subscription required. Admins toggle this per-episode from the
     admin panel.

3. Notes
   - The admin bypass itself lives in the get-video-url Edge Function
     code (checks profiles.is_admin), not in SQL — redeploy that
     function after pulling this update.
*/

ALTER TABLE episodes ADD COLUMN IF NOT EXISTS is_free_preview boolean NOT NULL DEFAULT false;
