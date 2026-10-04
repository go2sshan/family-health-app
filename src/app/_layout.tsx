import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { LockScreen } from '@/components/lock-screen';
import { NotConfigured, SignIn } from '@/components/sign-in';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { SessionProvider, useSession } from '@/lib/session';
import { supabaseConfigured } from '@/lib/supabase';

SplashScreen.preventAutoHideAsync();

function Gate() {
  const { session, loading, locked } = useSession();
  const scheme = useColorScheme();
  const c = scheme === 'dark' ? Colors.dark : Colors.light;

  useEffect(() => { if (!loading) SplashScreen.hideAsync(); }, [loading]);

  if (!supabaseConfigured) return <NotConfigured />;
  if (loading) return <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={c.accent} /></View>;
  if (!session) return <SignIn />;
  if (locked) return <LockScreen />;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: c.bg },
        headerTintColor: c.accent,
        headerTitleStyle: { color: c.text },
        contentStyle: { backgroundColor: c.bg },
      }}>
      <Stack.Screen name="index" options={{ title: 'Family', headerLargeTitle: true }} />
      <Stack.Screen name="add-member" options={{ title: 'Add family member', presentation: 'modal' }} />
      <Stack.Screen name="member/[id]/index" options={{ title: '' }} />
      <Stack.Screen name="member/[id]/edit" options={{ title: 'Personal details', presentation: 'modal' }} />
      <Stack.Screen name="member/[id]/add-record" options={{ title: 'Add a record', presentation: 'modal' }} />
      <Stack.Screen name="member/[id]/scan" options={{ title: 'Scan a document', presentation: 'modal' }} />
      <Stack.Screen name="member/[id]/add-payment" options={{ title: 'Add payment', presentation: 'modal' }} />
      <Stack.Screen name="member/[id]/emergency" options={{ title: 'Emergency card', presentation: 'fullScreenModal' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const scheme = useColorScheme();
  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <SessionProvider>
        <Gate />
      </SessionProvider>
    </ThemeProvider>
  );
}
