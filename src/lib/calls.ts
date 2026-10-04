import { supabase } from './supabase';

export type Call = {
  id: string; conversation_id: string; started_by: string | null; kind: 'audio' | 'video';
  status: 'ringing' | 'active' | 'ended' | 'missed' | 'declined';
  started_at: string; answered_at: string | null; ended_at: string | null;
};

/** Calls need the installed app (TestFlight or a development build); Expo Go doesn't include WebRTC. */
export function callsAvailable(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@livekit/react-native');
    return true;
  } catch {
    return false;
  }
}

export async function startCall(conversationId: string, kind: 'audio' | 'video'): Promise<string> {
  const { data, error } = await supabase.rpc('start_call', { cid: conversationId, call_kind: kind });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function getCall(id: string): Promise<Call | null> {
  const { data } = await supabase.from('calls').select('*').eq('id', id).maybeSingle();
  return (data as Call) ?? null;
}

export async function setCallStatus(id: string, status: Call['status']) {
  const patch: Partial<Call> = { status };
  if (status === 'active') patch.answered_at = new Date().toISOString();
  if (status === 'ended' || status === 'declined' || status === 'missed') patch.ended_at = new Date().toISOString();
  await supabase.from('calls').update(patch).eq('id', id);
}

/** A short-lived pass to join the call's room, issued by the call-token function. */
export async function getCallPass(callId: string): Promise<{ url: string; token: string }> {
  const { data, error } = await supabase.functions.invoke('call-token', { body: { callId } });
  if (error) {
    let msg = 'Could not connect the call. Check your connection and try again.';
    try { const b = await (error as { context?: Response }).context?.json(); if (b?.error) msg = b.error; } catch { /* keep default */ }
    throw new Error(msg);
  }
  return data as { url: string; token: string };
}

export function watchCall(id: string, onChange: (c: Call) => void): () => void {
  const ch = supabase.channel(`call:${id}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'calls', filter: `id=eq.${id}` }, (p) => onChange(p.new as Call))
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}

/** Incoming calls in any of my conversations. */
export function watchIncomingCalls(myId: string, onRing: (c: Call) => void): () => void {
  const ch = supabase.channel(`ring:${myId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'calls' }, (p) => {
      const c = p.new as Call;
      if (c.started_by !== myId && c.status === 'ringing') onRing(c);
    })
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}
