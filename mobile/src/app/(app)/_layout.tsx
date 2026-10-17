import { Stack } from 'expo-router';

import { OfficerHome } from '@/components/officer-home';
import { useTheme } from '@/hooks/use-theme';
import { usePushNotifications } from '@/lib/push';
import { useUser } from '@/lib/session';
import { useSyncTriggers } from '@/lib/sync';

/** Signed-in area: tabs, plus the record sheet and product detail on top. */
export default function AppLayout() {
  const user = useUser();
  // Officers and admins keep no facility Stock Card here; they get their notifications and digests.
  if (user.facility_id == null) return <OfficerHome />;
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
    </Stack>
  );
}
