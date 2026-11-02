import { CloudOff, ListChecks, Search } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Chip, ChipRow } from '@/components/ui/chip';
import { EmptyState, Loading } from '@/components/ui/misc';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { isNetworkError } from '@/lib/api';
import { AUDIT_CATEGORY_LABEL, ROLE_LABEL, timeAgo } from '@/lib/format';
import { useAuditEvents } from '@/lib/queries';
import type { AuditCategory } from '@/lib/types';

const CATEGORIES: (AuditCategory | 'all')[] = ['all', 'stock', 'deliveries', 'alerts', 'accounts', 'facilities', 'catalog'];

const timeFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' });

/** The audit log for the signed-in user's area, newest first — the web Activity log, read-only. */
export default function Activity() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const [category, setCategory] = useState<AuditCategory | 'all'>('all');
  const [draft, setDraft] = useState('');
  const [q, setQ] = useState('');
  const events = useAuditEvents({ category: category === 'all' ? undefined : category, q });
  const rows = events.data?.pages.flatMap((p) => p.data) ?? [];
  const total = events.data?.pages[0]?.meta.pagination.total ?? 0;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <FlatList
        data={rows}
        keyExtractor={(e) => String(e.id)}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + Spacing.eight }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={events.isRefetching && !events.isFetchingNextPage} onRefresh={() => void events.refetch()} tintColor={c.primary} />}
        onEndReached={() => events.hasNextPage && !events.isFetchingNextPage && void events.fetchNextPage()}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          <View style={{ gap: Spacing.three, marginBottom: Spacing.four }}>
            <PageHeader back eyebrow="Audit trail" title="Activity log" subtitle="Who recorded, confirmed or changed what, in your area." />
            <View style={styles.pad}>
              <TextField
                icon={Search}
                placeholder="Search the summaries…"
                value={draft}
                onChangeText={setDraft}
                onSubmitEditing={() => setQ(draft.trim())}
                onEndEditing={() => setQ(draft.trim())}
                returnKeyType="search"
                autoCorrect={false}
              />
            </View>
            <ChipRow>
              {CATEGORIES.map((cat) => (
                <Chip key={cat} label={cat === 'all' ? 'All' : AUDIT_CATEGORY_LABEL[cat]} selected={cat === category} onPress={() => setCategory(cat)} />
              ))}
            </ChipRow>
            {events.data && (
              <Text variant="caption" tone="muted" style={styles.pad}>
                {total.toLocaleString('en-NG')} event{total === 1 ? '' : 's'}
              </Text>
            )}
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: Spacing.three }} />}
        renderItem={({ item: e }) => (
          <View style={styles.pad}>
            <Card style={{ gap: Spacing.two }}>
              <View style={styles.top}>
                <Badge label={AUDIT_CATEGORY_LABEL[e.category] ?? e.category} tone="notice" dot={false} />
                <Text variant="caption" tone="muted">
                  {timeFmt.format(new Date(e.occurred_at))} · {timeAgo(e.occurred_at)}
                </Text>
              </View>
              <Text variant="small">{e.summary}</Text>
              <Text variant="caption" tone="muted">
                {[e.actor ? `${e.actor.name} (${ROLE_LABEL[e.actor.role]})` : 'System', e.place.facility, e.place.lga && `${e.place.lga} LGA`, e.place.state]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </Card>
          </View>
        )}
        ListEmptyComponent={
          events.isPending ? (
            <Loading />
          ) : events.isError && isNetworkError(events.error) ? (
            <EmptyState icon={CloudOff} title="You're offline" body="The activity log loads when you're back online." />
          ) : events.isError ? (
            <EmptyState icon={ListChecks} title="Can't load the activity log" body={events.error.message} />
          ) : (
            <EmptyState icon={ListChecks} title="Nothing here" body={q || category !== 'all' ? 'Try another search or category.' : 'No activity recorded in your area yet.'} />
          )
        }
        ListFooterComponent={events.isFetchingNextPage ? <ActivityIndicator color={c.primary} style={{ marginTop: Spacing.four }} /> : null}
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
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
});
