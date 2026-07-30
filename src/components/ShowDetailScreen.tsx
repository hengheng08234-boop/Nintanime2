import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Play,
  Star,
  Plus,
  Calendar,
  Building2,
  Clock,
  ChevronRight,
  Lock,
} from 'lucide-react';
import type { Show, ShowWithGenres, Episode } from '@/lib/types';
import { fetchShowById, fetchEpisodesByShow } from '@/lib/api';
import { useLang } from '@/lib/useLang';
import { appText } from '@/lib/appTranslations';

interface ShowDetailScreenProps {
  show: Show;
  onBack: () => void;
  onPlayEpisode: (episode: Episode, show: ShowWithGenres) => void;
  subscribed: boolean;
}

export default function ShowDetailScreen({
  show,
  onBack,
  onPlayEpisode,
  subscribed,
}: ShowDetailScreenProps) {
  const { lang } = useLang();
  const t = appText[lang];
  const [detail, setDetail] = useState<ShowWithGenres | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [d, eps] = await Promise.all([
          fetchShowById(show.id),
          fetchEpisodesByShow(show.id),
        ]);
        if (!active) return;
        setDetail(d);
        setEpisodes(eps);
      } catch (e: unknown) {
        if (!active) return;
        setError(e instanceof Error ? e.message : 'Failed to load show');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [show.id]);

  const fmtDuration = (mins: number | null) =>
    mins ? `${Math.floor(mins / 60) > 0 ? Math.floor(mins / 60) + 'h ' : ''}${mins % 60}m` : '';

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white">
      {/* Back bar */}
      <button
        onClick={onBack}
        className="fixed left-4 top-4 z-50 flex items-center gap-2 rounded-full border border-white/10 bg-black/50 px-4 py-2 text-sm font-medium text-white/80 backdrop-blur-md transition hover:bg-black/70 hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" /> {t.back}
      </button>

      {/* Banner */}
      <div className="relative h-[56vh] min-h-[380px] w-full">
        <img
          src={show.banner_url ?? show.poster_url ?? ''}
          alt={show.title}
          className="h-full w-full object-cover"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(90deg, rgba(10,10,15,0.85) 0%, rgba(10,10,15,0.4) 50%, rgba(10,10,15,0.2) 100%), linear-gradient(0deg, rgba(10,10,15,1) 0%, rgba(10,10,15,0) 45%)',
          }}
        />
      </div>

      {/* Detail content overlapping banner */}
      <div className="relative z-10 mx-auto -mt-40 max-w-[1200px] px-4 pb-20 sm:px-8">
        <div className="flex flex-col gap-8 md:flex-row">
          {/* Poster */}
          <div className="hidden md:block">
            <img
              src={show.poster_url ?? ''}
              alt={show.title}
              className="w-56 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.6)] ring-1 ring-white/10"
            />
          </div>

          {/* Info */}
          <div className="flex-1">
            <h1
              className="text-4xl font-black leading-tight sm:text-5xl"
              style={{ fontFamily: '"Bebas Neue", Battambang, Inter, sans-serif', letterSpacing: '0.02em' }}
            >
              {show.title.toUpperCase()}
            </h1>

            {/* Meta row */}
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              <span className="flex items-center gap-1 font-semibold text-[#FFD23F]">
                <Star className="h-4 w-4 fill-[#FFD23F]" /> {Number(show.rating).toFixed(1)}
              </span>
              <span className="h-1 w-1 rounded-full bg-white/30" />
              <span className="flex items-center gap-1 text-white/70">
                <Calendar className="h-4 w-4" /> {show.release_year ?? '—'}
              </span>
              <span className="h-1 w-1 rounded-full bg-white/30" />
              <span className="rounded border border-white/20 px-2 py-0.5 text-xs font-medium uppercase text-white/70">
                {show.type === 'movie' ? t.movie : t.series}
              </span>
              <span className="h-1 w-1 rounded-full bg-white/30" />
              <span
                className={`rounded px-2 py-0.5 text-xs font-semibold ${
                  show.status === 'ongoing'
                    ? 'bg-[#22C55E]/15 text-[#22C55E]'
                    : 'bg-white/10 text-white/60'
                }`}
              >
                {show.status === 'ongoing' ? t.ongoing : t.completed}
              </span>
            </div>

            {/* Genres */}
            {detail?.genres && detail.genres.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {detail.genres.map((g) => (
                  <span
                    key={g.id}
                    className="rounded-full bg-white/[0.06] px-3 py-1 text-xs font-medium text-white/70 ring-1 ring-white/10"
                  >
                    {g.name}
                  </span>
                ))}
              </div>
            )}

            {/* Synopsis */}
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/70">
              {show.synopsis}
            </p>

            {/* Studio */}
            {show.studio && (
              <p className="mt-4 flex items-center gap-2 text-sm text-white/50">
                <Building2 className="h-4 w-4" /> {t.studio} {show.studio}
              </p>
            )}

            {/* Actions */}
            <div className="mt-6 flex items-center gap-3">
              <button
                onClick={() => {
                  if (episodes.length > 0 && detail) onPlayEpisode(episodes[0], detail);
                }}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#FF4D5E] to-[#E63946] px-7 py-3 text-sm font-bold text-white shadow-[0_10px_30px_rgba(255,77,94,0.35)] transition hover:shadow-[0_14px_40px_rgba(255,77,94,0.5)] active:scale-95"
              >
                <Play className="h-5 w-5 fill-white" />
                {show.type === 'movie' ? t.playMovie : t.playFirstEpisode}
              </button>
              <button className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-bold text-white backdrop-blur-sm transition hover:bg-white/20">
                <Plus className="h-5 w-5" /> {t.myList}
              </button>
            </div>
          </div>
        </div>

        {/* Episodes */}
        {show.type !== 'movie' && (
          <div className="mt-12">
            <h2 className="mb-4 text-xl font-bold">{t.episodesHeading}</h2>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-24 animate-pulse rounded-xl bg-[#1E1E2A]" />
                ))}
              </div>
            ) : error ? (
              <p className="text-sm text-[#FF4D5E]">{error}</p>
            ) : episodes.length === 0 ? (
              <p className="text-sm text-white/40">{t.noEpisodes}</p>
            ) : (
              <div className="space-y-3">
                {episodes.map((ep) => {
                  const locked = !subscribed && !ep.is_free;
                  return (
                    <button
                      key={ep.id}
                      onClick={() => detail && onPlayEpisode(ep, detail)}
                      className={`group flex w-full items-center gap-4 overflow-hidden rounded-xl border p-3 text-left transition ${
                        locked
                          ? 'border-white/5 bg-[#14141C]/70 hover:border-[#FFD23F]/30 hover:bg-[#1E1E2A]/80'
                          : 'border-white/5 bg-[#14141C] hover:border-[#FF4D5E]/30 hover:bg-[#1E1E2A]'
                      }`}
                    >
                      <div className="relative aspect-video w-40 shrink-0 overflow-hidden rounded-lg sm:w-48">
                        <img
                          src={ep.thumbnail_url ?? show.banner_url ?? ''}
                          alt={ep.title}
                          loading="lazy"
                          className={`h-full w-full object-cover transition group-hover:scale-105 ${
                            locked ? 'brightness-[0.45] saturate-[0.6]' : ''
                          }`}
                        />
                        {locked ? (
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/25">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-black/60 ring-1 ring-[#FFD23F]/40 backdrop-blur-sm">
                              <Lock className="h-4 w-4 text-[#FFD23F]" />
                            </div>
                            <span className="rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#FFD23F]">
                              {t.epLockedBadge}
                            </span>
                          </div>
                        ) : (
                          <>
                            <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition group-hover:opacity-100">
                              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FF4D5E]">
                                <Play className="h-4 w-4 fill-white text-white" />
                              </div>
                            </div>
                            {ep.is_free && (
                              <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full bg-[#22C55E]/90 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-black">
                                <Star className="h-2.5 w-2.5 fill-black" />
                                {t.epFreeBadge}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-white/50">
                            {t.epShort} {ep.episode_number}
                          </span>
                          {ep.duration && (
                            <span className="flex items-center gap-1 text-xs text-white/40">
                              <Clock className="h-3 w-3" /> {fmtDuration(ep.duration)}
                            </span>
                          )}
                          {locked && (
                            <span className="flex items-center gap-1 text-xs font-semibold text-[#FFD23F]/80">
                              <Lock className="h-3 w-3" /> {t.epLockedNote}
                            </span>
                          )}
                        </div>
                        <h3 className="mt-0.5 truncate text-base font-semibold text-white transition group-hover:text-[#FF4D5E]">
                          {ep.title}
                        </h3>
                        <p className="mt-1 line-clamp-1 text-sm text-white/50">
                          {ep.description}
                        </p>
                      </div>
                      <ChevronRight className="hidden h-5 w-5 shrink-0 text-white/30 transition group-hover:text-[#FF4D5E] sm:block" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
