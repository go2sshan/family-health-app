import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { AppEffects } from '@/components/app-effects';
import { LockScreen } from '@/components/lock-screen';
import { Onboarding } from '@/components/onboarding';
import { NotConfigured, SignIn } from '@/components/sign-in';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { FamilyProvider, useFamily } from '@/lib/family';
import { SessionProvider, useSession } from '@/lib/session';
import { supabaseConfigured } from '@/lib/supabase';

SplashScreen.preventAutoHideAsync();

function Loading() {
  const scheme = useColorScheme();
  const c = scheme === 'dark' ? Colors.dark : Colors.light;
  return <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={c.accent} /></View>;
}

function Signed() {
  const { ready, family } = useFamily();
  const scheme = useColorScheme();
  const c = scheme === 'dark' ? Colors.dark : Colors.light;
  if (!ready) return <Loading />;
  if (!family) return <Onboarding />;
  return (
    <>
      <AppEffects />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: c.bg },
          headerTintColor: c.accent,
          headerTitleStyle: { color: c.text },
          contentStyle: { backgroundColor: c.bg },
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="family" options={{ title: 'Family and sharing' }} />
        <Stack.Screen name="add-member" options={{ title: 'Add a profile', presentation: 'modal' }} />
        <Stack.Screen name="new-chat" options={{ title: 'New chat', presentation: 'modal' }} />
        <Stack.Screen name="chat/[id]/index" options={{ title: '' }} />
        <Stack.Screen name="chat/[id]/share-record" options={{ title: 'Share a record', presentation: 'modal' }} />
        <Stack.Screen name="call/[id]" options={{ headerShown: false, presentation: 'fullScreenModal', gestureEnabled: false }} />
        <Stack.Screen name="member/[id]/index" options={{ title: '' }} />
        <Stack.Screen name="member/[id]/sharing" options={{ title: 'Who can see these records', presentation: 'modal' }} />
        <Stack.Screen name="member/[id]/edit" options={{ title: 'Personal details', presentation: 'modal' }} />
        <Stack.Screen name="member/[id]/add-record" options={{ title: 'Add a record', presentation: 'modal' }} />
        <Stack.Screen name="member/[id]/scan" options={{ title: 'Scan a document', presentation: 'modal' }} />
        <Stack.Screen name="member/[id]/add-payment" options={{ title: 'Add payment', presentation: 'modal' }} />
        <Stack.Screen name="member/[id]/emergency" options={{ title: 'Emergency card', presentation: 'fullScreenModal' }} />
      </Stack>
    </>
  );
}

function Gate() {
  const { session, loading, locked } = useSession();
  useEffect(() => { if (!loading) SplashScreen.hideAsync(); }, [loading]);

  if (!supabaseConfigured) return <NotConfigured />;
  if (loading) return <Loading />;
  if (!session) return <SignIn />;
  if (locked) return <LockScreen />;
  return (
    <FamilyProvider>
      <Signed />
    </FamilyProvider>
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
