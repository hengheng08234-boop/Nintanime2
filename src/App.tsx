import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/supabaseClient';
import {
  fetchProfile,
  isSubscribed,
  type Profile,
} from '@/lib/auth';
import InstallScreen from '@/components/InstallScreen';
import AuthScreen from '@/components/AuthScreen';
import HomeScreen from '@/components/HomeScreen';
import ShowDetailScreen from '@/components/ShowDetailScreen';
import VideoPlayerScreen from '@/components/VideoPlayerScreen';
import ProfileScreen from '@/components/ProfileScreen';
import SubscriptionModal from '@/components/SubscriptionModal';
import AdminScreen from '@/components/AdminScreen';
import type { Show, ShowWithGenres, Episode } from '@/lib/types';

type Screen =
  | { name: 'install' }
  | { name: 'auth'; mode: 'signin' | 'signup' }
  | { name: 'home' }
  | { name: 'detail'; show: Show }
  | { name: 'player'; episode: Episode; show: ShowWithGenres }
  | { name: 'profile' }
  | { name: 'admin' };

function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'install' });
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [showSubModal, setShowSubModal] = useState(false);

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

  const handleInstall = () => {
    if (authReady && session) setScreen({ name: 'home' });
  };

  const handleAuthSuccess = () => {
    setScreen({ name: 'home' });
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setScreen({ name: 'auth', mode: 'signin' });
  };

  const requireAuth = (next: Screen) => {
    if (session) setScreen(next);
    else setScreen({ name: 'auth', mode: 'signup' });
  };

  const handlePlayEpisode = (episode: Episode, show: ShowWithGenres) => {
    if (isSubscribed(profile)) {
      setScreen({ name: 'player', episode, show });
    } else {
      setShowSubModal(true);
    }
  };

  useEffect(() => {
    if (screen.name === 'admin' && !profile?.is_admin) {
      setScreen({ name: 'home' });
    }
  }, [screen, profile]);

  if (screen.name === 'install') {
    return (
      <InstallScreen
        hasSession={authReady && !!session}
        onEnter={handleInstall}
        onSignIn={() => setScreen({ name: 'auth', mode: 'signin' })}
        onSignUp={() => setScreen({ name: 'auth', mode: 'signup' })}
      />
    );
  }

  if (screen.name === 'auth') {
    return (
      <AuthScreen
        mode={screen.mode}
        onBack={() => setScreen({ name: 'install' })}
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

  if (screen.name === 'admin') {
    if (!profile?.is_admin) {
      return null;
    }
    return <AdminScreen onBack={() => setScreen({ name: 'home' })} />;
  }

  if (screen.name === 'home') {
    return (
      <>
        <HomeScreen
          onSelectShow={(show) => requireAuth({ name: 'detail', show })}
          onOpenProfile={() => requireAuth({ name: 'profile' })}
          onOpenSubscription={() => setShowSubModal(true)}
          avatarUrl={profile?.avatar_url ?? null}
          subscribed={isSubscribed(profile)}
        />
        {showSubModal && (
          <SubscriptionModal onClose={() => setShowSubModal(false)} />
        )}
      </>
    );
  }

  if (screen.name === 'detail') {
    return (
      <ShowDetailScreen
        show={screen.show}
        onBack={() => setScreen({ name: 'home' })}
        onPlayEpisode={handlePlayEpisode}
      />
    );
  }

  return (
    <VideoPlayerScreen
      episode={screen.episode}
      show={screen.show}
      onBack={() => setScreen({ name: 'detail', show: screen.show })}
    />
  );
}

export default App;
