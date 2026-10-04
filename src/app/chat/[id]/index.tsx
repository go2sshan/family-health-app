import { Image } from 'expo-image';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';

import { ErrorText, Muted, T } from '@/components/ui';
import { Space } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { signedUrl } from '@/lib/api';
import { callsAvailable, startCall } from '@/lib/calls';
import {
  deleteMessage, loadConversation, markRead, sendImage, sendText, timeLabel, watchConversation,
  type Message, type Participant,
} from '@/lib/chat';
import { useFamily } from '@/lib/family';
import { pickPhotos, takePhoto } from '@/lib/images';
import { supabase } from '@/lib/supabase';

function ChatImage({ path }: { path: string }) {
  const c = usePalette();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { let live = true; signedUrl(path).then((u) => live && setUrl(u)); return () => { live = false; }; }, [path]);
  return (
    <View style={{ width: 220, height: 220, borderRadius: 10, overflow: 'hidden', backgroundColor: c.line }}>
      {url ? <Image source={{ uri: url }} style={{ width: 220, height: 220 }} contentFit="cover" accessibilityLabel="Photo" /> : null}
    </View>
  );
}

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = usePalette();
  const { me, nameOf } = useFamily();
  const [kind, setKind] = useState<'family' | 'direct'>('direct');
  const [title, setTitle] = useState('');
  const [parts, setParts] = useState<Participant[]>([]);
  const [msgs, setMsgs] = useState<Message[] | null>(null); // newest first
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const myId = me?.id ?? '';

  const load = useCallback(async () => {
    try {
      const r = await loadConversation(id);
      setKind(r.kind);
      setParts(r.participants);
      setMsgs(r.messages);
      const other = r.participants.find((p) => p.user_id !== myId);
      setTitle(r.kind === 'family' ? r.familyName : nameOf(other?.user_id));
      if (myId) markRead(id, myId);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not open this chat.'); }
  }, [id, myId, nameOf]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => watchConversation(id, {
    message: (m) => {
      setMsgs((s) => (s && !s.some((x) => x.id === m.id) ? [m, ...s] : s));
      if (m.sender_id !== myId && myId) markRead(id, myId);
    },
    read: (p) => setParts((s) => s.map((x) => (x.user_id === p.user_id ? { ...x, last_read_at: p.last_read_at } : x))),
  }), [id, myId]);

  const others = useMemo(() => parts.filter((p) => p.user_id !== myId), [parts, myId]);
  const readBy = (m: Message) => others.filter((p) => p.last_read_at >= m.created_at).length;

  async function send() {
    const body = text.trim();
    if (!body) return;
    setSending(true); setErr('');
    try { await sendText(id, body); setText(''); await load(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Message not sent. Try again.'); }
    setSending(false);
  }

  async function sendPhoto(camera: boolean) {
    setErr('');
    try {
      const shots = camera ? [await takePhoto()].filter((x) => x !== null) : await pickPhotos(3);
      if (!shots.length) return;
      setSending(true);
      for (const s of shots) await sendImage(id, s!.base64);
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Photo not sent.'); }
    setSending(false);
  }

  function attach() {
    Alert.alert('Send', undefined, [
      { text: 'Take photo', onPress: () => sendPhoto(true) },
      { text: 'Choose photos', onPress: () => sendPhoto(false) },
      { text: 'Share a health record', onPress: () => router.push({ pathname: '/chat/[id]/share-record', params: { id } }) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function call(k: 'audio' | 'video') {
    if (!callsAvailable()) { Alert.alert('Calls need the installed app', 'Voice and video calls work in the TestFlight app, not in Expo Go.'); return; }
    try {
      const callId = await startCall(id, k);
      router.push({ pathname: '/call/[id]', params: { id: callId } });
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not start the call.'); }
  }

  async function openRecord(m: Message) {
    const ref = m.record_ref;
    if (!ref) return;
    const { data } = await supabase.rpc('member_role', { mid: ref.member_id });
    if (!data) {
      Alert.alert('Not shared with you', `${ref.person}'s records aren't shared with you. You can see what was sent here; ask ${ref.person} to share for full access.`);
      return;
    }
    router.push({ pathname: '/member/[id]', params: { id: ref.member_id } });
  }

  function confirmDelete(m: Message) {
    if (m.sender_id !== myId || m.kind === 'call') return;
    Alert.alert('Delete message?', 'It will be removed for everyone in this chat.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteMessage(m.id); setMsgs((s) => s?.filter((x) => x.id !== m.id) ?? s); } },
    ]);
  }

  const headerButtons = () => (
    <View style={{ flexDirection: 'row', gap: 18, marginRight: 8 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Voice call" hitSlop={10} onPress={() => call('audio')}>
        <SymbolView name="phone.fill" tintColor={c.accent} size={22} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Video call" hitSlop={10} onPress={() => call('video')}>
        <SymbolView name="video.fill" tintColor={c.accent} size={22} />
      </Pressable>
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ title, headerRight: headerButtons }} />
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        {msgs === null ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>{err ? <ErrorText>{err}</ErrorText> : <ActivityIndicator color={c.accent} />}</View>
        ) : (
          <FlatList
            inverted
            data={msgs}
            keyExtractor={(m) => m.id}
            contentContainerStyle={{ padding: Space.md, gap: 6 }}
            ListFooterComponent={<Muted style={{ textAlign: 'center', fontSize: 12, paddingBottom: Space.md }}>Messages are private to the people in this chat.</Muted>}
            renderItem={({ item: m, index }) => {
              const mine = m.sender_id === myId;
              const prevOlder = msgs[index + 1];
              const showName = kind === 'family' && !mine && prevOlder?.sender_id !== m.sender_id;
              const read = mine ? readBy(m) : 0;
              const status = !mine ? '' : kind === 'direct' ? (read ? ' · Read' : ' · Sent') : read ? ` · Read by ${read}` : ' · Sent';

              if (m.kind === 'call') {
                return (
                  <Pressable onPress={() => router.push({ pathname: '/call/[id]', params: { id: m.call_id! } })} style={{ alignSelf: 'center', flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: c.surface, borderColor: c.line, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}>
                    <SymbolView name={m.body?.startsWith('Video') ? 'video.fill' : 'phone.fill'} tintColor={c.accent} size={14} />
                    <Muted style={{ fontSize: 13 }}>{mine ? 'You' : nameOf(m.sender_id)} started a {m.body?.toLowerCase()} · {timeLabel(m.created_at)}</Muted>
                  </Pressable>
                );
              }

              return (
                <Pressable
                  onLongPress={() => confirmDelete(m)}
                  onPress={() => (m.kind === 'record' ? openRecord(m) : undefined)}
                  style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '82%' }}>
                  <View style={{
                    backgroundColor: mine ? c.accentSoft : c.surface,
                    borderColor: mine ? 'transparent' : c.line, borderWidth: 1,
                    borderRadius: 14, borderBottomRightRadius: mine ? 4 : 14, borderBottomLeftRadius: mine ? 14 : 4,
                    padding: 10, gap: 4,
                  }}>
                    {showName ? <T style={{ color: c.accent, fontWeight: '700', fontSize: 13 }}>{nameOf(m.sender_id)}</T> : null}
                    {m.kind === 'image' && m.image_path ? <ChatImage path={m.image_path} /> : null}
                    {m.kind === 'record' ? (
                      <View style={{ borderLeftWidth: 3, borderLeftColor: c.accent, paddingLeft: 8, gap: 2 }}>
                        <Muted style={{ fontSize: 12, fontWeight: '700' }}>HEALTH RECORD · TAP TO OPEN</Muted>
                        <T>{m.body}</T>
                      </View>
                    ) : m.body ? <T selectable>{m.body}</T> : null}
                    <Muted style={{ fontSize: 11, alignSelf: 'flex-end' }}>{timeLabel(m.created_at)}{status}</Muted>
                  </View>
                </Pressable>
              );
            }}
          />
        )}
        {err && msgs ? <View style={{ paddingHorizontal: Space.md }}><ErrorText>{err}</ErrorText></View> : null}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: Space.sm, padding: Space.sm, paddingBottom: Space.lg, borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.surface }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Attach a photo or record" onPress={attach} hitSlop={8} style={{ padding: 8 }}>
            <SymbolView name="plus.circle.fill" tintColor={c.accent} size={28} />
          </Pressable>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Message"
            placeholderTextColor={c.muted}
            multiline
            accessibilityLabel="Message"
            style={{ flex: 1, maxHeight: 120, minHeight: 40, borderWidth: 1, borderColor: c.line, borderRadius: 20, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, color: c.text, backgroundColor: c.bg, fontSize: 16 }}
          />
          <Pressable accessibilityRole="button" accessibilityLabel="Send" disabled={!text.trim() || sending} onPress={send} hitSlop={8} style={{ padding: 6, opacity: text.trim() && !sending ? 1 : 0.4 }}>
            {sending ? <ActivityIndicator color={c.accent} /> : <SymbolView name="arrow.up.circle.fill" tintColor={c.accent} size={32} />}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}
