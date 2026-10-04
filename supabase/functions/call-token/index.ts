// Supabase Edge Function: call-token
// Gives a signed-in family member a short-lived pass to join a voice or video call.
// The caller's own login is used to read the call, so row-level security guarantees they
// are part of that conversation before any pass is issued.
//
// Secrets: LIVEKIT_URL (wss://...), LIVEKIT_API_KEY, LIVEKIT_API_SECRET

import { createClient } from 'npm:@supabase/supabase-js@2';
import { AccessToken } from 'npm:livekit-server-sdk@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const url = Deno.env.get('LIVEKIT_URL');
  const key = Deno.env.get('LIVEKIT_API_KEY');
  const secret = Deno.env.get('LIVEKIT_API_SECRET');
  if (!url || !key || !secret) return json({ error: 'Calling isn\'t set up yet.' }, 500);

  const auth = req.headers.get('Authorization') ?? '';
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return json({ error: 'Sign in again.' }, 401);

  let callId = '';
  try { callId = String((await req.json()).callId ?? ''); } catch { /* handled below */ }
  if (!callId) return json({ error: 'Missing call.' }, 400);

  // RLS: only participants of the call's conversation can see it.
  const { data: call } = await supabase.from('calls').select('id, kind, status').eq('id', callId).maybeSingle();
  if (!call) return json({ error: 'This call isn\'t available.' }, 404);
  if (call.status === 'ended' || call.status === 'declined' || call.status === 'missed') {
    return json({ error: 'This call has ended.' }, 410);
  }

  const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle();
  const at = new AccessToken(key, secret, { identity: user.id, name: profile?.display_name || 'Family member', ttl: '2h' });
  at.addGrant({ room: `call-${call.id}`, roomJoin: true, canPublish: true, canSubscribe: true });

  return json({ url, token: await at.toJwt(), kind: call.kind });
});
