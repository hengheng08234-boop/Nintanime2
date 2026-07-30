import { useEffect, useState } from 'react';
import {
  Phone,
  User,
  Lock,
  Eye,
  EyeOff,
  ArrowLeft,
  Loader2,
  ShieldCheck,
  Film,
} from 'lucide-react';
import {
  signUp,
  signIn,
  validatePhone,
  validatePassword,
} from '@/lib/auth';
import { fetchShowcaseShows } from '@/lib/api';
import type { Show } from '@/lib/types';
import { useLang } from '@/lib/useLang';
import { appText } from '@/lib/appTranslations';
import LanguageSwitcher from '@/components/LanguageSwitcher';

interface AuthScreenProps {
  mode: 'signin' | 'signup';
  onBack: () => void;
  onSuccess: () => void;
  onSwitch: (mode: 'signin' | 'signup') => void;
}

export default function AuthScreen({
  mode,
  onBack,
  onSuccess,
  onSwitch,
}: AuthScreenProps) {
  const isSignUp = mode === 'signup';
  const { lang, setLang, isKm } = useLang();
  const t = appText[lang];

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shows, setShows] = useState<Show[]>([]);

  useEffect(() => {
    let active = true;
    fetchShowcaseShows(8)
      .then((data) => {
        if (active) setShows(data);
      })
      .catch(() => {
        if (active) setShows([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const backdrop = shows.find((s) => s.banner_url)?.banner_url ?? shows[0]?.poster_url ?? null;
  const strip = shows.slice(0, 8);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isSignUp && name.trim().length < 2) {
      setError('Please enter your name');
      return;
    }
    const phoneErr = validatePhone(phone);
    if (phoneErr) {
      setError(phoneErr);
      return;
    }
    const pwErr = validatePassword(password);
    if (pwErr) {
      setError(pwErr);
      return;
    }
    if (isSignUp && password !== confirm) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    const res = isSignUp
      ? await signUp({ name: name.trim(), phone, password })
      : await signIn({ phone, password });
    setLoading(false);

    if (res.error) {
      setError(res.error);
      return;
    }
    onSuccess();
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0A0A0F] text-white">
      {/* Big background bleed from the catalog's own art */}
      {backdrop && (
        <div className="pointer-events-none absolute inset-0">
          <div
            className="absolute inset-0 bg-cover bg-center opacity-30 blur-3xl scale-125"
            style={{ backgroundImage: `url(${backdrop})` }}
          />
        </div>
      )}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 15% 0%, rgba(76,201,80,0.20) 0%, rgba(10,10,15,0) 50%), radial-gradient(circle at 85% 100%, rgba(76,201,80,0.10) 0%, rgba(10,10,15,0) 50%)',
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#0A0A0F]/50 via-[#0A0A0F]/75 to-[#0A0A0F]" />

      <div className="relative z-10 flex min-h-screen flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between px-5 py-4">
          <button
            onClick={onBack}
            className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white/80 backdrop-blur-sm transition hover:bg-white/[0.08] hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" /> {t.back}
          </button>
          <div className="flex items-center gap-2">
            <img
              src="/assets/images/logo-transparent.png"
              alt="NINT ANIME"
              className="h-8 w-8 drop-shadow-[0_0_14px_rgba(76,201,80,0.5)]"
            />
            <span
              className="text-lg font-black tracking-wider"
              style={{ fontFamily: '"Bebas Neue", "Battambang", Inter, sans-serif' }}
            >
              NINT ANIME
            </span>
          </div>
          <LanguageSwitcher lang={lang} onChange={setLang} />
        </div>

        {/* Glowing poster strip */}
        {strip.length > 0 && (
          <div className="flex justify-center gap-2 px-5 pt-2">
            {strip.map((show) => (
              <div
                key={show.id}
                className="relative aspect-[2/3] w-10 sm:w-12 flex-shrink-0 overflow-hidden rounded-md border border-white/10 opacity-80"
              >
                {show.poster_url ? (
                  <img src={show.poster_url} alt={show.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-[#14141C]">
                    <Film className="h-3.5 w-3.5 text-white/20" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Form card */}
        <div className="flex flex-1 items-center justify-center px-5 py-8">
          <div className="w-full max-w-md">
            <div className="mb-6 text-center">
              <h1
                className={`text-4xl font-black tracking-tight ${isKm ? 'font-khmer' : ''}`}
                style={{ fontFamily: '"Bebas Neue", "Battambang", Inter, sans-serif', letterSpacing: '0.03em' }}
              >
                {isSignUp ? t.createAccountTitle : t.welcomeBack}
              </h1>
              <p className="mt-2 text-sm text-white/50">
                {isSignUp ? t.signUpSubtitle : t.signInSubtitle}
              </p>
            </div>

            <form
              onSubmit={handleSubmit}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-sm"
            >
              {isSignUp && (
                <Field
                  icon={<User className="h-5 w-5" />}
                  label={t.labelName}
                  type="text"
                  value={name}
                  onChange={setName}
                  placeholder={t.placeholderName}
                  autoComplete="name"
                />
              )}

              <Field
                icon={<Phone className="h-5 w-5" />}
                label={t.labelPhone}
                type="tel"
                value={phone}
                onChange={setPhone}
                placeholder="e.g. +1 555 123 4567"
                autoComplete="tel"
              />

              <Field
                icon={<Lock className="h-5 w-5" />}
                label={t.labelPassword}
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={setPassword}
                placeholder={t.placeholderPassword}
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                trailing={
                  <button
                    type="button"
                    onClick={() => setShowPw((s) => !s)}
                    className="text-white/40 transition hover:text-white/70"
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                  >
                    {showPw ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                }
              />

              {isSignUp && (
                <Field
                  icon={<Lock className="h-5 w-5" />}
                  label={t.labelConfirmPassword}
                  type={showPw ? 'text' : 'password'}
                  value={confirm}
                  onChange={setConfirm}
                  placeholder={t.placeholderConfirmPassword}
                  autoComplete="new-password"
                />
              )}

              {error && (
                <div className="mt-4 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/10 px-4 py-3 text-sm text-[#EF4444]">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#4CC950] to-[#2E9E38] px-6 py-3.5 text-sm font-bold text-white shadow-[0_10px_30px_rgba(76,201,80,0.35)] transition hover:shadow-[0_14px_40px_rgba(76,201,80,0.5)] active:scale-[0.98] disabled:opacity-60"
              >
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <ShieldCheck className="h-5 w-5" />
                    {isSignUp ? t.createAccount : t.signIn}
                  </>
                )}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-white/50">
              {isSignUp ? t.haveAccount : t.noAccount}{' '}
              <button
                onClick={() => onSwitch(isSignUp ? 'signin' : 'signup')}
                className="font-semibold text-[#4CC950] transition hover:text-[#7CFC7C]"
              >
                {isSignUp ? t.switchToSignIn : t.switchToSignUp}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

interface FieldProps {
  icon: React.ReactNode;
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoComplete?: string;
  trailing?: React.ReactNode;
}

function Field({
  icon,
  label,
  type,
  value,
  onChange,
  placeholder,
  autoComplete,
  trailing,
}: FieldProps) {
  return (
    <div className="mt-4 first:mt-0">
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/50">
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40">
          {icon}
        </span>
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-3 pl-11 pr-11 text-sm text-white placeholder-white/30 outline-none transition focus:border-[#4CC950]/50 focus:bg-white/[0.07]"
        />
        {trailing && (
          <span className="absolute right-3.5 top-1/2 -translate-y-1/2">
            {trailing}
          </span>
        )}
      </div>
    </div>
  );
}
