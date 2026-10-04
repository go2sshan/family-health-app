import { router } from 'expo-router';
import { useEffect, useRef } from 'react';

import { watchIncomingCalls } from '@/lib/calls';
import { useFamily } from '@/lib/family';
import { listenForTaps, registerForPush } from '@/lib/notifications';

/** App-wide listeners once someone is signed in: push registration, notification taps, incoming calls. */
export function AppEffects() {
  const { me } = useFamily();
  const shown = useRef(new Set<string>());

  useEffect(() => {
    if (!me) return;
    registerForPush(me.id);
    const stopTaps = listenForTaps();
    const stopRing = watchIncomingCalls(me.id, (call) => {
      // ignore stale rings delivered late
      if (Date.now() - new Date(call.started_at).getTime() > 60_000 || shown.current.has(call.id)) return;
      shown.current.add(call.id);
      router.push({ pathname: '/call/[id]', params: { id: call.id } });
    });
    return () => { stopTaps(); stopRing(); };
  }, [me]);

  return null;
}
