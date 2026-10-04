import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';

import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false,
  }),
});

/** Ask permission once and save this phone's push address so family messages and calls reach it. */
export async function registerForPush(userId: string): Promise<void> {
  if (!Device.isDevice) return;
  const current = await Notifications.getPermissionsAsync();
  let granted = current.granted;
  if (!granted && current.canAskAgain) granted = (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  if (!projectId) return; // set by `eas init`; push works in TestFlight builds
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await supabase.from('push_tokens').upsert(
      { user_id: userId, token, platform: Platform.OS, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,token' },
    );
  } catch {
    // no network or not a real build: try again next launch
  }
}

/** Open the right screen when someone taps a notification. */
export function openFromNotification(data: unknown) {
  const d = (data ?? {}) as { conversationId?: string; callId?: string | null };
  if (d.callId) router.push({ pathname: '/call/[id]', params: { id: d.callId } });
  else if (d.conversationId) router.push({ pathname: '/chat/[id]', params: { id: d.conversationId } });
}

export function listenForTaps(): () => void {
  const last = Notifications.getLastNotificationResponse();
  if (last) openFromNotification(last.notification.request.content.data);
  const sub = Notifications.addNotificationResponseReceivedListener((r) => openFromNotification(r.notification.request.content.data));
  return () => sub.remove();
}
