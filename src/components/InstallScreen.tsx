import { useEffect, useMemo, useState } from 'react';
import { Shield, Sparkles, Film, ChevronRight, Globe } from 'lucide-react';
import { fetchShowcaseShows } from '@/lib/api';
import type { Show } from '@/lib/types';
import { installScreenText, type Lang } from '@/lib/installScreenTranslations';

const LANG_STORAGE_KEY = 'nint-anime-lang';

interface InstallScreenProps {
  /** already signed in — go straight to the app */
  hasSession: boolean;
  onEnter: () => void;
  onSignIn: () => void;
  onSignUp: () => void;
}

export default function InstallScreen({
  hasSession,
  onEnter,
  onSignIn,
  onSignUp,
}: InstallScreenProps) {
  const [shows, setShows] = useState<Show[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [lang, setLang] = useState<Lang>(() => {
    if (typeof window === 'undefined') return 'en';
    const saved = window.localStorage.getItem(LANG_STORAGE_KEY);
    return saved === 'km' || saved === 'en' ? saved : 'en';
  });

  const t = installScreenText[lang];
  const isKm = lang === 'km';

  const handleLangChange = (next: Lang) => {
    setLang(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LANG_STORAGE_KEY, next);
    }
  };

  useEffect(() => {
    let active = true;
    fetchShowcaseShows(10)
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

  // Rotate which poster drives the big background glow, so the
  // hero feels alive instead of a single static backdrop.
  useEffect(() => {
    if (shows.length < 2) return;
    const id = setInterval(() => {
      setActiveIndex((i) => (i + 1) % shows.length);
    }, 4500);
    return () => clearInterval(id);
  }, [shows.length]);

  const cards = useMemo(() => shows.slice(0, 10), [shows]);
  const active = cards[activeIndex] ?? cards[0];
  const backdrop = active?.banner_url ?? active?.poster_url ?? null;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0A0A0F] text-white flex flex-col">
      {/* Big background bleed — the active card's own art, heavily blurred and glowing */}
      {backdrop && (
        <div className="pointer-events-none absolute inset-0 transition-opacity duration-1000">
          <div
            className="absolute inset-0 bg-cover bg-center opacity-40 blur-3xl scale-125"
            style={{ backgroundImage: `url(${backdrop})` }}
          />
          <div
            className="absolute inset-0 opacity-60 mix-blend-screen bg-cover bg-center blur-2xl scale-110"
            style={{ backgroundImage: `url(${backdrop})` }}
          />
        </div>
      )}
      {/* Ambient color glow */}
      <div
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{
          background:
            'radial-gradient(circle at 20% 0%, rgba(76,201,80,0.20) 0%, rgba(10,10,15,0) 50%), radial-gradient(circle at 85% 100%, rgba(76,201,80,0.12) 0%, rgba(10,10,15,0) 50%)',
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#0A0A0F]/40 via-[#0A0A0F]/70 to-[#0A0A0F]" />

      {/* Language switcher */}
      <div className="relative z-20 flex justify-end px-6 pt-5">
        <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1 backdrop-blur-sm">
          <Globe className="ml-2 h-3.5 w-3.5 text-white/40" />
          <button
            type="button"
            onClick={() => handleLangChange('en')}
            aria-pressed={lang === 'en'}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              lang === 'en'
                ? 'bg-[#4CC950] text-black'
                : 'text-white/60 hover:text-white'
            }`}
          >
            English
          </button>
          <button
            type="button"
            onClick={() => handleLangChange('km')}
            aria-pressed={lang === 'km'}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition font-khmer ${
              lang === 'km'
                ? 'bg-[#4CC950] text-black'
                : 'text-white/60 hover:text-white'
            }`}
          >
            ខ្មែរ
          </button>
        </div>
      </div>

      <div className="relative z-10 flex flex-1 flex-col items-center px-6 pb-10 pt-4 sm:pb-14">
        {/* Logo mark */}
        <div className="mb-6 flex flex-col items-center gap-2">
          <img
            src="/assets/images/logo-transparent.png"
            alt="NINT ANIME"
            className="h-24 w-24 sm:h-28 sm:w-28 drop-shadow-[0_0_25px_rgba(76,201,80,0.45)]"
          />
          <p
            className={`text-xs font-medium uppercase tracking-[0.3em] text-white/50 ${
              isKm ? 'font-khmer tracking-normal' : ''
            }`}
          >
            {t.tagline}
          </p>
        </div>

        {/* Hero copy */}
        <div className="max-w-xl text-center">
          <h2 className={`text-2xl font-bold leading-tight sm:text-3xl ${isKm ? 'font-khmer' : ''}`}>
            {t.headlineLine1}
            <br />
            <span className="bg-gradient-to-r from-[#7CFC7C] to-[#3FA34D] bg-clip-text text-transparent">
              {t.headlineLine2}
            </span>
          </h2>
        </div>

        {/* Poster carousel — glowing cards, scrolls horizontally, 4-10 shows */}
        {cards.length > 0 && (
          <div className="mt-7 w-full max-w-3xl">
            <div className="flex gap-3 overflow-x-auto pb-3 px-1 snap-x snap-mandatory scrollbar-none [-webkit-overflow-scrolling:touch]">
              {cards.map((show, i) => {
                const isActive = i === activeIndex;
                return (
                  <button
                    key={show.id}
                    onClick={() => setActiveIndex(i)}
                    className={`group relative aspect-[2/3] w-24 sm:w-28 flex-shrink-0 snap-start overflow-hidden rounded-xl border transition-all duration-300 ${
                      isActive
                        ? 'border-[#4CC950]/70 scale-105'
                        : 'border-white/10 opacity-70 hover:opacity-100'
                    }`}
                    style={
                      isActive
                        ? { boxShadow: '0 0 0 1px rgba(76,201,80,0.3), 0 12px 34px rgba(76,201,80,0.45)' }
                        : undefined
                    }
                  >
                    {show.poster_url ? (
                      <img
                        src={show.poster_url}
                        alt={show.title}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-[#14141C]">
                        <Film className="h-6 w-6 text-white/20" />
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-1.5 py-1.5">
                      <p className="truncate text-[10px] font-semibold text-white">{show.title}</p>
                    </div>
                  </button>
                );
              })}
            </div>
            {/* dot indicators */}
            <div className="mt-2 flex justify-center gap-1.5">
              {cards.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i === activeIndex ? 'w-4 bg-[#4CC950]' : 'w-1.5 bg-white/20'
                  }`}
                />
              ))}
            </div>
          </div>
        )}

        {/* Feature pills */}
        <div className="mt-7 grid w-full max-w-lg grid-cols-3 gap-3">
          {[
            { icon: Film, label: t.featureMovies },
            { icon: Shield, label: t.featureAdFree },
            { icon: Sparkles, label: t.featureOriginals },
          ].map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-4 backdrop-blur-sm transition hover:border-white/20 hover:bg-white/[0.06]"
            >
              <Icon className="h-5 w-5 text-[#4CC950]" />
              <span className={`text-xs font-medium text-white/70 ${isKm ? 'font-khmer' : ''}`}>
                {label}
              </span>
            </div>
          ))}
        </div>

        {/* CTA buttons */}
        <div className="mt-8 w-full max-w-sm">
          {hasSession ? (
            <button
              onClick={onEnter}
              className={`group flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#4CC950] to-[#2E9E38] px-6 py-4 text-base font-semibold text-white shadow-[0_10px_30px_rgba(76,201,80,0.35)] transition hover:shadow-[0_14px_40px_rgba(76,201,80,0.5)] active:scale-[0.98] ${isKm ? 'font-khmer' : ''}`}
            >
              {t.enter}
              <ChevronRight className="h-5 w-5 transition group-hover:translate-x-1" />
            </button>
          ) : (
            <div className="flex flex-col gap-3">
              <button
                onClick={onSignUp}
                className={`group flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#4CC950] to-[#2E9E38] px-6 py-4 text-base font-semibold text-white shadow-[0_10px_30px_rgba(76,201,80,0.35)] transition hover:shadow-[0_14px_40px_rgba(76,201,80,0.5)] active:scale-[0.98] ${isKm ? 'font-khmer' : ''}`}
              >
                {t.createAccount}
                <ChevronRight className="h-5 w-5 transition group-hover:translate-x-1" />
              </button>
              <button
                onClick={onSignIn}
                className={`flex w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/[0.04] px-6 py-4 text-base font-semibold text-white transition hover:bg-white/[0.08] active:scale-[0.98] ${isKm ? 'font-khmer' : ''}`}
              >
                {t.signIn}
              </button>
            </div>
          )}
          <p className={`mt-4 text-center text-xs text-white/40 ${isKm ? 'font-khmer' : ''}`}>
            {t.terms}
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="relative z-10 border-t border-white/5 px-6 py-5">
        <div className={`mx-auto flex max-w-5xl items-center justify-between text-xs text-white/40 ${isKm ? 'font-khmer' : ''}`}>
          <span>© 2026 NINT ANIME</span>
          <div className="flex items-center gap-5">
            <span className="cursor-pointer transition hover:text-white/70">{t.help}</span>
            <span className="cursor-pointer transition hover:text-white/70">{t.privacy}</span>
            <span className="cursor-pointer transition hover:text-white/70">{t.termsFooter}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
