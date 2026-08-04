import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/supabaseClient';
import {
  fetchProfile,
  isSubscribed,
  subscribeToSessionKick,
  subscribeToProfileChanges,
  checkSessionStillValid,
  type Profile,
} from '@/lib/auth';
import { fetchShowById, fetchEpisodesByShow } from '@/lib/api';
import type { Show, ShowWithGenres, Episode } from '@/lib/types';
import { addToContinueWatching } from '@/lib/watchlist';
import AuthScreen from '@/components/AuthScreen';
import HomeScreen, { type Tab } from '@/components/HomeScreen';
import ShowDetailScreen from '@/components/ShowDetailScreen';
import VideoPlayerScreen from '@/components/VideoPlayerScreen';
import ProfileScreen from '@/components/ProfileScreen';
import WatchlistScreen from '@/components/WatchlistScreen';
import SubscriptionModal from '@/components/SubscriptionModal';
import AdminScreen from '@/components/AdminScreen';
import DesktopBlockedScreen from '@/components/DesktopBlockedScreen';
import NewMemberPromoBanner from '@/components/NewMemberPromoBanner';
import LuckyDrawModal from '@/components/LuckyDrawModal';
import { useIsMobile } from '@/lib/useIsMobile';

type Screen =
  | { name: 'auth'; mode: 'signin' | 'signup' }
  | { name: 'home' }
  | { name: 'detail'; show: Show }
  | { name: 'player'; episode: Episode; show: ShowWithGenres }
  | { name: 'profile' }
  | { name: 'watchlist' }
  | { name: 'admin' };

