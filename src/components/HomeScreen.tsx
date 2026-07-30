import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Play,
  Star,
  ChevronLeft,
  ChevronRight,
  Search,
  Flame,
  TrendingUp,
  User,
  Crown,
  Home as HomeIcon,
  Bookmark,
  X,
} from 'lucide-react';
import type { Show, ShowWithGenres, Genre } from '@/lib/types';
import { fetchFeaturedShows, fetchAllShows, fetchGenres } from '@/lib/api';
import ShowCard from '@/components/ShowCard';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { useLang } from '@/lib/useLang';
import { appText } from '@/lib/appTranslations';

interface HomeScreenProps {
  onSelectShow: (show: Show) => void;
  onOpenProfile: () => void;
  onOpenSubscription: () => void;
  onOpenWatchlist: () => void;
  avatarUrl: string | null;
  subscribed: boolean;
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
}

export type Tab = 'home' | 'search' | 'watchlist' | 'account';

const HERO_AUTO_MS = 5500;

export default function HomeScreen({
  onSelectShow,
  onOpenProfile,
  onOpenSubscription,
  onOpenWatchlist,
  avatarUrl,
  subscribed,
  activeTab,
  setActiveTab,
  searchOpen,
  setSearchOpen,
}: HomeScreenProps) {
  const { lang, setLang } = useLang();
  const t = appText[lang];
  const [bannerShows, setBannerShows] = useState<Show[]>([]);
  const [shows, setShows] = useState<ShowWithGenres[]>([]);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [heroIndex, setHeroIndex] = useState(0);
  const [query, setQuery] = useState('');
  const [interacting, setInteracting] = useState(false);

  const touchStartX = useRef(0);
  const autoTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        let banner = f;
        if (f.length < 4) {
          const fallback = [...s].sort((a, b) => b.rating - a.rating);
          const seen = new Set(f.map((x) => x.id));
          banner = [...f, ...fallback.filter((x) => !seen.has(x.id))].slice(0, 10);
        }
        setBannerShows(banner.slice(0, 10));
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

  const wrap = useCallback(
    (i: number) => (bannerShows.length + i) % bannerShows.length,
    [bannerShows.length],
  );

  const goToSlide = useCallback(
    (i: number) => setHeroIndex(wrap(i)),
    [wrap],
  );

  const nextSlide = useCallback(() => goToSlide(heroIndex + 1), [heroIndex, goToSlide]);
  const prevSlide = useCallback(() => goToSlide(heroIndex - 1), [heroIndex, goToSlide]);

  const pauseThenResume = useCallback(() => {
    setInteracting(true);
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => setInteracting(false), 3500);
  }, []);

  // Auto-advance the centered card every ~5.5s, pause while interacting
  useEffect(() => {
    if (bannerShows.length <= 1 || interacting) {
      if (autoTimer.current) clearInterval(autoTimer.current);
      return;
    }
    autoTimer.current = setInterval(() => goToSlide(heroIndex + 1), HERO_AUTO_MS);
    return () => {
      if (autoTimer.current) clearInterval(autoTimer.current);
    };
  }, [bannerShows.length, interacting, heroIndex, goToSlide]);

  const hero = bannerShows[heroIndex];

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

  const heroVisible = hero && !query.trim();

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white">
      {/* Compact header — slim row: logo + tagline on left, controls on right */}
      <header className="fixed inset-x-0 top-0 z-50 bg-[#0A0A0F]/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-3 sm:px-8 sm:py-3.5">
          {/* Logo mark + wordmark + tagline */}
          <button
            onClick={() => {
              setActiveTab('home');
              setQuery('');
            }}
            className="flex items-center gap-2.5"
          >
            <img
              src="/assets/images/logo-transparent.png"
              alt="NINT ANIME"
              className="h-9 w-9 drop-shadow-[0_0_14px_rgba(255,77,94,0.45)]"
            />
            <div className="flex flex-col leading-none">
              <span
                className="text-lg font-black tracking-wider text-white"
                style={{ fontFamily: '"Bebas Neue", Battambang, Inter, sans-serif' }}
              >
                NINT ANIME
              </span>
              <span className="mt-0.5 hidden text-[10px] font-medium uppercase tracking-[0.2em] text-white/40 sm:inline">
                {t.tagline}
              </span>
            </div>
          </button>

          {/* Desktop nav links */}
          <nav className="ml-4 hidden items-center gap-5 text-sm font-medium text-white/70 md:flex">
            <span className="cursor-pointer text-white transition hover:text-[#FF4D5E]">{t.navHome}</span>
            <span className="cursor-pointer transition hover:text-[#FF4D5E]">{t.navSeries}</span>
            <span className="cursor-pointer transition hover:text-[#FF4D5E]">{t.navMovies}</span>
            <span className="cursor-pointer transition hover:text-[#FF4D5E]">{t.navMyList}</span>
          </nav>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            {/* Desktop search box */}
            <div className="relative hidden sm:block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t.searchPlaceholder}
                className="w-48 rounded-full border border-white/10 bg-white/[0.04] py-2 pl-9 pr-4 text-sm text-white placeholder-white/40 outline-none transition focus:w-64 focus:border-[#FF4D5E]/50 focus:bg-white/[0.07]"
              />
            </div>
            {/* Language switcher — visible on all screens */}
            <LanguageSwitcher lang={lang} onChange={setLang} />
            {/* Subscribe button — visible on all screens */}
            <button
              onClick={onOpenSubscription}
              className="flex items-center gap-1.5 rounded-full border border-[#FFD23F]/30 bg-[#FFD23F]/10 px-3 py-1.5 text-xs font-bold text-[#FFD23F] transition hover:bg-[#FFD23F]/20"
            >
              <Crown className="h-3.5 w-3.5" />
              <span>{subscribed ? t.premium : t.subscribe}</span>
            </button>
            {/* Profile avatar — desktop only, mobile uses bottom nav */}
            <button
              onClick={onOpenProfile}
              className="hidden h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[#FF4D5E] to-[#FFD23F] ring-2 ring-white/10 transition hover:ring-[#FF4D5E]/50 sm:flex"
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
      </header>

      {/* Coverflow hero carousel */}
      {heroVisible && (
        <CoverflowHero
          shows={bannerShows}
          index={heroIndex}
          hero={hero}
          onSelectShow={onSelectShow}
          onPrev={prevSlide}
          onNext={nextSlide}
          onGoTo={goToSlide}
          onTouchStart={(x) => {
            touchStartX.current = x;
            pauseThenResume();
          }}
          onTouchEnd={(x) => {
            const dx = x - touchStartX.current;
            if (dx < -40) nextSlide();
            else if (dx > 40) prevSlide();
          }}
          t={t}
        />
      )}

      {/* Content rows */}
      <main className="mx-auto max-w-[1400px] px-4 pb-28 sm:px-8 sm:pb-20">
        {query.trim() ? (
          <section className="pt-28">
            <h2 className="mb-5 text-xl font-bold">
              {t.resultsFor} &ldquo;{query}&rdquo;{' '}
              <span className="text-white/40">({filteredShows.length})</span>
            </h2>
            {filteredShows.length === 0 ? (
              <p className="py-20 text-center text-white/40">{t.noResults}</p>
            ) : (
              <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {filteredShows.map((s) => (
                  <ShowCard key={s.id} show={s} onClick={onSelectShow} />
                ))}
              </div>
            )}
          </section>
        ) : (
          <div className={heroVisible ? 'pt-2' : 'pt-28'}>
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

      {/* Bottom navigation bar — mobile only */}
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#0A0A0F]/95 backdrop-blur-md md:hidden">
        <div className="mx-auto flex max-w-md items-center justify-around px-2 py-2">
          <BottomTab
            icon={<HomeIcon className="h-5 w-5" />}
            label={t.navHome}
            active={activeTab === 'home'}
            onClick={() => setActiveTab('home')}
          />
          <BottomTab
            icon={<Search className="h-5 w-5" />}
            label={t.navSearch}
            active={searchOpen}
            onClick={() => setSearchOpen(true)}
          />
          <BottomTab
            icon={<Bookmark className="h-5 w-5" />}
            label={t.navWatchlist}
            active={activeTab === 'watchlist'}
            onClick={onOpenWatchlist}
          />
          <BottomTab
            icon={<User className="h-5 w-5" />}
            label={t.navAccount}
            active={activeTab === 'account'}
            onClick={onOpenProfile}
          />
        </div>
      </nav>

      {/* Full-screen search overlay (mobile) */}
      {searchOpen && (
        <div className="fixed inset-0 z-[60] bg-[#0A0A0F] md:hidden">
          <div className="flex items-center gap-3 border-b border-white/10 px-4 py-4">
            <Search className="h-5 w-5 text-white/40" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.searchPlaceholder}
              className="flex-1 bg-transparent text-base text-white placeholder-white/40 outline-none"
            />
            <button
              onClick={() => {
                setSearchOpen(false);
                setQuery('');
              }}
              className="rounded-full p-1.5 text-white/60 transition hover:text-white"
              aria-label="Close search"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="h-[calc(100%-65px)] overflow-y-auto px-4 py-4">
            {query.trim() ? (
              filteredShows.length === 0 ? (
                <p className="py-20 text-center text-white/40">{t.noResults}</p>
              ) : (
                <div className="grid grid-cols-3 gap-x-3 gap-y-5">
                  {filteredShows.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        setSearchOpen(false);
                        setQuery('');
                        onSelectShow(s);
                      }}
                      className="text-left"
                    >
                      <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-[#1E1E2A] ring-1 ring-white/5">
                        <img
                          src={s.poster_url ?? ''}
                          alt={s.title}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <h3 className="mt-1.5 truncate text-xs font-semibold text-white">
                        {s.title}
                      </h3>
                    </button>
                  ))}
                </div>
              )
            ) : (
              <div className="flex flex-col items-center gap-3 py-20 text-center">
                <Search className="h-10 w-10 text-white/20" />
                <p className="text-sm text-white/40">{t.searchHint}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Coverflow hero ---------- */

type TranslationText = {
  featured: string;
  play: string;
};

interface CoverflowHeroProps {
  shows: Show[];
  index: number;
  hero: Show;
  onSelectShow: (s: Show) => void;
  onPrev: () => void;
  onNext: () => void;
  onGoTo: (i: number) => void;
  onTouchStart: (x: number) => void;
  onTouchEnd: (x: number) => void;
  t: TranslationText;
}

function CoverflowHero({
  shows,
  index,
  hero,
  onSelectShow,
  onPrev,
  onNext,
  onGoTo,
  onTouchStart,
  onTouchEnd,
  t,
}: CoverflowHeroProps) {
  const [bgLoaded, setBgLoaded] = useState(false);
  const bg = hero.banner_url ?? hero.poster_url ?? '';

  // Reset the loaded flag whenever the background image changes so the
  // crossfade restarts for each new centered show.
  useEffect(() => {
    setBgLoaded(false);
  }, [hero.id]);

  return (
    <section
      className="relative w-full overflow-hidden pt-[72px]"
      style={{ height: 'min(52vh, 440px)' }}
      onTouchStart={(e) => onTouchStart(e.touches[0].clientX)}
      onTouchEnd={(e) => onTouchEnd(e.changedTouches[0].clientX)}
    >
      {/* Blurred ambient background driven by the centered show */}
      <div className="pointer-events-none absolute inset-0">
        {bg && (
          <img
            key={hero.id}
            src={bg}
            alt=""
            aria-hidden
            className={`hero-bg ${bgLoaded ? 'loaded' : ''} absolute inset-0 h-full w-full scale-125 object-cover blur-3xl`}
            onLoad={() => setBgLoaded(true)}
            draggable={false}
          />
        )}
        {/* Warm gold/orange ambient glow blending with the app palette */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 85% 65% at 50% 22%, rgba(255,170,60,0.22) 0%, rgba(10,10,15,0) 62%), radial-gradient(ellipse 65% 55% at 72% 82%, rgba(255,77,94,0.20) 0%, rgba(10,10,15,0) 58%)',
          }}
        />
        <div className="absolute inset-0 bg-[#0A0A0F]/35" />
        {/* Fade the top into the header and the bottom into the page */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(10,10,15,0.85) 0%, rgba(10,10,15,0) 20%, rgba(10,10,15,0) 68%, rgba(10,10,15,1) 100%)',
          }}
        />
      </div>

      {/* Cards deck */}
      <div className="relative flex h-full items-center justify-center">
        {shows.length > 1 &&
          [-2, -1, 1, 2].map((offset) => {
            const i = (shows.length + index + offset) % shows.length;
            return (
              <SideCard
                key={shows[i].id}
                show={shows[i]}
                offset={offset}
                onClick={() => onGoTo(i)}
              />
            );
          })}

        {/* Center featured card */}
        <button
          onClick={() => onSelectShow(hero)}
          className="relative z-20 flex flex-col items-center"
          style={{
            width: '38%',
            maxWidth: 190,
            transform: 'translateZ(0)',
          }}
        >
          <div
            className="relative aspect-[2/3] w-full overflow-hidden rounded-2xl transition-transform duration-500"
            style={{
              boxShadow:
                '0 30px 70px rgba(0,0,0,0.75), 0 8px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,210,120,0.25), 0 0 32px rgba(255,170,60,0.18)',
            }}
          >
            {/* subtle premium gold border */}
            <div className="pointer-events-none absolute inset-0 z-10 rounded-2xl ring-1 ring-inset ring-white/20" />
            <img
              src={hero.poster_url ?? hero.banner_url ?? ''}
              alt={hero.title}
              className="h-full w-full object-cover"
              draggable={false}
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(180deg, rgba(10,10,15,0) 42%, rgba(10,10,15,0.6) 74%, rgba(10,10,15,0.96) 100%)',
              }}
            />
            {/* FEATURED pill */}
            <span
              className="absolute left-2.5 top-2.5 rounded-md px-2 py-[3px] text-[10px] font-bold uppercase tracking-wider text-black shadow-lg"
              style={{ background: 'linear-gradient(135deg, #FFD23F, #FFAA3C)' }}
            >
              {t.featured}
            </span>
            {/* Title + rating */}
            <div className="absolute inset-x-0 bottom-0 px-3 pb-3 text-center">
              <h2
                className="truncate text-base font-black leading-tight text-white sm:text-lg"
                style={{ fontFamily: '"Bebas Neue", Battambang, Inter, sans-serif', letterSpacing: '0.02em' }}
              >
                {hero.title.toUpperCase()}
              </h2>
              <div className="mt-0.5 flex items-center justify-center gap-1 text-xs font-semibold text-[#FFD23F]">
                <Star className="h-3 w-3 fill-[#FFD23F]" /> {Number(hero.rating).toFixed(1)}
              </div>
            </div>
          </div>

          {/* Play button — featured card only */}
          <div
            className="mt-3 flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-black shadow-lg transition active:scale-95"
            style={{ background: 'linear-gradient(135deg, #FFFFFF, #F1F1F1)' }}
          >
            <Play className="h-4 w-4 fill-black" /> {t.play}
          </div>
        </button>

        {/* Chevron arrows — desktop only, swipe handles mobile */}
        <button
          onClick={onPrev}
          className="absolute left-4 z-30 hidden h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/60 active:scale-90 md:flex"
          aria-label="Previous"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <button
          onClick={onNext}
          className="absolute right-4 z-30 hidden h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/60 active:scale-90 md:flex"
          aria-label="Next"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      </div>

      {/* Dot indicators */}
      {shows.length > 1 && (
        <div className="absolute inset-x-0 bottom-3 z-30 flex justify-center gap-1.5">
          {shows.map((_, i) => (
            <button
              key={i}
              onClick={() => onGoTo(i)}
              aria-label={`Go to slide ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? 'w-5 bg-[#FF4D5E]' : 'w-1.5 bg-white/40'
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
}

interface SideCardProps {
  show: Show;
  offset: number; // -2, -1, 1, 2
  onClick: () => void;
}

function SideCard({ show, offset, onClick }: SideCardProps) {
  const isNear = Math.abs(offset) === 1;
  const translateX = offset * 82;
  const scale = isNear ? 0.62 : 0.46;
  const z = isNear ? 10 : 5;
  const opacity = isNear ? 0.75 : 0.28;

  return (
    <button
      onClick={onClick}
      className="absolute z-10"
      style={{
        width: '38%',
        maxWidth: 190,
        transform: `translateX(${translateX}%) scale(${scale})`,
        zIndex: z,
        opacity,
        transition: 'transform 0.5s cubic-bezier(0.22,1,0.36,1), opacity 0.5s ease',
        pointerEvents: 'auto',
      }}
      aria-label={show.title}
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-2xl shadow-[0_16px_40px_rgba(0,0,0,0.6)] ring-1 ring-white/10">
        <img
          src={show.poster_url ?? show.banner_url ?? ''}
          alt={show.title}
          className="h-full w-full object-cover"
          draggable={false}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(10,10,15,0) 50%, rgba(10,10,15,0.85) 100%)',
          }}
        />
        <div className="absolute inset-x-0 bottom-0 px-3 pb-3 text-center">
          <p className="truncate text-sm font-bold text-white">{show.title}</p>
          <div className="mt-0.5 flex items-center justify-center gap-1 text-xs font-semibold text-[#FFD23F]">
            <Star className="h-3 w-3 fill-[#FFD23F]" /> {Number(show.rating).toFixed(1)}
          </div>
        </div>
      </div>
    </button>
  );
}

/* ---------- Bottom tab ---------- */

interface BottomTabProps {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}

function BottomTab({ icon, label, active, onClick }: BottomTabProps) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 flex-col items-center gap-1 rounded-lg py-1.5 transition ${
        active ? 'text-[#FF4D5E]' : 'text-white/50'
      }`}
    >
      {icon}
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}

/* ---------- Content rail row ---------- */

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
