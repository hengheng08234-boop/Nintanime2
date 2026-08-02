/*
# NINT ANIME — show-level "Free Watching" flag

Adds `is_free` on `shows`: when true, the whole show is free to watch for
every visitor (distinct from the existing per-episode `is_free_preview`
trial flag). Used to power a "Free Watching" row on the home screen.
Defaults to false so nothing changes for existing shows until an admin
opts a title in.
*/

ALTER TABLE shows ADD COLUMN IF NOT EXISTS is_free boolean NOT NULL DEFAULT false;