function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [showSubModal, setShowSubModal] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [searchOpen, setSearchOpen] = useState(false);
  const [sessionKicked, setSessionKicked] = useState(false);
  const [promoDismissed, setPromoDismissed] = useState(false);
  const [showLuckyDraw, setShowLuckyDraw] = useState(false);
  const isMobile = useIsMobile();
  const isAdmin = !!profile?.is_admin;

  const refreshProfile = async (userId: string) => {
    const p = await fetchProfile(userId);
    setProfile(p);
    return p;
  };

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setSession(data.session);
      if (data.session?.user) {
        await refreshProfile(data.session.user.id);
      }
      setAuthReady(true);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      (async () => {
        setSession(sess);
        if (sess?.user) {
          await refreshProfile(sess.user.id);
        } else {
          setProfile(null);
        }
      })();
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const handleAuthSuccess = () => {
    setSessionKicked(false);
    setPromoDismissed(false);
    setScreen({ name: 'home' });
    setActiveTab('home');
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setPromoDismissed(false);
    setScreen({ name: 'home' });
    setActiveTab('home');
  };

  // Single-device sign-in guard: if another device signs in to this same
  // account, the server's active_session_id changes and this device gets
  // signed out automatically (realtime push, plus a fallback check whenever
  // the tab regains focus in case the push was missed while backgrounded).
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;

    const kickOut = async () => {
      setSessionKicked(true);
      await supabase.auth.signOut();
      setSession(null);
      setProfile(null);
      setScreen({ name: 'auth', mode: 'signin' });
    };

    const unsubscribe = subscribeToSessionKick(userId, kickOut);

    const handleVisibility = async () => {
      if (document.visibilityState !== 'visible') return;
      const ok = await checkSessionStillValid(userId);
      if (!ok) kickOut();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [session?.user?.id]);

  // Keep `profile` in sync live: when an admin confirms a payment or the
  // auto QR-confirm edge function unlocks the account, subscription_expires_at
  // changes server-side with no client action in between. Without this the
  // new-member spin prompt (and VIP badge) wouldn't appear until next login.
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;
    const unsubscribe = subscribeToProfileChanges(userId, (updated) => {
      setProfile(updated);
    });
    return unsubscribe;
  }, [session?.user?.id]);

  // Reuse the existing requireAuth pattern: proceed if signed in,
  // otherwise route to signup. Lets logged-out users browse Home freely
  // and only prompts for auth on account-gated actions.
  const requireAuth = (next: Screen) => {
    if (session) setScreen(next);
    else setScreen({ name: 'auth', mode: 'signup' });
  };

  const handlePlayEpisode = (episode: Episode, show: ShowWithGenres) => {
    if (!session) {
      setScreen({ name: 'auth', mode: 'signup' });
      return;
    }
    const canOpen = isSubscribed(profile) || profile?.is_admin || episode.is_free_preview;
    if (canOpen) {
      addToContinueWatching(show, episode, episode.episode_number - 1);
      setScreen({ name: 'player', episode, show });
    } else {
      setShowSubModal(true);
    }
  };

  // Resume a continue-watching item: fetch fresh show detail + episodes,
  // then jump to the remembered episode.
  const handleResumeEpisode = async (show: Show, episodeId: string) => {
    const [detail, eps] = await Promise.all([
      fetchShowById(show.id),
      fetchEpisodesByShow(show.id),
    ]);
    const ep = eps.find((e) => e.id === episodeId);
    if (detail && ep) {
      handlePlayEpisode(ep, detail);
    } else if (detail) {
      setScreen({ name: 'detail', show });
    } else {
      setScreen({ name: 'detail', show });
    }
  };

  useEffect(() => {
    if (screen.name === 'admin' && !profile?.is_admin) {
      setScreen({ name: 'home' });
    }
  }, [screen, profile]);

  // Keep activeTab roughly in sync with the screen so the bottom nav
  // highlights the right icon when we navigate away from home and back.
  useEffect(() => {
    if (screen.name === 'home') setActiveTab('home');
    else if (screen.name === 'watchlist') setActiveTab('watchlist');
    else if (screen.name === 'profile') setActiveTab('account');
  }, [screen.name]);

  if (!authReady) {
    // Avoid flashing the desktop gate (or the app) before we know whether
    // this visitor is a signed-in admin.
    return <div className="min-h-screen bg-[#0A0A0F]" />;
  }

  // Desktop is admin-only. Everyone else — signed out or a regular signed-in
  // user — gets a "please use mobile" gate. The gate itself still lets an
  // admin sign in from desktop via its own button, which opens AuthScreen
  // through here; once that login resolves, isAdmin flips and this check
  // falls through to the normal app below.
  if (!isMobile && !isAdmin) {
    return (
      <DesktopBlockedScreen
        authOpen={screen.name === 'auth'}
        onOpenAdminSignIn={() => setScreen({ name: 'auth', mode: 'signin' })}
      >
        <AuthScreen
          mode={screen.name === 'auth' ? screen.mode : 'signin'}
          onBack={() => setScreen({ name: 'home' })}
          onSuccess={handleAuthSuccess}
          onSwitch={(mode) => setScreen({ name: 'auth', mode })}
          kickedOut={sessionKicked}
        />
      </DesktopBlockedScreen>
    );
  }

  if (screen.name === 'auth') {
    return (
      <AuthScreen
        mode={screen.mode}
        onBack={() => {
          setSessionKicked(false);
          setScreen({ name: 'home' });
        }}
        onSuccess={handleAuthSuccess}
        onSwitch={(mode) => setScreen({ name: 'auth', mode })}
        kickedOut={sessionKicked}
      />
    );
  }

  if (screen.name === 'profile') {
    return (
      <>
        <ProfileScreen
          userId={session!.user.id}
          onBack={() => setScreen({ name: 'home' })}
          onSignOut={handleSignOut}
          onOpenAdmin={() => setScreen({ name: 'admin' })}
          onOpenSubscription={() => setShowSubModal(true)}
        />
        {showSubModal && (
          <SubscriptionModal onClose={() => setShowSubModal(false)} />
        )}
      </>
    );
  }

  if (screen.name === 'watchlist') {
    return (
      <WatchlistScreen
        onSelectShow={(show) => requireAuth({ name: 'detail', show })}
        onBack={() => setScreen({ name: 'home' })}
        onResumeEpisode={handleResumeEpisode}
      />
    );
  }

  if (screen.name === 'admin') {
    if (!profile?.is_admin) return null;
    return <AdminScreen onBack={() => setScreen({ name: 'home' })} />;
  }

  if (screen.name === 'detail') {
    return (
      <>
        <ShowDetailScreen
          show={screen.show}
          onBack={() => setScreen({ name: 'home' })}
          onPlayEpisode={handlePlayEpisode}
          subscribed={isSubscribed(profile) || !!profile?.is_admin}
        />
        {showSubModal && (
          <SubscriptionModal onClose={() => setShowSubModal(false)} />
        )}
      </>
    );
  }

  if (screen.name === 'player') {
    return (
      <VideoPlayerScreen
        episode={screen.episode}
        show={screen.show}
        onBack={() => setScreen({ name: 'detail', show: screen.show })}
      />
    );
  }

  // New-member lucky-draw promo: guests get a "sign up to win VIP" popup;
  // signed-in users who just became VIP and haven't spun yet get a
  // "claim your spin" popup instead. Neither shows once dismissed for this
  // visit, and the spin prompt disappears the moment lucky_draw_used flips.
  const promoVariant: 'guest' | 'spin-ready' | null = promoDismissed
    ? null
    : !session
      ? 'guest'
      : isSubscribed(profile) && profile && !profile.lucky_draw_used
        ? 'spin-ready'
        : null;

  // Same eligibility as promoVariant, but NOT gated by promoDismissed — this
  // powers the small gift badge on the home screen header (next to
  // Subscribe) so the free-spin offer stays reachable even after the
  // popup itself has been closed for this visit.
  const rewardsVariant: 'guest' | 'spin-ready' | null = !session
    ? 'guest'
    : isSubscribed(profile) && profile && !profile.lucky_draw_used
      ? 'spin-ready'
      : null;

  // home — default landing screen for everyone (signed-in or browsing)
  return (
    <>
      <HomeScreen
        onSelectShow={(show) => setScreen({ name: 'detail', show })}
        onOpenProfile={() => requireAuth({ name: 'profile' })}
        onOpenSubscription={() => setShowSubModal(true)}
        onOpenWatchlist={() => requireAuth({ name: 'watchlist' })}
        onOpenRewards={() => {
          if (!session) {
            setScreen({ name: 'auth', mode: 'signup' });
          } else {
            setShowLuckyDraw(true);
          }
        }}
        avatarUrl={profile?.avatar_url ?? null}
        subscribed={isSubscribed(profile)}
        rewardsAvailable={rewardsVariant}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        searchOpen={searchOpen}
        setSearchOpen={setSearchOpen}
      />
      {showSubModal && (
        <SubscriptionModal onClose={() => setShowSubModal(false)} />
      )}
      {promoVariant && (
        <NewMemberPromoBanner
          variant={promoVariant}
          onDismiss={() => setPromoDismissed(true)}
          onPrimary={() => {
            setPromoDismissed(true);
            if (promoVariant === 'guest') {
              setScreen({ name: 'auth', mode: 'signup' });
            } else {
              setShowLuckyDraw(true);
            }
          }}
        />
      )}
      {showLuckyDraw && (
        <LuckyDrawModal
          onClose={() => setShowLuckyDraw(false)}
          onClaimed={() => {
            if (session?.user?.id) refreshProfile(session.user.id);
          }}
        />
      )}
    </>
  );
}

export default App;
