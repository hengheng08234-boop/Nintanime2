import { useEffect, useState, useRef } from 'react';
import {
  ArrowLeft,
  Upload,
  Plus,
  Trash2,
  Film,
  Tv,
  Loader2,
  CheckCircle2,
  X,
  Search,
  Video,
  Clock,
  Pencil,
  Link2,
  Lock,
  Unlock,
  Play,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/supabaseClient';
import type { Show, Episode } from '@/lib/types';
import { extractFunctionErrorMessage } from '@/lib/functionError';

interface AdminScreenProps {
  onBack: () => void;
}

interface ShowWithEpisodes extends Show {
  episodes: Episode[];
}

export default function AdminScreen({ onBack }: AdminScreenProps) {
  const [shows, setShows] = useState<ShowWithEpisodes[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedShowId, setSelectedShowId] = useState<string | null>(null);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [addEpOpen, setAddEpOpen] = useState<string | null>(null);
  const [pendingUploadId, setPendingUploadId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pasteUrlFor, setPasteUrlFor] = useState<string | null>(null);
  const [pasteUrlValue, setPasteUrlValue] = useState('');
  const [savingUrlFor, setSavingUrlFor] = useState<string | null>(null);
  const [newEp, setNewEp] = useState({
    episode_number: '',
    season: '1',
    title: '',
    description: '',
    duration: '',
  });
  const [busy, setBusy] = useState(false);

  // Admin preview modal — lets admin check an uploaded episode plays
  // correctly, bypassing the subscription check via the is_admin flag
  // in get-video-url.
  const [previewFor, setPreviewFor] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');

  // New show / movie creation
  const [addShowOpen, setAddShowOpen] = useState(false);
  const [newShow, setNewShow] = useState({
    title: '',
    type: 'series' as 'series' | 'movie',
    synopsis: '',
    release_year: '',
    studio: '',
    featured: false,
  });
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [creatingShow, setCreatingShow] = useState(false);

  // Edit existing show
  const [editShow, setEditShow] = useState<ShowWithEpisodes | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editSynopsis, setEditSynopsis] = useState('');
  const [editRating, setEditRating] = useState('');
  const [editViewCount, setEditViewCount] = useState('');
  const [editPosterFile, setEditPosterFile] = useState<File | null>(null);
  const [editBannerFile, setEditBannerFile] = useState<File | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editSuccess, setEditSuccess] = useState(false);

  const loadShows = async () => {
    setLoading(true);
    const { data: showData, error: showErr } = await supabase
      .from('shows')
      .select('*')
      .order('title', { ascending: true });
    if (showErr) {
      setError(showErr.message);
      setLoading(false);
      return;
    }
    const { data: epData, error: epErr } = await supabase
      .from('episodes')
      .select('*')
      .order('show_id, season, episode_number');
    if (epErr) {
      setError(epErr.message);
      setLoading(false);
      return;
    }
    const epsByShow = (epData ?? []).reduce<Record<string, Episode[]>>((acc, ep) => {
      if (!acc[ep.show_id]) acc[ep.show_id] = [];
      acc[ep.show_id].push(ep);
      return acc;
    }, {});
    setShows(
      (showData ?? []).map((s) => ({
        ...s,
        episodes: epsByShow[s.id] ?? [],
      })),
    );
    setLoading(false);
  };

  useEffect(() => {
    loadShows();
  }, []);

  const filteredShows = search.trim()
    ? shows.filter((s) => s.title.toLowerCase().includes(search.toLowerCase()))
    : shows;

  const triggerFileUpload = (episodeId: string) => {
    setPendingUploadId(episodeId);
    fileInputRef.current?.click();
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const epId = pendingUploadId;
    e.target.value = '';
    setPendingUploadId(null);
    if (file && epId) handleUploadVideo(file, epId);
  };

  const handleUploadVideo = async (file: File, episodeId: string) => {
    setUploadingFor(episodeId);
    setUploadProgress(0);
    setError('');

    const ext = file.name.split('.').pop() || 'mp4';
    const path = `${episodeId}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('videos')
      .upload(path, file, {
        upsert: true,
        contentType: file.type || 'video/mp4',
      });

    if (uploadError) {
      setError(uploadError.message);
      setUploadingFor(null);
      return;
    }

    // The videos bucket is private now — store the bare storage path.
    // Playback resolves it to a short-lived signed URL via the
    // get-video-url Edge Function, never a permanent public URL.
    const { error: updateErr } = await supabase
      .from('episodes')
      .update({ video_url: path })
      .eq('id', episodeId);

    if (updateErr) {
      setError(updateErr.message);
      setUploadingFor(null);
      return;
    }

    setUploadProgress(100);
    setUploadingFor(null);
    setUploadProgress(0);
    await loadShows();
  };

  const handleSaveVideoUrl = async (episodeId: string) => {
    const url = pasteUrlValue.trim();
    if (!url) return;

    setSavingUrlFor(episodeId);
    setError('');

    const { error: updateErr } = await supabase
      .from('episodes')
      .update({ video_url: url })
      .eq('id', episodeId);

    if (updateErr) {
      setError(updateErr.message);
      setSavingUrlFor(null);
      return;
    }

    setSavingUrlFor(null);
    setPasteUrlFor(null);
    setPasteUrlValue('');
    await loadShows();
  };

  const handlePreviewVideo = async (episodeId: string) => {
    setPreviewFor(episodeId);
    setPreviewLoading(true);
    setPreviewError('');
    setPreviewUrl(null);
    const { data, error } = await supabase.functions.invoke('get-video-url', {
      body: { episodeId },
    });
    setPreviewLoading(false);
    if (error || data?.error) {
      setPreviewError(await extractFunctionErrorMessage(error, data));
      return;
    }
    setPreviewUrl(data.url);
  };

  const closePreview = () => {
    setPreviewFor(null);
    setPreviewUrl(null);
    setPreviewError('');
  };

  const handleDeleteEpisode = async (episodeId: string) => {
    if (!confirm('Delete this episode? This cannot be undone.')) return;
    const { error } = await supabase.from('episodes').delete().eq('id', episodeId);
    if (error) {
      setError(error.message);
      return;
    }
    await loadShows();
  };

  // Free-preview episodes are playable by any signed-in user, even
  // without an active subscription — a trial taste of the show. Use
  // sparingly (e.g. episode 1 of a series) so it doesn't undercut the
  // subscription itself.
  const handleToggleFreePreview = async (episodeId: string, next: boolean) => {
    setError('');
    const { error } = await supabase
      .from('episodes')
      .update({ is_free_preview: next })
      .eq('id', episodeId);
    if (error) {
      setError(error.message);
      return;
    }
    await loadShows();
  };

  const handleAddEpisode = async (showId: string, movieTitle?: string) => {
    setBusy(true);
    setError('');
    const { error } = await supabase.from('episodes').insert({
      show_id: showId,
      episode_number: movieTitle ? 1 : parseInt(newEp.episode_number) || 1,
      season: movieTitle ? 1 : parseInt(newEp.season) || 1,
      title: movieTitle || newEp.title.trim() || 'Untitled Episode',
      description: newEp.description.trim() || null,
      duration: newEp.duration ? parseInt(newEp.duration) : null,
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setNewEp({ episode_number: '', season: '1', title: '', description: '', duration: '' });
    setAddEpOpen(null);
    await loadShows();
  };

  const uploadImage = async (
    bucket: 'posters',
    file: File,
    pathPrefix: string,
  ): Promise<string | null> => {
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${pathPrefix}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from(bucket)
      .upload(path, file, { upsert: true, contentType: file.type || 'image/jpeg' });
    if (upErr) {
      setError(upErr.message);
      return null;
    }
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  };

  const handleCreateShow = async () => {
    if (!newShow.title.trim()) {
      setError('Title is required');
      return;
    }
    setCreatingShow(true);
    setError('');

    let poster_url: string | null = null;
    let banner_url: string | null = null;

    if (posterFile) {
      poster_url = await uploadImage('posters', posterFile, 'poster');
      if (posterFile && !poster_url) {
        setCreatingShow(false);
        return;
      }
    }
    if (bannerFile) {
      banner_url = await uploadImage('posters', bannerFile, 'banner');
      if (bannerFile && !banner_url) {
        setCreatingShow(false);
        return;
      }
    }

    const { error: insertErr } = await supabase.from('shows').insert({
      title: newShow.title.trim(),
      type: newShow.type,
      synopsis: newShow.synopsis.trim() || null,
      release_year: newShow.release_year ? parseInt(newShow.release_year) : null,
      studio: newShow.studio.trim() || null,
      featured: newShow.featured,
      poster_url,
      banner_url,
    });

    setCreatingShow(false);
    if (insertErr) {
      setError(insertErr.message);
      return;
    }

    setNewShow({
      title: '',
      type: 'series',
      synopsis: '',
      release_year: '',
      studio: '',
      featured: false,
    });
    setPosterFile(null);
    setBannerFile(null);
    setAddShowOpen(false);
    await loadShows();
  };

  const openEdit = (show: ShowWithEpisodes) => {
    setEditShow(show);
    setEditTitle(show.title);
    setEditSynopsis(show.synopsis ?? '');
    setEditRating(show.rating != null ? String(show.rating) : '');
    setEditViewCount(show.view_count != null ? String(show.view_count) : '0');
    setEditPosterFile(null);
    setEditBannerFile(null);
    setEditSuccess(false);
  };

  const handleSaveEdit = async () => {
    if (!editShow) return;
    if (!editTitle.trim()) {
      setError('Title is required');
      return;
    }
    setSavingEdit(true);
    setError('');

    const updates: Record<string, string | number | null> = {
      title: editTitle.trim(),
      synopsis: editSynopsis.trim() || null,
      rating: editRating.trim() ? parseFloat(editRating) : 0,
      view_count: editViewCount.trim() ? parseInt(editViewCount, 10) || 0 : 0,
    };

    if (editPosterFile) {
      const url = await uploadImage('posters', editPosterFile, `poster-${editShow.id}`);
      if (!url) {
        setSavingEdit(false);
        return;
      }
      updates.poster_url = url;
    }
    if (editBannerFile) {
      const url = await uploadImage('posters', editBannerFile, `banner-${editShow.id}`);
      if (!url) {
        setSavingEdit(false);
        return;
      }
      updates.banner_url = url;
    }

    const { error: updErr } = await supabase
      .from('shows')
      .update(updates)
      .eq('id', editShow.id);

    setSavingEdit(false);
    if (updErr) {
      setError(updErr.message);
      return;
    }

    setEditSuccess(true);
    setTimeout(() => {
      setEditShow(null);
      setEditSuccess(false);
    }, 1200);
    await loadShows();
  };

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0A0A0F]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1200px] items-center gap-4 px-4 py-4 sm:px-8">
          <button
            onClick={onBack}
            className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <h1 className="text-lg font-bold">Admin: Video Management</h1>
          <button
            onClick={() => setAddShowOpen(true)}
            className="flex items-center gap-1.5 rounded-full bg-[#4CC950] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#2E9E38]"
          >
            <Plus className="h-4 w-4" /> New Show
          </button>
          <div className="ml-auto relative hidden sm:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search shows…"
              className="w-56 rounded-full border border-white/10 bg-white/[0.04] py-2 pl-9 pr-4 text-sm text-white placeholder-white/40 outline-none focus:border-[#4CC950]/50"
            />
          </div>
        </div>
      </header>

      {error && (
        <div className="mx-auto max-w-[1200px] px-4 pt-4 sm:px-8">
          <div className="flex items-center gap-2 rounded-xl border border-[#EF4444]/30 bg-[#EF4444]/10 px-4 py-3 text-sm text-[#EF4444]">
            <X className="h-4 w-4 shrink-0" />
            {error}
            <button onClick={() => setError('')} className="ml-auto">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      <main className="mx-auto max-w-[1200px] px-4 py-8 sm:px-8">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-[#4CC950]" />
          </div>
        ) : (
          <div className="space-y-6">
            {filteredShows.map((show) => {
              const isExpanded = selectedShowId === show.id;
              return (
                <div
                  key={show.id}
                  className="overflow-hidden rounded-2xl border border-white/10 bg-[#14141C]"
                >
                  {/* Show header */}
                  <button
                    onClick={() =>
                      setSelectedShowId(isExpanded ? null : show.id)
                    }
                    className="flex w-full items-center gap-4 p-4 text-left transition hover:bg-white/[0.02]"
                  >
                    <div className="h-16 w-12 shrink-0 overflow-hidden rounded-lg bg-[#1E1E2A]">
                      {show.poster_url && (
                        <img
                          src={show.poster_url}
                          alt={show.title}
                          className="h-full w-full object-cover"
                        />
                      )}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-white">{show.title}</h3>
                      <div className="mt-1 flex items-center gap-3 text-xs text-white/50">
                        <span className="flex items-center gap-1">
                          {show.type === 'movie' ? (
                            <Film className="h-3.5 w-3.5" />
                          ) : (
                            <Tv className="h-3.5 w-3.5" />
                          )}
                          {show.type === 'movie' ? 'Movie' : 'Series'}
                        </span>
                        <span className="flex items-center gap-1">
                          <Video className="h-3.5 w-3.5" />
                          {show.episodes.length} episode{show.episodes.length === 1 ? '' : 's'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(show);
                        }}
                        className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/80 transition hover:bg-white/10 hover:text-white"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </button>
                      <span className="text-xs text-white/40">
                        {isExpanded ? 'Collapse' : 'Expand'}
                      </span>
                    </div>
                  </button>

                  {/* Episodes */}
                  {isExpanded && (
                    <div className="border-t border-white/10 px-4 py-4">
                      <div className="space-y-3">
                        {show.episodes.map((ep) => {
                          const hasVideo = !!ep.video_url;
                          const isUploading = uploadingFor === ep.id;
                          return (
                            <div
                              key={ep.id}
                              className="rounded-xl border border-white/5 bg-[#1E1E2A] p-3"
                            >
                              <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/5 text-sm font-bold text-white/60">
                                  {ep.episode_number}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-semibold text-white">
                                    {ep.title}
                                  </p>
                                  <div className="mt-0.5 flex items-center gap-2 text-xs">
                                    {hasVideo ? (
                                      <span className="flex items-center gap-1 text-[#22C55E]">
                                        <CheckCircle2 className="h-3 w-3" /> Video ready
                                      </span>
                                    ) : (
                                      <span className="flex items-center gap-1 text-[#FFD23F]">
                                        <Clock className="h-3 w-3" /> No video uploaded
                                      </span>
                                    )}
                                    {ep.duration && (
                                      <span className="text-white/40">
                                        · {ep.duration} min
                                      </span>
                                    )}
                                    {ep.is_free_preview && (
                                      <span className="flex items-center gap-1 rounded-full bg-[#22C55E]/15 px-2 py-0.5 text-[#22C55E]">
                                        <Unlock className="h-3 w-3" /> Free trial
                                      </span>
                                    )}
                                  </div>
                                  {isUploading && (
                                    <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/10">
                                      <div
                                        className="h-full rounded-full bg-[#4CC950] transition-all"
                                        style={{ width: `${uploadProgress}%` }}
                                      />
                                    </div>
                                  )}
                                </div>
                                <button
                                  onClick={() => handleToggleFreePreview(ep.id, !ep.is_free_preview)}
                                  title={
                                    ep.is_free_preview
                                      ? 'Unlocked for trial — click to require subscription'
                                      : 'Locked — click to unlock as a free trial episode'
                                  }
                                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                                    ep.is_free_preview
                                      ? 'border-[#22C55E]/30 bg-[#22C55E]/10 text-[#22C55E] hover:bg-[#22C55E]/20'
                                      : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10'
                                  }`}
                                >
                                  {ep.is_free_preview ? (
                                    <Unlock className="h-3.5 w-3.5" />
                                  ) : (
                                    <Lock className="h-3.5 w-3.5" />
                                  )}
                                  {ep.is_free_preview ? 'Unlocked' : 'Locked'}
                                </button>
                                {hasVideo && (
                                  <button
                                    onClick={() => handlePreviewVideo(ep.id)}
                                    className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10"
                                  >
                                    <Play className="h-3.5 w-3.5" />
                                    Preview
                                  </button>
                                )}
                                <button
                                  onClick={() => triggerFileUpload(ep.id)}
                                  disabled={isUploading}
                                  className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10 disabled:opacity-50"
                                >
                                  {isUploading ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Upload className="h-3.5 w-3.5" />
                                  )}
                                  {hasVideo ? 'Replace' : 'Upload'}
                                </button>
                                <button
                                  onClick={() => {
                                    if (pasteUrlFor === ep.id) {
                                      setPasteUrlFor(null);
                                      setPasteUrlValue('');
                                    } else {
                                      setPasteUrlFor(ep.id);
                                      setPasteUrlValue(ep.video_url ?? '');
                                    }
                                  }}
                                  className="flex items-center gap-1 rounded-lg px-2 py-2 text-xs font-semibold text-white/50 underline-offset-2 transition hover:text-white hover:underline"
                                >
                                  <Link2 className="h-3.5 w-3.5" /> Paste URL
                                </button>
                                <button
                                  onClick={() => handleDeleteEpisode(ep.id)}
                                  className="rounded-lg p-2 text-white/40 transition hover:bg-[#EF4444]/10 hover:text-[#EF4444]"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>

                              {pasteUrlFor === ep.id && (
                                <div className="mt-2.5 flex items-center gap-2 border-t border-white/5 pt-2.5">
                                  <input
                                    type="text"
                                    value={pasteUrlValue}
                                    onChange={(e) => setPasteUrlValue(e.target.value)}
                                    placeholder="https://.../episode.mp4 or .m3u8"
                                    className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-xs text-white outline-none"
                                  />
                                  <button
                                    onClick={() => handleSaveVideoUrl(ep.id)}
                                    disabled={savingUrlFor === ep.id || !pasteUrlValue.trim()}
                                    className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[#4CC950] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#2E9E38] disabled:opacity-50"
                                  >
                                    {savingUrlFor === ep.id ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <CheckCircle2 className="h-3.5 w-3.5" />
                                    )}
                                    Save
                                  </button>
                                  <button
                                    onClick={() => {
                                      setPasteUrlFor(null);
                                      setPasteUrlValue('');
                                    }}
                                    className="shrink-0 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white/70 transition hover:bg-white/5"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Add episode / video */}
                      {(show.type !== 'movie' || show.episodes.length === 0) && (
                        <div className="mt-4">
                          {addEpOpen === show.id ? (
                            <div className="space-y-3 rounded-xl border border-white/10 bg-[#1E1E2A] p-4">
                              {show.type !== 'movie' && (
                              <div className="grid grid-cols-3 gap-2">
                                <div>
                                  <label className="mb-1 block text-[11px] font-semibold text-white/60">
                                    Episode #
                                  </label>
                                  <input
                                    type="number"
                                    value={newEp.episode_number}
                                    onChange={(e) =>
                                      setNewEp({ ...newEp, episode_number: e.target.value })
                                    }
                                    placeholder="1"
                                    className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-sm text-white outline-none"
                                  />
                                </div>
                                <div>
                                  <label className="mb-1 block text-[11px] font-semibold text-white/60">
                                    Season
                                  </label>
                                  <input
                                    type="number"
                                    value={newEp.season}
                                    onChange={(e) =>
                                      setNewEp({ ...newEp, season: e.target.value })
                                    }
                                    className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-sm text-white outline-none"
                                  />
                                </div>
                                <div>
                                  <label className="mb-1 block text-[11px] font-semibold text-white/60">
                                    Duration (min)
                                  </label>
                                  <input
                                    type="number"
                                    value={newEp.duration}
                                    onChange={(e) =>
                                      setNewEp({ ...newEp, duration: e.target.value })
                                    }
                                    placeholder="24"
                                    className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-sm text-white outline-none"
                                  />
                                </div>
                              </div>
                              )}
                              {show.type === 'movie' && (
                                <div>
                                  <label className="mb-1 block text-[11px] font-semibold text-white/60">
                                    Duration (min)
                                  </label>
                                  <input
                                    type="number"
                                    value={newEp.duration}
                                    onChange={(e) =>
                                      setNewEp({ ...newEp, duration: e.target.value })
                                    }
                                    placeholder="120"
                                    className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-sm text-white outline-none"
                                  />
                                </div>
                              )}
                              {show.type !== 'movie' && (
                              <div>
                                <label className="mb-1 block text-[11px] font-semibold text-white/60">
                                  Title
                                </label>
                                <input
                                  value={newEp.title}
                                  onChange={(e) =>
                                    setNewEp({ ...newEp, title: e.target.value })
                                  }
                                  placeholder="Episode title"
                                  className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-sm text-white outline-none"
                                />
                              </div>
                              )}
                              {show.type !== 'movie' && (
                              <div>
                                <label className="mb-1 block text-[11px] font-semibold text-white/60">
                                  Description
                                </label>
                                <textarea
                                  value={newEp.description}
                                  onChange={(e) =>
                                    setNewEp({ ...newEp, description: e.target.value })
                                  }
                                  rows={2}
                                  className="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-sm text-white outline-none"
                                />
                              </div>
                              )}
                              <div className="flex gap-2">
                                <button
                                  onClick={() =>
                                    handleAddEpisode(
                                      show.id,
                                      show.type === 'movie' ? show.title : undefined,
                                    )
                                  }
                                  disabled={busy}
                                  className="flex items-center gap-1.5 rounded-lg bg-[#4CC950] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#2E9E38] disabled:opacity-50"
                                >
                                  {busy ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Plus className="h-3.5 w-3.5" />
                                  )}
                                  {show.type === 'movie' ? 'Add Movie Slot' : 'Add Episode'}
                                </button>
                                <button
                                  onClick={() => setAddEpOpen(null)}
                                  className="rounded-lg border border-white/10 px-4 py-2 text-xs font-semibold text-white/70 transition hover:bg-white/5"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => setAddEpOpen(show.id)}
                              className="flex items-center gap-1.5 rounded-lg border border-dashed border-white/20 px-4 py-2.5 text-xs font-semibold text-white/60 transition hover:border-[#4CC950]/40 hover:text-white"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              {show.type === 'movie' ? 'Add Movie Video Slot' : 'Add Episode'}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Add Show modal */}
      {addShowOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#14141C] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-white">New Show / Movie</h2>
              <button
                onClick={() => setAddShowOpen(false)}
                className="rounded-lg p-1.5 text-white/50 hover:bg-white/5"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-white/60">Type</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setNewShow({ ...newShow, type: 'series' })}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold ${
                      newShow.type === 'series'
                        ? 'border-[#4CC950]/50 bg-[#4CC950]/10 text-white'
                        : 'border-white/10 bg-white/5 text-white/60'
                    }`}
                  >
                    Series
                  </button>
                  <button
                    onClick={() => setNewShow({ ...newShow, type: 'movie' })}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold ${
                      newShow.type === 'movie'
                        ? 'border-[#4CC950]/50 bg-[#4CC950]/10 text-white'
                        : 'border-white/10 bg-white/5 text-white/60'
                    }`}
                  >
                    Movie
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold text-white/60">Title *</label>
                <input
                  value={newShow.title}
                  onChange={(e) => setNewShow({ ...newShow, title: e.target.value })}
                  placeholder="Show or movie title"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-sm text-white outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold text-white/60">Synopsis</label>
                <textarea
                  value={newShow.synopsis}
                  onChange={(e) => setNewShow({ ...newShow, synopsis: e.target.value })}
                  rows={3}
                  className="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-sm text-white outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-white/60">Release year</label>
                  <input
                    type="number"
                    value={newShow.release_year}
                    onChange={(e) => setNewShow({ ...newShow, release_year: e.target.value })}
                    placeholder="2026"
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-sm text-white outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-white/60">Studio</label>
                  <input
                    value={newShow.studio}
                    onChange={(e) => setNewShow({ ...newShow, studio: e.target.value })}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-sm text-white outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold text-white/60">
                  Poster (vertical card image)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setPosterFile(e.target.files?.[0] ?? null)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-xs text-white/70 file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-2.5 file:py-1 file:text-white"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold text-white/60">
                  Banner (wide hero image)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setBannerFile(e.target.files?.[0] ?? null)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-xs text-white/70 file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-2.5 file:py-1 file:text-white"
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-white/70">
                <input
                  type="checkbox"
                  checked={newShow.featured}
                  onChange={(e) => setNewShow({ ...newShow, featured: e.target.checked })}
                />
                Feature on home hero carousel
              </label>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleCreateShow}
                  disabled={creatingShow}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#4CC950] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#2E9E38] disabled:opacity-50"
                >
                  {creatingShow ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Create
                </button>
                <button
                  onClick={() => setAddShowOpen(false)}
                  className="rounded-lg border border-white/10 px-4 py-2.5 text-sm font-semibold text-white/70 transition hover:bg-white/5"
                >
                  Cancel
                </button>
              </div>
              <p className="text-[11px] text-white/40">
                After creating, expand the show below to upload its episode(s)/video file.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Edit Show modal */}
      {editShow && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#14141C] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-white">Edit Show</h2>
              <button
                onClick={() => setEditShow(null)}
                className="rounded-lg p-1.5 text-white/50 hover:bg-white/5"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-white/60">Title *</label>
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Show or movie title"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-sm text-white outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold text-white/60">Synopsis</label>
                <textarea
                  value={editSynopsis}
                  onChange={(e) => setEditSynopsis(e.target.value)}
                  rows={4}
                  placeholder="Short description shown on the show's detail page"
                  className="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-sm text-white outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-white/60">
                    Rating (0–10)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="10"
                    value={editRating}
                    onChange={(e) => setEditRating(e.target.value)}
                    placeholder="8.5"
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-sm text-white outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-white/60">
                    View count
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={editViewCount}
                    onChange={(e) => setEditViewCount(e.target.value)}
                    placeholder="0"
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-sm text-white outline-none"
                  />
                </div>
              </div>

              {/* Current images preview */}
              <div className="flex gap-3">
                {editShow.poster_url && (
                  <div className="flex-1">
                    <label className="mb-1 block text-[11px] font-semibold text-white/60">Current poster</label>
                    <img
                      src={editShow.poster_url}
                      alt="Poster"
                      className="h-24 w-16 rounded-lg object-cover ring-1 ring-white/10"
                    />
                  </div>
                )}
                {editShow.banner_url && (
                  <div className="flex-1">
                    <label className="mb-1 block text-[11px] font-semibold text-white/60">Current banner</label>
                    <img
                      src={editShow.banner_url}
                      alt="Banner"
                      className="h-24 w-40 rounded-lg object-cover ring-1 ring-white/10"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold text-white/60">
                  Replace poster (vertical card image)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setEditPosterFile(e.target.files?.[0] ?? null)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-xs text-white/70 file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-2.5 file:py-1 file:text-white"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold text-white/60">
                  Replace banner (wide hero image)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setEditBannerFile(e.target.files?.[0] ?? null)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-xs text-white/70 file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-2.5 file:py-1 file:text-white"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleSaveEdit}
                  disabled={savingEdit}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#4CC950] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#2E9E38] disabled:opacity-50"
                >
                  {editSuccess ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : savingEdit ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  {editSuccess ? 'Saved!' : 'Save Changes'}
                </button>
                <button
                  onClick={() => setEditShow(null)}
                  className="rounded-lg border border-white/10 px-4 py-2.5 text-sm font-semibold text-white/70 transition hover:bg-white/5"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Admin video preview modal */}
      {previewFor && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/85 p-4"
          onClick={closePreview}
        >
          <div
            className="relative w-full max-w-3xl overflow-hidden rounded-2xl bg-black"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={closePreview}
              className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex aspect-video items-center justify-center bg-black">
              {previewLoading && <Loader2 className="h-8 w-8 animate-spin text-white/60" />}
              {!previewLoading && previewError && (
                <p className="px-6 text-center text-sm text-[#EF4444]">{previewError}</p>
              )}
              {!previewLoading && previewUrl && (
                <video src={previewUrl} controls autoPlay className="h-full w-full" />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Hidden file input — single instance, target set via pendingUploadId */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,.mp4,.webm,.m3u8"
        className="hidden"
        onChange={handleFileSelected}
      />
    </div>
  );
}
