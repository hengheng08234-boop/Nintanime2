import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  Loader2,
  LogOut,
  Check,
  User as UserIcon,
  Phone,
  Edit3,
  Settings,
  ChevronRight,
} from 'lucide-react';
import type { Profile } from '@/lib/auth';
import {
  fetchProfile,
  updateProfile,
  uploadAvatar,
  signOut,
} from '@/lib/auth';
import { useLang } from '@/lib/useLang';
import { appText } from '@/lib/appTranslations';
import LanguageSwitcher from '@/components/LanguageSwitcher';

interface ProfileScreenProps {
  userId: string;
  onBack: () => void;
  onSignOut: () => void;
  onOpenAdmin: () => void;
}

export default function ProfileScreen({
  userId,
  onBack,
  onSignOut,
  onOpenAdmin,
}: ProfileScreenProps) {
  const { lang, setLang } = useLang();
  const t = appText[lang];
  const fileRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const p = await fetchProfile(userId);
      if (!active) return;
      setProfile(p);
      setName(p?.display_name ?? '');
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [userId]);

  const handleAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    setError(null);
    setUploading(true);
    const { url, error: upErr } = await uploadAvatar(userId, file);
    setUploading(false);
    if (upErr || !url) {
      setError(upErr ?? 'Upload failed');
      return;
    }
    await updateProfile(userId, { avatar_url: url });
    setProfile({ ...profile, avatar_url: url });
  };

  const handleSave = async () => {
    if (!profile) return;
    setError(null);
    setSaving(true);
    const { error: e } = await updateProfile(userId, {
      display_name: name.trim(),
    });
    setSaving(false);
    if (e) {
      setError(e);
      return;
    }
    setProfile({ ...profile, display_name: name.trim() });
    setEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSignOut = async () => {
    await signOut();
    onSignOut();
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A0A0F]">
        <Loader2 className="h-8 w-8 animate-spin text-[#FF4D5E]" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0A0A0F] text-white">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 20% 0%, rgba(255,77,94,0.15) 0%, rgba(10,10,15,0) 45%)',
        }}
      />

      <div className="relative z-10 flex min-h-screen flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between px-5 py-4">
          <button
            onClick={onBack}
            className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white/80 backdrop-blur-sm transition hover:bg-white/[0.08] hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" /> {t.back}
          </button>
          <h1
            className="text-xl font-black tracking-wider"
            style={{ fontFamily: '"Bebas Neue", "Battambang", Inter, sans-serif' }}
          >
            {t.myProfile}
          </h1>
          <div className="flex items-center gap-2">
            <LanguageSwitcher lang={lang} onChange={setLang} className="hidden sm:flex" />
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white/80 backdrop-blur-sm transition hover:border-[#EF4444]/40 hover:text-[#EF4444]"
            >
              <LogOut className="h-4 w-4" /> {t.signOut}
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="mx-auto w-full max-w-lg flex-1 px-5 py-8">
          {/* Avatar */}
          <div className="flex flex-col items-center">
            <div className="relative">
              <div className="h-32 w-32 overflow-hidden rounded-full border-2 border-white/10 bg-[#1E1E2A] shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
                {profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt="Avatar"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#FF4D5E] to-[#E63946]">
                    <span
                      className="text-5xl font-black text-white"
                      style={{ fontFamily: '"Bebas Neue", Inter, sans-serif' }}
                    >
                      {(profile?.display_name || 'A').charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
              </div>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="absolute bottom-1 right-1 flex h-10 w-10 items-center justify-center rounded-full bg-[#FF4D5E] text-white shadow-lg ring-4 ring-[#0A0A0F] transition hover:bg-[#E63946] active:scale-95 disabled:opacity-60"
                aria-label="Change avatar"
              >
                {uploading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Camera className="h-5 w-5" />
                )}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={handleAvatar}
                className="hidden"
              />
            </div>
            <p className="mt-3 text-xs text-white/40">{t.changePhotoHint}</p>
          </div>

          {/* Info */}
          <div className="mt-10 space-y-4">
            {/* Name (editable) */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="mb-1.5 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-white/50">
                <UserIcon className="h-4 w-4" /> {t.name}
              </div>
              {editing ? (
                <div className="flex items-center gap-2">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-[#FF4D5E]/50"
                    autoFocus
                  />
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-1 rounded-lg bg-[#FF4D5E] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#E63946] disabled:opacity-60"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    {t.save}
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-base font-semibold text-white">
                    {profile?.display_name || '—'}
                  </span>
                  <button
                    onClick={() => setEditing(true)}
                    className="text-white/40 transition hover:text-[#FF4D5E]"
                    aria-label="Edit name"
                  >
                    <Edit3 className="h-4 w-4" />
                  </button>
                </div>
              )}
              {saved && (
                <p className="mt-2 text-xs text-[#22C55E]">{t.nameUpdated}</p>
              )}
            </div>

            {/* Phone (read-only) */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="mb-1.5 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-white/50">
                <Phone className="h-4 w-4" /> {t.phone}
              </div>
              <span className="text-base font-semibold text-white">
                {profile?.phone || '—'}
              </span>
            </div>
          </div>

          {/* Admin link — only visible to admins; the real enforcement is the
              admin-only RLS policies on episodes/videos, this just keeps the
              entry point out of view for everyone else. */}
          {profile?.is_admin && (
          <button
            onClick={onOpenAdmin}
            className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left transition hover:border-[#FF4D5E]/30 hover:bg-white/[0.05]"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FF4D5E]/15">
              <Settings className="h-5 w-5 text-[#FF4D5E]" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-white">{t.videoManagement}</p>
              <p className="text-xs text-white/50">{t.videoManagementSubtitle}</p>
            </div>
            <ChevronRight className="h-5 w-5 text-white/30" />
          </button>
          )}

          {error && (
            <div className="mt-4 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/10 px-4 py-3 text-sm text-[#EF4444]">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
