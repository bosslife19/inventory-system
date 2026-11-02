import { Stack } from 'expo-router';

import { OwnerNotice } from '@/components/owner-notice';
import { useTheme } from '@/hooks/use-theme';
import { usePushNotifications } from '@/lib/push';
import { useUser } from '@/lib/session';
import { useSyncTriggers } from '@/lib/sync';

/**
 * Signed-in area: tabs, plus sheets and detail screens on top. SDP staff get
 * their facility's app; officers and admins get their area's dashboard and,
 * officers, their own store's app as well (see (tabs)/_layout and TabBar).
 */
export default function AppLayout() {
  const user = useUser();
  if (user.role === 'owner') return <OwnerNotice />;
  return <SignedInApp />;
}

function SignedInApp() {
  const c = useTheme();
  useSyncTriggers();
  usePushNotifications();

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="record" options={{ presentation: 'modal' }} />
      <Stack.Screen name="product/[id]" />
      <Stack.Screen name="deliveries/scan" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
      <Stack.Screen name="deliveries/review" />
      <Stack.Screen name="requests" />
      <Stack.Screen name="reorder" options={{ presentation: 'modal' }} />
      <Stack.Screen name="amc" />
      <Stack.Screen name="delivery-notes" />
      <Stack.Screen name="incoming" />
      <Stack.Screen name="fulfil" options={{ presentation: 'modal' }} />
      <Stack.Screen name="dispatch" options={{ presentation: 'modal' }} />
      <Stack.Screen name="reports" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="area/[level]/[id]" />
      <Stack.Screen name="facility/[id]" />
      <Stack.Screen name="activity" />
      <Stack.Screen name="accounts/index" />
      <Stack.Screen name="accounts/new" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
