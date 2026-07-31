import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/supabaseClient';
import {
  fetchProfile,
  isSubscribed,
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
    setScreen({ name: 'home' });
    setActiveTab('home');
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setScreen({ name: 'home' });
    setActiveTab('home');
  };

  // Reuse the existing requireAuth pattern: proceed if signed in,
  // otherwise route to signup. Lets logged-out users browse Home freely
  // and only prompts for auth on account-gated actions.
  const requireAuth = (next: Screen) => {
    if (session) setScreen(next);
    else setScreen({ name: 'auth', mode: 'signup' });
  };

  const handlePlayEpisode = (episode: Episode, show: ShowWithGenres) => {
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

  if (screen.name === 'auth') {
    return (
      <AuthScreen
        mode={screen.mode}
        onBack={() => setScreen({ name: 'home' })}
        onSuccess={handleAuthSuccess}
        onSwitch={(mode) => setScreen({ name: 'auth', mode })}
      />
    );
  }

  if (screen.name === 'profile') {
    return (
      <ProfileScreen
        userId={session!.user.id}
        onBack={() => setScreen({ name: 'home' })}
        onSignOut={handleSignOut}
        onOpenAdmin={() => setScreen({ name: 'admin' })}
      />
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

  // home — default landing screen for everyone (signed-in or browsing)
  return (
    <>
      <HomeScreen
        onSelectShow={(show) => setScreen({ name: 'detail', show })}
        onOpenProfile={() => requireAuth({ name: 'profile' })}
        onOpenSubscription={() => setShowSubModal(true)}
        onOpenWatchlist={() => requireAuth({ name: 'watchlist' })}
        avatarUrl={profile?.avatar_url ?? null}
        subscribed={isSubscribed(profile)}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        searchOpen={searchOpen}
        setSearchOpen={setSearchOpen}
      />
      {showSubModal && (
        <SubscriptionModal onClose={() => setShowSubModal(false)} />
      )}
    </>
  );
}

export default App;
