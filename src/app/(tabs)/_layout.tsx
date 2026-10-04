import { router, Tabs, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui';
import { usePalette } from '@/hooks/use-palette';
import { listConversations, watchAllMessages } from '@/lib/chat';
import { useFamily } from '@/lib/family';

export default function TabsLayout() {
  const c = usePalette();
  const { me } = useFamily();
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    try { setUnread((await listConversations()).reduce((n, r) => n + r.unread, 0)); } catch { /* offline */ }
  }, []);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));
  useEffect(() => watchAllMessages((m) => { if (m.sender_id !== me?.id) refresh(); }), [refresh, me?.id]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.line },
        headerStyle: { backgroundColor: c.bg },
        headerTitleStyle: { color: c.text },
        sceneStyle: { backgroundColor: c.bg },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Family',
          headerRight: () => <Button small title="Family and sharing" onPress={() => router.push('/family')} style={{ marginRight: 12 }} />,
          tabBarIcon: ({ color, size }) => <SymbolView name="person.3.fill" tintColor={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="chats"
        listeners={{ focus: refresh }}
        options={{
          title: 'Chats',
          headerRight: () => <Button small title="New chat" onPress={() => router.push('/new-chat')} style={{ marginRight: 12 }} />,
          tabBarBadge: unread > 0 ? unread : undefined,
          tabBarIcon: ({ color, size }) => <SymbolView name="bubble.left.and.bubble.right.fill" tintColor={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
