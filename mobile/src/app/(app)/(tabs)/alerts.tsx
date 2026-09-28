import { useLocalSearchParams } from 'expo-router';
import { BellRing, CloudOff } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { AlertCard } from '@/components/alert-card';
import { PageHeader } from '@/components/page-header';
import { Segmented } from '@/components/ui/chip';
import { EmptyState, Loading } from '@/components/ui/misc';
import { MaxContentWidth, Spacing, TabBarInset } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { isNetworkError } from '@/lib/api';
import { useAlerts } from '@/lib/queries';
import { useFacilityId } from '@/lib/session';

type View_ = 'active' | 'resolved';

/**
 * Alerts for this facility, scoped by the API. A push notification tap
 * lands here with ?focus=<alert id> (mobile/CLAUDE.md rule 3).
 */
export default function Alerts() {
  const c = useTheme();
  const facilityId = useFacilityId();
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const [view, setView] = useState<View_>('active');
  const alerts = useAlerts(view === 'resolved' ? 'resolved' : undefined, facilityId);
  const rows = alerts.data?.data ?? [];
  const focusId = focus ? Number(focus) : null;
  // Surface the tapped alert first.
  const sorted = focusId ? [...rows].sort((a, b) => Number(b.id === focusId) - Number(a.id === focusId)) : rows;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <FlatList
        data={sorted}
        keyExtractor={(a) => String(a.id)}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={alerts.isRefetching} onRefresh={() => void alerts.refetch()} tintColor={c.primary} />}
        ListHeaderComponent={
          <View style={{ gap: Spacing.four, marginBottom: Spacing.four }}>
            <PageHeader
              eyebrow="Alerts"
              title="Stock alerts"
              subtitle="Raised automatically and cleared when the stock situation is fixed."
            />
            <View style={styles.pad}>
              <Segmented
                value={view}
                onChange={setView}
                options={[
                  { value: 'active', label: 'Needs attention' },
                  { value: 'resolved', label: 'Resolved' },
                ]}
              />
            </View>
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: Spacing.three }} />}
        renderItem={({ item }) => (
          <View style={styles.pad}>
            <AlertCard alert={item} highlight={item.id === focusId} />
          </View>
        )}
        ListEmptyComponent={
          alerts.isPending ? (
            <Loading />
          ) : alerts.isError && isNetworkError(alerts.error) ? (
            <EmptyState icon={CloudOff} title="You're offline" body="Alerts will load when you're back online." />
          ) : (
            <EmptyState
              icon={BellRing}
              title={view === 'active' ? 'Nothing needs attention' : 'No resolved alerts'}
              body={view === 'active' ? 'No stock-outs, low stock or expiring batches right now.' : undefined}
            />
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
    paddingBottom: TabBarInset + Spacing.four,
  },
  pad: {
    paddingHorizontal: Spacing.five,
  },
});
