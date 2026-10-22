import { BellRing, CheckCheck, CloudOff, LogOut } from 'lucide-react-native';
import { useCallback } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, Loading } from '@/components/ui/misc';
import { Text } from '@/components/ui/text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { isNetworkError } from '@/lib/api';
import { ROLE_LABEL, timeAgo } from '@/lib/format';
import { usePushNotifications } from '@/lib/push';
import { useMarkNotificationsRead, useNotifications } from '@/lib/queries';
import { useSession, useUser } from '@/lib/session';

/**
 * Admins (and officers without a store) on the phone: their notifications —
 * the daily digest of new stock alerts in their area. Signing in here
 * registers the device for push. The stock dashboards are on the web.
 */
export function OfficerHome() {
  const refetch = useNotifications().refetch;
  // A tap on a push lands here: just bring the list up to date.
  usePushNotifications(useCallback(() => void refetch(), [refetch]));
  return <NotificationList />;
}

/**
 * The signed-in user's notifications. `inApp`: opened from a store officer's
 * home screen (back button, no sign-out), rather than being the whole app.
 */
export function NotificationList({ inApp = false }: { inApp?: boolean }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const user = useUser();
  const { signOut } = useSession();
  const notifications = useNotifications();
  const markRead = useMarkNotificationsRead();
  const refetch = notifications.refetch;

  const rows = notifications.data?.data ?? [];
  const unread = notifications.data?.meta.unread_count ?? 0;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <FlatList
        data={rows}
        keyExtractor={(n) => String(n.id)}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + Spacing.eight }]}
        refreshControl={<RefreshControl refreshing={notifications.isRefetching} onRefresh={() => void refetch()} tintColor={c.primary} />}
        ListHeaderComponent={
          <View style={{ gap: Spacing.four, marginBottom: Spacing.four }}>
            <PageHeader
              back={inApp}
              eyebrow={ROLE_LABEL[user.role]}
              title="Notifications"
              subtitle={
                inApp
                  ? 'A daily digest of new stock alerts in your area, and alerts at your store.'
                  : user.role === 'admin'
                    ? 'Set up your facilities, products and staff on the web dashboard. A daily digest of new stock alerts arrives here.'
                    : 'A daily digest of new stock alerts in your area. Dashboards are on the web.'
              }
            />
            {unread > 0 && (
              <View style={[styles.pad, styles.bar]}>
                <Text variant="label" tone="primary">
                  {unread} unread
                </Text>
                <Button label="Mark all read" icon={CheckCheck} variant="ghost" size="sm" onPress={() => markRead.mutate(undefined)} loading={markRead.isPending} />
              </View>
            )}
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: Spacing.three }} />}
        renderItem={({ item }) => (
          <View style={styles.pad}>
            <Card onPress={item.read_at ? undefined : () => markRead.mutate(item.id)} style={item.read_at ? undefined : { borderColor: c.primary }}>
              <View style={styles.row}>
                {!item.read_at && <View style={[styles.dot, { backgroundColor: c.primary }]} />}
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="label">{item.title}</Text>
                  <Text variant="small" tone="secondary">
                    {item.body}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {item.type === 'digest' ? 'Daily digest' : 'Your store'} · {timeAgo(item.created_at)}
                  </Text>
                </View>
              </View>
            </Card>
          </View>
        )}
        ListEmptyComponent={
          notifications.isPending ? (
            <Loading />
          ) : notifications.isError && isNetworkError(notifications.error) ? (
            <EmptyState icon={CloudOff} title="You're offline" body="Notifications will load when you're back online." />
          ) : (
            <EmptyState icon={BellRing} title="No notifications yet" body="Your first digest arrives the morning after new alerts are raised in your area." />
          )
        }
        ListFooterComponent={
          inApp ? null : (
            <View style={[styles.pad, { marginTop: Spacing.six }]}>
              <Button label="Sign out" icon={LogOut} variant="ghost" onPress={() => void signOut()} />
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  pad: {
    paddingHorizontal: Spacing.five,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.three,
    alignItems: 'flex-start',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
});
