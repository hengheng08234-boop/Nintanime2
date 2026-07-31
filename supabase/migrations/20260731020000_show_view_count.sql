/*
# Manual view count for shows

1. Purpose
   Adds an admin-editable "views" number per show, shown/edited from the
   Edit Show panel. This is a plain counter the admin sets by hand
   (e.g. to seed social-proof numbers) — it is not auto-incremented by
   playback events.

2. New column
   - `shows.view_count` (bigint, default 0)
*/

ALTER TABLE shows ADD COLUMN IF NOT EXISTS view_count bigint NOT NULL DEFAULT 0;
