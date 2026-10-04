import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable } from 'react-native';

import { Avatar, ErrorText, Muted, Screen, T } from '@/components/ui';
import { Space } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { openDirectChat, useFamily } from '@/lib/family';

export default function NewChat() {
  const c = usePalette();
  const { people, me } = useFamily();
  const [err, setErr] = useState('');
  const others = people.filter((p) => p.user_id !== me?.id);

  return (
    <Screen>
      <Muted>Pick someone in your family. The family group chat is already in your Chats.</Muted>
      <ErrorText>{err}</ErrorText>
      {others.length === 0 ? <Muted>Nobody else has joined yet. Invite them from Family and sharing.</Muted> : null}
      {others.map((p) => (
        <Pressable
          key={p.user_id}
          accessibilityRole="button"
          onPress={async () => {
            try {
              const id = await openDirectChat(p.user_id);
              router.replace({ pathname: '/chat/[id]', params: { id } });
            } catch (e) { setErr(e instanceof Error ? e.message : 'Could not open the chat.'); }
          }}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: Space.md, padding: Space.md, borderRadius: 12, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, opacity: pressed ? 0.8 : 1 })}>
          <Avatar path={null} initials={p.display_name.slice(0, 2).toUpperCase()} size={44} />
          <T style={{ fontWeight: '600' }}>{p.display_name}</T>
        </Pressable>
      ))}
    </Screen>
  );
}
