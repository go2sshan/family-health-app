import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { usePalette } from '@/hooks/use-palette';
import { callsAvailable, getCall, getCallPass, setCallStatus, watchCall, type Call } from '@/lib/calls';
import { supabase } from '@/lib/supabase';
import { useFamily } from '@/lib/family';
import type { Palette } from '@/constants/theme';

type RoomProps = { url: string; token: string; video: boolean; c: Palette; onLeave: (othersStillOn?: number) => void; title: string };

function loadRoom(): ComponentType<RoomProps> | null {
  if (!callsAvailable()) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@/components/call-room').default as ComponentType<RoomProps>;
}

const RING_TIMEOUT_MS = 45_000;

export default function CallScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = usePalette();
  const { me, nameOf } = useFamily();
  const [call, setCall] = useState<Call | null>(null);
  const [title, setTitle] = useState('');
  const [group, setGroup] = useState(false);
  const [pass, setPass] = useState<{ url: string; token: string } | null>(null);
  const [err, setErr] = useState('');
  const [Room] = useState(loadRoom);
  const joined = useRef(false);
  const close = useCallback(() => { if (router.canGoBack()) router.back(); else router.replace('/'); }, []);

  const iStarted = call?.started_by === me?.id;

  // load the call and who it's with
  useEffect(() => {
    (async () => {
      const cl = await getCall(id);
      if (!cl) { setErr('This call isn\'t available.'); return; }
      setCall(cl);
      const { data: conv } = await supabase.from('conversations').select('kind, families(name), conversation_participants(user_id)').eq('id', cl.conversation_id).single();
      const cv = conv as unknown as { kind: string; families: { name: string } | null; conversation_participants: { user_id: string }[] } | null;
      setGroup(cv?.kind === 'family');
      if (cv?.kind === 'family') setTitle(cv.families?.name ?? 'Family call');
      else setTitle(nameOf(cv?.conversation_participants.find((p) => p.user_id !== me?.id)?.user_id ?? cl.started_by));
    })();
  }, [id, me?.id, nameOf]);

  // a one-to-one call ends for both people when either hangs up or declines
  useEffect(() => watchCall(id, (cl) => {
    setCall(cl);
    if (cl.status === 'ended' || cl.status === 'declined' || cl.status === 'missed') { joined.current = false; close(); }
  }), [id, close]);

  const join = useCallback(async () => {
    try {
      if (!iStarted && call?.status === 'ringing') await setCallStatus(id, 'active');
      setPass(await getCallPass(id));
      joined.current = true;
      setErr('');
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not join the call.'); }
  }, [id, iStarted, call]);

  // the caller joins the room right away and waits there
  const callerShouldJoin = !!call && iStarted && !pass && call.status === 'ringing' && !!Room;
  useEffect(() => {
    if (!callerShouldJoin) return;
    let live = true;
    getCallPass(id)
      .then((p) => { if (live) { joined.current = true; setPass(p); } })
      .catch((e) => { if (live) setErr(e instanceof Error ? e.message : 'Could not start the call.'); });
    return () => { live = false; };
  }, [callerShouldJoin, id]);

  // nobody answered
  useEffect(() => {
    if (!call || !iStarted || call.status !== 'ringing') return;
    const left = RING_TIMEOUT_MS - (Date.now() - new Date(call.started_at).getTime());
    const t = setTimeout(async () => { await setCallStatus(id, 'missed'); joined.current = false; close(); }, Math.max(0, left));
    return () => clearTimeout(t);
  }, [call, iStarted, id, close]);

  const leave = useCallback(async (othersStillOn?: number) => {
    joined.current = false;
    if (call?.status === 'ringing' && iStarted) await setCallStatus(id, 'missed'); // cancelled before anyone answered
    else if (call?.status === 'active' && !group) await setCallStatus(id, 'ended'); // one-to-one: ends for both
    else if (call?.status === 'active' && group && othersStillOn === 0) await setCallStatus(id, 'ended'); // last one out
    // family group call: others can stay on after you leave
    close();
  }, [call, id, iStarted, group, close]);

  const decline = async () => { await setCallStatus(id, 'declined'); close(); };

  if (pass && Room && call) {
    return <Room url={pass.url} token={pass.token} video={call.kind === 'video'} c={c} onLeave={leave} title={title} />;
  }

  const over = call && (call.status === 'ended' || call.status === 'missed' || call.status === 'declined');
  return (
    <View style={{ flex: 1, backgroundColor: '#0b1214', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 }}>
      <Text style={{ color: '#b8c7ca', fontSize: 16 }}>{call?.kind === 'video' ? 'Video call' : 'Voice call'}</Text>
      <Text style={{ color: '#ffffff', fontSize: 30, fontWeight: '700', textAlign: 'center' }}>{title || ' '}</Text>
      {!call && !err ? <ActivityIndicator color="#ffffff" /> : null}
      {err ? <Text style={{ color: '#f2847b', textAlign: 'center' }}>{err}</Text> : null}
      {!Room ? <Text style={{ color: '#b8c7ca', textAlign: 'center' }}>Calls work in the installed app (TestFlight), not in Expo Go.</Text> : null}
      {over ? <Text style={{ color: '#b8c7ca' }}>This call has ended.</Text> : null}
      {call && !iStarted && call.status === 'ringing' && Room ? <Text style={{ color: '#b8c7ca' }}>{nameOf(call.started_by)} is calling…</Text> : null}
      <View style={{ flexDirection: 'row', gap: 48, marginTop: 40 }}>
        {call && !over && !iStarted && Room ? (
          <>
            {call.status === 'ringing' ? <Round icon="phone.down.fill" label="Decline" color={c.bad} onPress={decline} /> : null}
            <Round icon={call.kind === 'video' ? 'video.fill' : 'phone.fill'} label={call.status === 'ringing' ? 'Accept' : 'Join'} color={c.good} onPress={join} />
          </>
        ) : (
          <Round icon="xmark" label="Close" color="#41545a" onPress={() => leave()} />
        )}
      </View>
    </View>
  );
}

function Round({ icon, label, color, onPress }: { icon: string; label: string; color: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ alignItems: 'center', gap: 8 }}>
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
        <SymbolView name={icon as never} tintColor="#ffffff" size={30} />
      </View>
      <Text style={{ color: '#ffffff', fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}
