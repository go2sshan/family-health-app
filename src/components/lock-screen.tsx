import { useEffect } from 'react';
import { View } from 'react-native';

import { Button, H, Muted } from '@/components/ui';
import { usePalette } from '@/hooks/use-palette';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

export function LockScreen() {
  const { unlock } = useSession();
  const c = usePalette();
  useEffect(() => { unlock(); }, [unlock]);
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
      <H style={{ fontSize: 24 }}>Locked</H>
      <Muted style={{ textAlign: 'center' }}>Your family&apos;s health records are protected with Face ID.</Muted>
      <Button kind="primary" title="Unlock with Face ID" onPress={unlock} style={{ alignSelf: 'stretch' }} />
      <Button title="Sign out" onPress={() => supabase.auth.signOut()} style={{ alignSelf: 'stretch' }} />
    </View>
  );
}
