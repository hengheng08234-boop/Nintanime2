/*
# Fix: add phone + display_name to the pre-existing profiles table

1. Problem
   This Supabase project already had a `profiles` table from an earlier,
   different app (columns: username, is_vip, vip_expires_at, ...). Because
   the anime-app migration used `CREATE TABLE IF NOT EXISTS profiles`, it
   silently skipped creating the table — so `phone` and `display_name`
   (which the anime app's sign-up/sign-in code writes to) were never added.
   Only later `ALTER TABLE ADD COLUMN` migrations (is_admin, is_locked, etc.)
   succeeded, since those don't check for table existence first.

2. Fix
   Add the two missing columns. Safe to run any time — uses IF NOT EXISTS,
   and doesn't touch or remove any of the pre-existing legacy columns
   (username, is_vip, vip_expires_at) in case something else still needs them.
*/

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS display_name text NOT NULL DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone text;
