/*
# Fix "new row violates row-level security policy" on receipt/proof upload

1. Problem
   SubscriptionModal.tsx uploads payment-receipt screenshots to the
   `avatars` bucket under a `subscription-proofs/<userId>-<timestamp>.<ext>`
   path. The existing `avatar_upload_own` policy only allows inserts where
   the FIRST folder segment equals the caller's auth.uid() (i.e. paths like
   `<userId>/photo.jpg`). Since the proof path's first folder is the literal
   string "subscription-proofs" (not the user's id), every upload is
   rejected by RLS.

2. Fix
   Add INSERT/UPDATE/SELECT policies scoped to the `subscription-proofs/`
   folder that allow any authenticated user to upload/read files there,
   as long as the filename embeds their own user id (matches the app's
   `${userId}-${Date.now()}.${ext}` naming convention). This mirrors the
   per-user scoping of the avatar policy without requiring the userId to
   be the first path segment.

## Important Notes
- Safe to re-run.
*/

DROP POLICY IF EXISTS "subscription_proof_upload_own" ON storage.objects;
CREATE POLICY "subscription_proof_upload_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = 'subscription-proofs'
    AND name LIKE 'subscription-proofs/' || auth.uid()::text || '-%'
  );

DROP POLICY IF EXISTS "subscription_proof_update_own" ON storage.objects;
CREATE POLICY "subscription_proof_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = 'subscription-proofs'
    AND name LIKE 'subscription-proofs/' || auth.uid()::text || '-%'
  );

DROP POLICY IF EXISTS "subscription_proof_read_own" ON storage.objects;
CREATE POLICY "subscription_proof_read_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = 'subscription-proofs'
    AND name LIKE 'subscription-proofs/' || auth.uid()::text || '-%'
  );
