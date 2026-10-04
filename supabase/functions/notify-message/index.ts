// Supabase Edge Function: notify-message
// Called by the database (trigger on new messages) to send push notifications to the other
// people in the conversation. Notification text never includes message content or health
// details, because it shows on the lock screen.
//
// Secrets: NOTIFY_SECRET (the same value stored in public.app_config 'notify_secret')

import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.headers.get('x-notify-secret') !== Deno.env.get('NOTIFY_SECRET')) {
    return new Response('forbidden', { status: 403 });
  }
  const { message_id } = await req.json().catch(() => ({}));
  if (!message_id) return new Response('missing message', { status: 400 });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: msg } = await db.from('messages')
    .select('id, conversation_id, sender_id, kind, call_id, conversations(kind, families(name))')
    .eq('id', message_id).maybeSingle();
  if (!msg || msg.kind === 'system') return new Response('skip');

  const [{ data: sender }, { data: people }] = await Promise.all([
    db.from('profiles').select('display_name').eq('id', msg.sender_id).maybeSingle(),
    db.from('conversation_participants').select('user_id').eq('conversation_id', msg.conversation_id).neq('user_id', msg.sender_id),
  ]);
  const ids = (people ?? []).map((p) => p.user_id);
  if (!ids.length) return new Response('nobody to notify');

  const { data: tokens } = await db.from('push_tokens').select('token, user_id').in('user_id', ids);
  if (!tokens?.length) return new Response('no devices');

  // deno-lint-ignore no-explicit-any
  const conv = msg.conversations as any;
  const name = sender?.display_name || 'Someone';
  const where = conv?.kind === 'family' ? ` in ${conv?.families?.name ?? 'the family chat'}` : '';
  let callKind = '';
  if (msg.kind === 'call' && msg.call_id) {
    const { data: call } = await db.from('calls').select('kind').eq('id', msg.call_id).maybeSingle();
    callKind = call?.kind === 'video' ? 'video' : 'voice';
  }
  const body = msg.kind === 'call' ? `${name} is calling${where} (${callKind} call)` : `New message from ${name}${where}`;

  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(tokens.map((t) => ({
      to: t.token,
      title: 'Family Health',
      body,
      sound: 'default',
      priority: 'high',
      interruptionLevel: msg.kind === 'call' ? 'time-sensitive' : 'active',
      data: { conversationId: msg.conversation_id, callId: msg.call_id ?? null },
    }))),
  });

  // Forget phones that no longer accept notifications.
  const out = await res.json().catch(() => null);
  const tickets: { status: string; details?: { error?: string } }[] = out?.data ?? [];
  const dead = tickets.map((t, i) => (t.status === 'error' && t.details?.error === 'DeviceNotRegistered' ? tokens[i].token : null)).filter(Boolean);
  if (dead.length) await db.from('push_tokens').delete().in('token', dead as string[]);

  return new Response(`sent ${tokens.length}`);
});
