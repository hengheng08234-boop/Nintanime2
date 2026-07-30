import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Play,
  Info,
  Star,
  ChevronLeft,
  ChevronRight,
  Search,
  Flame,
  TrendingUp,
  User,
  Crown,
  Clock,
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

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const autoTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [interacting, setInteracting] = useState(false);

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
        // Fall back to top-rated shows if fewer than 4 featured exist
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

  // Auto-advance banner every ~5.5s, pause while interacting/swiping
  useEffect(() => {
    if (bannerShows.length <= 1 || interacting) {
      if (autoTimer.current) clearInterval(autoTimer.current);
      return;
    }
    autoTimer.current = setInterval(
      () => setHeroIndex((i) => (i + 1) % bannerShows.length),
      5500,
    );
    return () => {
      if (autoTimer.current) clearInterval(autoTimer.current);
    };
  }, [bannerShows.length, interacting]);

  const goToSlide = useCallback(
    (i: number) => {
      setHeroIndex((i + bannerShows.length) % bannerShows.length);
    },
    [bannerShows.length],
  );

  const syncSlideFromScroll = useCallback(() => {
    const node = scrollerRef.current;
    if (!node || bannerShows.length === 0) return;
    const idx = Math.round(node.scrollLeft / node.clientWidth);
    if (idx !== heroIndex) setHeroIndex(idx);
  }, [bannerShows.length, heroIndex]);

  const handleScroll = useCallback(() => {
    setInteracting(true);
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => {
      setInteracting(false);
      syncSlideFromScroll();
    }, 180);
  }, [syncSlideFromScroll]);

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

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white">
      {/* Top nav — minimal on mobile: logo, lang, subscribe */}
      <header className="fixed inset-x-0 top-0 z-40">
        <div
          className="transition-colors duration-300"
          style={{
            background:
              'linear-gradient(180deg, rgba(10,10,15,0.95) 0%, rgba(10,10,15,0.6) 70%, rgba(10,10,15,0) 100%)',
          }}
        >
          <div className="mx-auto flex max-w-[1400px] items-center gap-4 px-4 py-3.5 sm:px-8 sm:py-4">
            {/* Logo */}
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-[#FF4D5E] to-[#E63946] shadow-[0_0_18px_rgba(255,77,94,0.4)]">
                <Play className="h-4 w-4 fill-white text-white" />
              </div>
              <span
                className="hidden text-xl font-black tracking-wider sm:inline"
                style={{ fontFamily: '"Bebas Neue", Inter, sans-serif' }}
              >
                NINT ANIME
              </span>
            </div>

            {/* Desktop nav links */}
            <nav className="hidden items-center gap-5 text-sm font-medium text-white/70 md:flex">
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
                <span className="hidden xs:inline sm:inline">
                  {subscribed ? t.premium : t.subscribe}
                </span>
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
        </div>
      </header>

      {/* Cover banner carousel — full width, ~55-60vh on mobile */}
      {hero && !query.trim() && (
        <section className="relative w-full">
          <div
            ref={scrollerRef}
            onScroll={handleScroll}
            onTouchStart={() => setInteracting(true)}
            onTouchEnd={() => {
              if (resumeTimer.current) clearTimeout(resumeTimer.current);
              resumeTimer.current = setTimeout(() => {
                setInteracting(false);
                syncSlideFromScroll();
              }, 180);
            }}
            className="no-scrollbar flex w-full snap-x snap-mandatory overflow-x-auto"
            style={{ height: 'min(58vh, 480px)' }}
          >
            {bannerShows.map((s) => (
              <div
                key={s.id}
                className="relative h-full w-full shrink-0 snap-center"
              >
                <img
                  src={s.banner_url ?? s.poster_url ?? ''}
                  alt={s.title}
                  className="h-full w-full object-cover"
                  draggable={false}
                />
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      'linear-gradient(180deg, rgba(10,10,15,0.3) 0%, rgba(10,10,15,0) 35%, rgba(10,10,15,0.6) 75%, rgba(10,10,15,1) 100%)',
                  }}
                />
                {/* Slide content */}
                <div className="absolute inset-x-0 bottom-0 px-4 pb-20 sm:bottom-0 sm:px-8 sm:pb-10">
                  <div className="mx-auto max-w-[1400px]">
                    <div className="max-w-xl">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="rounded bg-[#FF4D5E] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white">
                          {t.featured}
                        </span>
                        <span className="flex items-center gap-1 text-sm font-semibold text-[#FFD23F]">
                          <Star className="h-4 w-4 fill-[#FFD23F]" /> {Number(s.rating).toFixed(1)}
                        </span>
                      </div>
                      <h2
                        className="text-3xl font-black leading-[0.95] sm:text-5xl"
                        style={{ fontFamily: '"Bebas Neue", Inter, sans-serif', letterSpacing: '0.02em' }}
                      >
                        {s.title.toUpperCase()}
                      </h2>
                      <button
                        onClick={() => onSelectShow(s)}
                        className="mt-4 flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-bold text-black transition hover:bg-white/90 active:scale-95"
                      >
                        <Play className="h-5 w-5 fill-black" /> {t.play}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Dot indicators — mobile-friendly, bottom centered */}
          {bannerShows.length > 1 && (
            <div className="absolute inset-x-0 bottom-16 z-10 flex justify-center gap-1.5 sm:bottom-6">
              {bannerShows.map((_, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setHeroIndex(i);
                    scrollerRef.current?.scrollTo({
                      left: i * (scrollerRef.current?.clientWidth ?? 0),
                      behavior: 'smooth',
                    });
                  }}
                  aria-label={`Go to slide ${i + 1}`}
                  className={`h-1.5 rounded-full transition-all ${
                    i === heroIndex ? 'w-5 bg-[#FF4D5E]' : 'w-1.5 bg-white/40'
                  }`}
                />
              ))}
            </div>
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
            <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#FFD23F]/10 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 left-1/3 h-40 w-40 rounded-full bg-[#FF4D5E]/10 blur-3xl" />

            <div className="relative flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#FFD23F] to-[#FF4D5E] shadow-[0_0_20px_rgba(255,210,63,0.35)]">
                  <Crown className="h-6 w-6 text-black" />
                </div>
                <div>
                  <p className="text-base font-bold text-white sm:text-lg">{t.unlockAccess}</p>
                  <p className="mt-0.5 text-sm text-white/50">{t.unlockSubtitle}</p>
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

              <div className="flex shrink-0 items-center gap-3 lg:pl-4">
                <button
                  onClick={onOpenSubscription}
                  className="flex items-center gap-2 rounded-full bg-[#FFD23F] px-5 py-2.5 text-sm font-bold text-black transition hover:bg-[#ffd94f] active:scale-95"
                >
                  <Crown className="h-4 w-4" /> {t.unlockCta}
                </button>
              </div>
            </div>

            <div className="relative flex items-center gap-2 border-t border-white/5 bg-black/20 px-5 py-2.5 sm:px-6">
              <Clock className="h-3.5 w-3.5 shrink-0 text-white/30" />
              <p className="text-xs text-white/40">{t.freeBrowseNote}</p>
            </div>
          </div>
        </div>
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
