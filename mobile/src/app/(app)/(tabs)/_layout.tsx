import { Tabs } from 'expo-router';

import { TabBar } from '@/components/tab-bar';
import { isAreaUser } from '@/lib/roles';
import { useUser } from '@/lib/session';

/** Facility staff land on Home; officers and admins on their area's Overview (see TabBar for who sees which tab). */
export default function TabsLayout() {
  const area = isAreaUser(useUser());
  return (
    <Tabs initialRouteName={area ? 'overview' : 'index'} screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} />}>
      <Tabs.Screen name="overview" />
      <Tabs.Screen name="index" />
      <Tabs.Screen name="stock" />
      <Tabs.Screen name="alerts" />
      <Tabs.Screen name="account" />
    </Tabs>
  );
}
