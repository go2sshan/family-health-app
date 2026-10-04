import type { Session } from '@supabase/supabase-js';
import * as LocalAuthentication from 'expo-local-authentication';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { supabase } from './supabase';

type Ctx = {
  session: Session | null;
  loading: boolean;
  locked: boolean;
  unlock: () => Promise<void>;
};

const SessionContext = createContext<Ctx>({ session: null, loading: true, locked: false, unlock: async () => {} });

/** Lock again after the app has been in the background this long. */
const RELOCK_AFTER_MS = 60_000;

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(true);
  const backgroundAt = useRef<number | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const unlock = useCallback(async () => {
    const hasHw = await LocalAuthentication.hasHardwareAsync();
    const enrolled = hasHw && (await LocalAuthentication.isEnrolledAsync());
    if (!enrolled) { setLocked(false); return; } // no Face ID / passcode set up: nothing to check against
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock your family health records',
      fallbackLabel: 'Use passcode',
    });
    if (res.success) setLocked(false);
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') backgroundAt.current = Date.now();
      if (state === 'active' && backgroundAt.current && Date.now() - backgroundAt.current > RELOCK_AFTER_MS) {
        setLocked(true);
      }
      if (state === 'active') backgroundAt.current = null;
    });
    return () => sub.remove();
  }, []);

  return <SessionContext.Provider value={{ session, loading, locked, unlock }}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);
