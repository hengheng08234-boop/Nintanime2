/*
# Per-episode free/unlock override

1. Purpose
   Admins currently can only gate content globally: either a viewer is
   subscribed (or is_admin) and can watch everything, or they can watch
   nothing. There's no way to unlock a handful of specific episodes for
   testing or as a promo preview without granting a full subscription.

2. Changes
   - `episodes.is_free` (boolean, default false) — when true, this
     episode plays for ANY signed-in viewer regardless of subscription
     status. Existing episodes default to false (locked, unchanged
     behavior).

3. Enforcement
   Reading episodes is already public (SELECT policy unchanged).
   Writing `is_free` is already restricted to admins via the existing
   "admin_write_episodes" policy from the admin_role_and_policies
   migration (that policy covers ALL operations on the episodes table),
   so no new RLS policy is needed here.
*/

ALTER TABLE episodes ADD COLUMN IF NOT EXISTS is_free boolean NOT NULL DEFAULT false;
