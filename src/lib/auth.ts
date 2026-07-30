import { supabase } from '@/lib/supabase/supabaseClient';

export interface Profile {
  id: string;
  display_name: string;
  phone: string | null;
  avatar_url: string | null;
  is_locked: boolean | null;
  is_admin: boolean;
  trial_started_at: string | null;
  subscription_expires_at: string | null;
}

export function isSubscribed(profile: Profile | null): boolean {
  if (!profile) return false;
  if (!profile.subscription_expires_at) return false;
  return new Date(profile.subscription_expires_at) > new Date();
}

// Convert a phone number into a fake email so Supabase email auth can be used
// as a phone-based login. The password is the real secret; the email is a
// deterministic placeholder derived from the digits.
//
// NOTE: this intentionally uses gmail.com as the domain, not a project-owned
// domain like nintanime.app. Supabase Auth validates that the email's domain
// has real DNS/MX records before accepting a signup — a domain with no mail
// server configured (like an app-only domain with nothing but a web host)
// gets rejected with "Email address ... is invalid" even though the format
// is fine. Since email confirmation is OFF, no mail is ever actually sent to
// these addresses, so borrowing a domain that's guaranteed to have valid MX
// records is a safe, standard workaround — it never collides with a real
// Gmail account because Supabase Auth users are scoped to this project only.
export function phoneToEmail(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return `${digits}@gmail.com`;
}

export function validatePhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8) return 'Enter a valid phone number';
  return null;
}

export function validatePassword(pw: string): string | null {
  if (pw.length < 6) return 'Password must be at least 6 characters';
  return null;
}

export async function signUp(opts: {
  name: string;
  phone: string;
  password: string;
}): Promise<{ error: string | null }> {
  const email = phoneToEmail(opts.phone);
  const { data, error } = await supabase.auth.signUp({
    email,
    password: opts.password,
  });
  if (error) return { error: error.message };
  const user = data.user;
  if (!user) return { error: 'Sign-up failed. Please try again.' };

  const { error: profileError } = await supabase.from('profiles').insert({
    id: user.id,
    display_name: opts.name,
    phone: opts.phone,
    avatar_url: null,
  });
  if (profileError) return { error: profileError.message };
  return { error: null };
}

export async function signIn(opts: {
  phone: string;
  password: string;
}): Promise<{ error: string | null }> {
  const email = phoneToEmail(opts.phone);
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: opts.password,
  });
  if (error) return { error: error.message };
  return { error: null };
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, phone, avatar_url, is_locked, is_admin, trial_started_at, subscription_expires_at')
    .eq('id', userId)
    .maybeSingle();
  if (error) return null;
  return data as Profile | null;
}

export async function uploadAvatar(
  userId: string,
  file: File,
): Promise<{ url: string | null; error: string | null }> {
  const ext = file.name.split('.').pop() || 'png';
  const path = `${userId}/avatar.${ext}`;
  const { error: upErr } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true, contentType: file.type });
  if (upErr) return { url: null, error: upErr.message };
  const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
  return { url: pub.publicUrl, error: null };
}

export async function updateProfile(
  userId: string,
  patch: Partial<Pick<Profile, 'display_name' | 'avatar_url'>>,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', userId);
  return { error: error?.message ?? null };
}
