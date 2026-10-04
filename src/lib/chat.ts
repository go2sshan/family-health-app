import type { RealtimeChannel } from '@supabase/supabase-js';

import { uploadChatJpeg } from './api';
import { supabase } from './supabase';
import { KIND_LABEL, type HealthRecord } from './types';

export type ConversationRow = {
  id: string; kind: 'family' | 'direct'; family_name: string;
  other_user: string | null; other_name: string | null;
  last_body: string | null; last_kind: string | null; last_at: string; last_sender: string | null; unread: number;
};

export type RecordRef = { member_id: string; record_id: string; title: string; kind: string; date: string | null; person: string };

export type Message = {
  id: string; conversation_id: string; sender_id: string | null;
  kind: 'text' | 'image' | 'record' | 'call' | 'system';
  body: string | null; image_path: string | null; record_ref: RecordRef | null; call_id: string | null;
  created_at: string;
};

export type Participant = { user_id: string; last_read_at: string };

function ok<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export async function listConversations(): Promise<ConversationRow[]> {
  return ok(await supabase.rpc('my_conversations')) as ConversationRow[];
}

export async function loadConversation(id: string) {
  const [conv, parts, msgs] = await Promise.all([
    supabase.from('conversations').select('id, kind, family_id, families(name)').eq('id', id).single(),
    supabase.from('conversation_participants').select('user_id, last_read_at').eq('conversation_id', id),
    supabase.from('messages').select('*').eq('conversation_id', id).order('created_at', { ascending: false }).limit(200),
  ]);
  const c = ok(conv) as unknown as { id: string; kind: 'family' | 'direct'; family_id: string; families: { name: string } | null };
  return {
    kind: c.kind,
    familyName: c.families?.name ?? 'Family',
    participants: ok(parts) as Participant[],
    messages: ok(msgs) as Message[], // newest first
  };
}

export async function sendText(conversationId: string, body: string) {
  ok(await supabase.from('messages').insert({ conversation_id: conversationId, kind: 'text', body }));
}

export async function sendImage(conversationId: string, base64: string, caption?: string) {
  const path = await uploadChatJpeg(conversationId, base64);
  ok(await supabase.from('messages').insert({ conversation_id: conversationId, kind: 'image', image_path: path, body: caption || null }));
}

/** Share one record into a chat. The others see this summary; opening the full record still needs sharing access. */
export async function sendRecord(conversationId: string, r: HealthRecord, person: string) {
  const ref: RecordRef = { member_id: r.member_id, record_id: r.id, title: r.title, kind: r.kind, date: r.occurred_on, person };
  const summary = [`${KIND_LABEL[r.kind]} for ${person}: ${r.title}`, r.value != null ? `${r.value} ${r.unit ?? ''}`.trim() : null, r.notes].filter(Boolean).join('\n');
  ok(await supabase.from('messages').insert({ conversation_id: conversationId, kind: 'record', record_ref: ref, body: summary.slice(0, 1000) }));
}

export async function deleteMessage(id: string) {
  ok(await supabase.from('messages').delete().eq('id', id));
}

export async function markRead(conversationId: string, userId: string) {
  await supabase.from('conversation_participants').update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId).eq('user_id', userId);
}

/** Live updates for one conversation: new messages and read receipts. */
export function watchConversation(id: string, on: { message: (m: Message) => void; read: (p: Participant) => void }): () => void {
  const ch: RealtimeChannel = supabase.channel(`chat:${id}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` },
      (p) => on.message(p.new as Message))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversation_participants', filter: `conversation_id=eq.${id}` },
      (p) => on.read(p.new as Participant))
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}

/** Any new message in any of my conversations (for the chat list and unread badges). */
export function watchAllMessages(onAny: (m: Message) => void): () => void {
  const ch = supabase.channel(`inbox:${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (p) => onAny(p.new as Message))
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}

export function preview(row: Pick<ConversationRow, 'last_kind' | 'last_body'>): string {
  switch (row.last_kind) {
    case 'image': return row.last_body ? `Photo: ${row.last_body}` : 'Photo';
    case 'record': return 'Shared a health record';
    case 'call': return row.last_body ?? 'Call';
    case null: case undefined: return 'No messages yet';
    default: return row.last_body ?? '';
  }
}

export function timeLabel(iso: string): string {
  const d = new Date(iso), now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const yesterday = new Date(now.getTime() - 864e5).toDateString() === d.toDateString();
  if (yesterday) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
