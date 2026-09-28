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
 * alert in the payload ({ alert_id }).
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
  if (Platform.OS === 'web' || !Device.isDevice) return;
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
  const alertId = response?.notification.request.content.data?.alert_id;
  if (alertId != null) router.push({ pathname: '/alerts', params: { focus: String(alertId) } });
}

/** Mount once inside the signed-in app. */
export function usePushNotifications() {
  const lastResponse = Notifications.useLastNotificationResponse();

  useEffect(() => {
    void registerPushToken();
    const app = AppState.addEventListener('change', (state) => state === 'active' && void registerPushToken());
    const tap = Notifications.addNotificationResponseReceivedListener(openFromNotification);
    return () => {
      app.remove();
      tap.remove();
    };
  }, []);

  // Cold start from a notification tap.
  useEffect(() => {
    if (lastResponse) openFromNotification(lastResponse);
  }, [lastResponse]);
}
