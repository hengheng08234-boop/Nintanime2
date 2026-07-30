import { useEffect, useState, useCallback } from 'react';
import { Play, Info, Star, ChevronLeft, ChevronRight, Search, Flame, TrendingUp, User, Crown, Clock } from 'lucide-react';
import type { Show, ShowWithGenres, Genre } from '@/lib/types';
import {
  fetchFeaturedShows,
  fetchAllShows,
  fetchGenres,
} from '@/lib/api';
import ShowCard from '@/components/ShowCard';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { useLang } from '@/lib/useLang';
import { appText } from '@/lib/appTranslations';

interface HomeScreenProps {
  onSelectShow: (show: Show) => void;
  onOpenProfile: () => void;
  onOpenSubscription: () => void;
  avatarUrl: string | null;
  subscribed: boolean;
}

export default function HomeScreen({ onSelectShow, onOpenProfile, onOpenSubscription, avatarUrl, subscribed }: HomeScreenProps) {
  const { lang, setLang } = useLang();
  const t = appText[lang];
  const [featured, setFeatured] = useState<Show[]>([]);
  const [shows, setShows] = useState<ShowWithGenres[]>([]);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [heroIndex, setHeroIndex] = useState(0);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [f, s, g] = await Promise.all([
          fetchFeaturedShows(),
          fetchAllShows(),
          fetchGenres(),
        ]);
        if (!active) return;
        setFeatured(f);
        setShows(s);
        setGenres(g);
      } catch (e: unknown) {
        if (!active) return;
        setError(e instanceof Error ? e.message : 'Failed to load content');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Auto-advance hero
  useEffect(() => {
    if (featured.length <= 1) return;
    const t = setInterval(
      () => setHeroIndex((i) => (i + 1) % featured.length),
      7000,
    );
    return () => clearInterval(t);
  }, [featured.length]);

  const hero = featured[heroIndex];

  const filteredShows = query.trim()
    ? shows.filter((s) => s.title.toLowerCase().includes(query.toLowerCase()))
    : shows;

  const trending = [...shows].sort((a, b) => b.rating - a.rating).slice(0, 10);

  const showsByGenre = useCallback(
    (slug: string) => shows.filter((s) => s.genres?.some((g) => g.slug === slug)),
    [shows],
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A0A0F]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/10 border-t-[#FF4D5E]" />
          <p className="text-sm text-white/50">{t.loadingLibrary}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A0A0F] px-6">
        <div className="max-w-md text-center">
          <p className="text-lg font-semibold text-[#FF4D5E]">{t.somethingWrong}</p>
          <p className="mt-2 text-sm text-white/60">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white">
      {/* Top nav */}
      <header className="fixed inset-x-0 top-0 z-50">
        <div
          className="transition-colors duration-300"
          style={{
            background:
              'linear-gradient(180deg, rgba(10,10,15,0.95) 0%, rgba(10,10,15,0.6) 70%, rgba(10,10,15,0) 100%)',
          }}
        >
          <div className="mx-auto flex max-w-[1400px] items-center gap-6 px-4 py-4 sm:px-8">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-[#FF4D5E] to-[#E63946] shadow-[0_0_18px_rgba(255,77,94,0.4)]">
                <Play className="h-4 w-4 fill-white text-white" />
              </div>
              <span
                className="text-xl font-black tracking-wider"
                style={{ fontFamily: '"Bebas Neue", Inter, sans-serif' }}
              >
                NINT ANIME
              </span>
            </div>
            <nav className="hidden items-center gap-5 text-sm font-medium text-white/70 md:flex">
              <span className="cursor-pointer text-white transition hover:text-[#FF4D5E]">{t.navHome}</span>
              <span className="cursor-pointer transition hover:text-[#FF4D5E]">{t.navSeries}</span>
              <span className="cursor-pointer transition hover:text-[#FF4D5E]">{t.navMovies}</span>
              <span className="cursor-pointer transition hover:text-[#FF4D5E]">{t.navMyList}</span>
            </nav>
            <div className="ml-auto flex items-center gap-3">
              <div className="relative hidden sm:block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t.searchPlaceholder}
                  className="w-48 rounded-full border border-white/10 bg-white/[0.04] py-2 pl-9 pr-4 text-sm text-white placeholder-white/40 outline-none transition focus:w-64 focus:border-[#FF4D5E]/50 focus:bg-white/[0.07]"
                />
              </div>
              <LanguageSwitcher lang={lang} onChange={setLang} className="hidden sm:flex" />
              <button
                onClick={onOpenSubscription}
                className="flex items-center gap-1.5 rounded-full border border-[#FFD23F]/30 bg-[#FFD23F]/10 px-3 py-1.5 text-xs font-bold text-[#FFD23F] transition hover:bg-[#FFD23F]/20"
              >
                <Crown className="h-3.5 w-3.5" />
                {subscribed ? t.premium : t.subscribe}
              </button>
              <button
                onClick={onOpenProfile}
                className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[#FF4D5E] to-[#FFD23F] ring-2 ring-white/10 transition hover:ring-[#FF4D5E]/50"
                aria-label="Open profile"
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Profile" className="h-full w-full object-cover" />
                ) : (
                  <User className="h-4 w-4 text-white" />
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero carousel */}
      {hero && !query.trim() && (
        <section className="relative h-[78vh] min-h-[520px] w-full">
          <div className="absolute inset-0">
            <img
              key={hero.id}
              src={hero.banner_url ?? hero.poster_url ?? ''}
              alt={hero.title}
              className="h-full w-full object-cover"
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(90deg, rgba(10,10,15,0.95) 0%, rgba(10,10,15,0.5) 45%, rgba(10,10,15,0.1) 100%), linear-gradient(0deg, rgba(10,10,15,1) 0%, rgba(10,10,15,0) 50%)',
              }}
            />
          </div>

          <div className="relative z-10 mx-auto flex h-full max-w-[1400px] flex-col justify-end px-4 pb-16 sm:px-8">
            <div className="max-w-xl">
              <div className="mb-3 flex items-center gap-2">
                <span className="rounded bg-[#FF4D5E] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white">
                  {t.featured}
                </span>
                <span className="flex items-center gap-1 text-sm font-semibold text-[#FFD23F]">
                  <Star className="h-4 w-4 fill-[#FFD23F]" /> {Number(hero.rating).toFixed(1)}
                </span>
                <span className="text-sm text-white/50">{hero.release_year}</span>
              </div>
              <h1
                className="text-5xl font-black leading-[0.95] sm:text-6xl"
                style={{ fontFamily: '"Bebas Neue", Inter, sans-serif', letterSpacing: '0.02em' }}
              >
                {hero.title.toUpperCase()}
              </h1>
              <p className="mt-4 line-clamp-3 text-base leading-relaxed text-white/70">
                {hero.synopsis}
              </p>
              <div className="mt-6 flex items-center gap-3">
                <button
                  onClick={() => onSelectShow(hero)}
                  className="flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-bold text-black transition hover:bg-white/90 active:scale-95"
                >
                  <Play className="h-5 w-5 fill-black" /> {t.play}
                </button>
                <button
                  onClick={() => onSelectShow(hero)}
                  className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-6 py-3 text-sm font-bold text-white backdrop-blur-sm transition hover:bg-white/20"
                >
                  <Info className="h-5 w-5" /> {t.moreInfo}
                </button>
              </div>
            </div>

            {/* Hero dots + arrows */}
            {featured.length > 1 && (
              <div className="mt-8 flex items-center gap-2">
                {featured.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setHeroIndex(i)}
                    aria-label={`Go to slide ${i + 1}`}
                    className={`h-1.5 rounded-full transition-all ${
                      i === heroIndex ? 'w-8 bg-[#FF4D5E]' : 'w-3 bg-white/30 hover:bg-white/50'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Side arrows */}
          {featured.length > 1 && (
            <>
              <button
                onClick={() =>
                  setHeroIndex((i) => (i - 1 + featured.length) % featured.length)
                }
                className="absolute left-2 top-1/2 z-10 hidden -translate-y-1/2 rounded-full border border-white/10 bg-black/40 p-2 text-white/70 backdrop-blur-sm transition hover:bg-black/60 hover:text-white md:block"
                aria-label="Previous"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                onClick={() => setHeroIndex((i) => (i + 1) % featured.length)}
                className="absolute right-2 top-1/2 z-10 hidden -translate-y-1/2 rounded-full border border-white/10 bg-black/40 p-2 text-white/70 backdrop-blur-sm transition hover:bg-black/60 hover:text-white md:block"
                aria-label="Next"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}
        </section>
      )}

      {/* Subscription / VIP promo card */}
      {!subscribed && (
        <div
          className={`mx-auto max-w-[1400px] px-4 sm:px-8 ${
            hero && !query.trim() ? 'pt-6' : 'pt-28'
          }`}
        >
          <div className="relative overflow-hidden rounded-2xl border border-[#FFD23F]/25 bg-gradient-to-br from-[#1A1410] via-[#1E1A15] to-[#1A1410]">
            {/* Decorative glow */}
            <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#FFD23F]/10 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 left-1/3 h-40 w-40 rounded-full bg-[#FF4D5E]/10 blur-3xl" />

            <div className="relative flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
              {/* Left: icon + copy */}
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#FFD23F] to-[#FF4D5E] shadow-[0_0_20px_rgba(255,210,63,0.35)]">
                  <Crown className="h-6 w-6 text-black" />
                </div>
                <div>
                  <p className="text-base font-bold text-white sm:text-lg">{t.unlockAccess}</p>
                  <p className="mt-0.5 text-sm text-white/50">{t.unlockSubtitle}</p>

                  {/* Feature chips */}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {[t.unlockFeature1, t.unlockFeature2, t.unlockFeature3].map((f) => (
                      <span
                        key={f}
                        className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-white/70"
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-[#FFD23F]" />
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right: CTA */}
              <div className="flex shrink-0 items-center gap-3 lg:pl-4">
                <button
                  onClick={onOpenSubscription}
                  className="flex items-center gap-2 rounded-full bg-[#FFD23F] px-5 py-2.5 text-sm font-bold text-black transition hover:bg-[#ffd94f] active:scale-95"
                >
                  <Crown className="h-4 w-4" /> {t.unlockCta}
                </button>
              </div>
            </div>

            {/* Reassurance note: free browsing is never locked */}
            <div className="relative flex items-center gap-2 border-t border-white/5 bg-black/20 px-5 py-2.5 sm:px-6">
              <Clock className="h-3.5 w-3.5 shrink-0 text-white/30" />
              <p className="text-xs text-white/40">{t.freeBrowseNote}</p>
            </div>
          </div>
        </div>
      )}

      {/* Content rows */}
      <main className="mx-auto max-w-[1400px] px-4 pb-20 sm:px-8">
        {query.trim() ? (
          <section className="pt-28">
            <h2 className="mb-5 text-xl font-bold">
              {t.resultsFor} “{query}”{' '}
              <span className="text-white/40">({filteredShows.length})</span>
            </h2>
            {filteredShows.length === 0 ? (
              <p className="py-20 text-center text-white/40">
                {t.noResults}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {filteredShows.map((s) => (
                  <ShowCard key={s.id} show={s} onClick={onSelectShow} />
                ))}
              </div>
            )}
          </section>
        ) : (
          <div className={hero && !query.trim() ? '' : subscribed ? 'pt-28' : 'pt-6'}>
            <RailRow
              icon={<TrendingUp className="h-5 w-5 text-[#FF4D5E]" />}
              title={t.trendingNow}
              shows={trending}
              onSelectShow={onSelectShow}
            />
            <RailRow
              icon={<Flame className="h-5 w-5 text-[#FFD23F]" />}
              title={t.popularSeason}
              shows={shows.slice(0, 10)}
              onSelectShow={onSelectShow}
            />
            {genres.map((g) => {
              const list = showsByGenre(g.slug);
              if (list.length === 0) return null;
              return (
                <RailRow
                  key={g.id}
                  title={g.name}
                  shows={list}
                  onSelectShow={onSelectShow}
                />
              );
            })}
          </div>
        )}
      </main>

      <footer className="border-t border-white/5 px-4 py-8 text-center text-xs text-white/30 sm:px-8">
        {t.footerTagline}
      </footer>
    </div>
  );
}

interface RailRowProps {
  title: string;
  icon?: React.ReactNode;
  shows: Show[];
  onSelectShow: (s: Show) => void;
}

function RailRow({ title, icon, shows, onSelectShow }: RailRowProps) {
  const scrollerRef = useCallback((node: HTMLDivElement | null) => {
    if (node) node.scrollLeft = 0;
  }, []);

  return (
    <section className="mt-10">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h2 className="text-lg font-bold tracking-tight">{title}</h2>
      </div>
      <div
        ref={scrollerRef}
        className="no-scrollbar flex gap-4 overflow-x-auto pb-2"
      >
        {shows.map((s) => (
          <ShowCard key={s.id} show={s} onClick={onSelectShow} />
        ))}
      </div>
    </section>
  );
}
