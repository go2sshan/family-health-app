import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';

import { Avatar, Button, ErrorText, Muted, T } from '@/components/ui';
import { Space } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { listConversations, preview, timeLabel, watchAllMessages, type ConversationRow } from '@/lib/chat';
import { useFamily } from '@/lib/family';

export default function Chats() {
  const c = usePalette();
  const { me, nameOf } = useFamily();
  const [rows, setRows] = useState<ConversationRow[] | null>(null);
  const [err, setErr] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setRows(await listConversations()); setErr(''); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not load chats.'); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => watchAllMessages(() => { load(); }), [load]);

  return (
    <FlatList
      style={{ backgroundColor: c.bg }}
      contentInsetAdjustmentBehavior="automatic"
      data={rows ?? []}
      keyExtractor={(r) => r.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      ListHeaderComponent={<View style={{ padding: Space.lg, paddingBottom: 0 }}><ErrorText>{err}</ErrorText></View>}
      ListEmptyComponent={rows ? (
        <View style={{ padding: Space.lg, gap: Space.md }}>
          <Muted>No chats yet.</Muted>
          <Button kind="primary" title="Start a chat" onPress={() => router.push('/new-chat')} />
        </View>
      ) : null}
      ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: c.line, marginLeft: 76 }} />}
      renderItem={({ item: r }) => {
        const title = r.kind === 'family' ? r.family_name : r.other_name || 'Family member';
        const who = r.last_sender && r.last_kind !== 'call' ? (r.last_sender === me?.id ? 'You: ' : r.kind === 'family' ? `${nameOf(r.last_sender)}: ` : '') : '';
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${title}${r.unread ? `, ${r.unread} unread` : ''}`}
            onPress={() => router.push({ pathname: '/chat/[id]', params: { id: r.id } })}
            style={({ pressed }) => ({ flexDirection: 'row', gap: Space.md, alignItems: 'center', paddingHorizontal: Space.lg, paddingVertical: Space.md, backgroundColor: pressed ? c.accentSoft : c.bg })}>
            <Avatar path={null} initials={title.slice(0, 2).toUpperCase()} size={48} />
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: Space.sm }}>
                <T style={{ fontWeight: '700', flexShrink: 1 }} numberOfLines={1}>{title}</T>
                <Muted style={{ fontSize: 12, color: r.unread ? c.accent : c.muted }}>{timeLabel(r.last_at)}</Muted>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: Space.sm, alignItems: 'center' }}>
                <Muted numberOfLines={1} style={{ flex: 1 }}>{who}{preview(r)}</Muted>
                {r.unread ? (
                  <View style={{ minWidth: 22, height: 22, borderRadius: 11, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}>
                    <T style={{ color: c.onAccent, fontSize: 12, fontWeight: '700', lineHeight: 16 }}>{r.unread}</T>
                  </View>
                ) : null}
              </View>
            </View>
          </Pressable>
        );
      }}
    />
  );
}
