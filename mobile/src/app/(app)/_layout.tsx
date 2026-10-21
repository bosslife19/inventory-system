import { Stack } from 'expo-router';

import { OfficerHome } from '@/components/officer-home';
import { OwnerNotice } from '@/components/owner-notice';
import { useTheme } from '@/hooks/use-theme';
import { usePushNotifications } from '@/lib/push';
import { useUser } from '@/lib/session';
import { useSyncTriggers } from '@/lib/sync';

/** Signed-in area: tabs, plus the record sheet and product detail on top. */
export default function AppLayout() {
  const user = useUser();
  if (user.role === 'owner') return <OwnerNotice />;
  // Admins (and any officer without a store) keep no Stock Card here; they get their notifications and digests.
  // SDP staff and store officers get the full app for their facility or store.
  if (user.facility_id == null && user.store == null) return <OfficerHome />;
  return <FacilityApp />;
}

function FacilityApp() {
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
    </Stack>
  );
}
