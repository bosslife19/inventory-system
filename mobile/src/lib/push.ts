import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { api } from './api';

/**
 * Push notifications (mobile/CLAUDE.md rules 3 and 4).
 *
 * The native FCM / APNs token is registered on sign-in and on every return
 * to the foreground, since tokens rotate. Remote push needs a development
 * build — Expo Go on Android can't receive it (SDK 53+) — so failures here
 * are silent: the app works fully without push.
 *
 * A notification tap deep-links into the alerts screen, focused on the
 * alert in the payload ({ alert_id }); a reorder request update opens the
 * requests screen ({ reorder_request_id }). Officers' digests carry no alert_id;
 * their app is the notifications list itself, so it opens with no deep link.
 */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function registerPushToken(): Promise<void> {
  // Android only for now: the backend sends through FCM, and on iOS this
  // returns an APNs token FCM can't deliver to. iOS needs an APNs key in
  // Firebase (or Expo's push service) first.
  if (Platform.OS !== 'android' || !Device.isDevice) return;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('stock-alerts', {
        name: 'Stock alerts',
        importance: Notifications.AndroidImportance.HIGH,
        lightColor: '#1d4ed8',
      });
    }
    const current = await Notifications.getPermissionsAsync();
    const granted = current.granted || (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return;

    const { data } = await Notifications.getDevicePushTokenAsync();
    await api.POST('/users/me/fcm-token', { body: { token: String(data) } });
  } catch {
    // No push in this build (e.g. Expo Go on Android) or offline — try again next foreground.
  }
}

function openFromNotification(response: Notifications.NotificationResponse | null) {
  const data = response?.notification.request.content.data;
  if (data?.reorder_request_id != null) router.push({ pathname: '/requests', params: { focus: String(data.reorder_request_id) } });
  else if (data?.alert_id != null) router.push({ pathname: '/alerts', params: { focus: String(data.alert_id) } });
}

/**
 * Mount once inside the signed-in app. `onOpen` replaces the alerts deep
 * link (officers, who have no alerts tab, just refresh their list).
 */
export function usePushNotifications(onOpen: (response: Notifications.NotificationResponse | null) => void = openFromNotification) {
  const lastResponse = Notifications.useLastNotificationResponse();

  useEffect(() => {
    void registerPushToken();
    const app = AppState.addEventListener('change', (state) => state === 'active' && void registerPushToken());
    const tap = Notifications.addNotificationResponseReceivedListener(onOpen);
    return () => {
      app.remove();
      tap.remove();
    };
  }, [onOpen]);

  // Cold start from a notification tap.
  useEffect(() => {
    if (lastResponse) onOpen(lastResponse);
  }, [lastResponse, onOpen]);
}
