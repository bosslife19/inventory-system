import { Stack } from 'expo-router';
import { Building2, LogOut } from 'lucide-react-native';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';
import { useTheme } from '@/hooks/use-theme';
import { ROLE_LABEL } from '@/lib/format';
import { usePushNotifications } from '@/lib/push';
import { useSession, useUser } from '@/lib/session';
import { useSyncTriggers } from '@/lib/sync';

/** Signed-in area: tabs, plus the record sheet and product detail on top. */
export default function AppLayout() {
  const user = useUser();
  if (user.facility_id == null) return <NotFacilityStaff role={ROLE_LABEL[user.role]} />;
  return <FacilityApp />;
}

/** The app is for facility (SDP) staff; officers use the web dashboards. */
function NotFacilityStaff({ role }: { role: string }) {
  const c = useTheme();
  const { signOut } = useSession();
  return (
    <View style={{ flex: 1, justifyContent: 'center', backgroundColor: c.bg }}>
      <EmptyState
        icon={Building2}
        title="This app is for facility staff"
        body={`You're signed in as ${role}. LGA, State and Federal views are on the web dashboard.`}>
        <Button label="Sign out" icon={LogOut} variant="ghost" onPress={() => void signOut()} />
      </EmptyState>
    </View>
  );
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
