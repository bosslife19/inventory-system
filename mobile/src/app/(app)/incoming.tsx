import { router, useLocalSearchParams } from 'expo-router';
import { CloudOff, Inbox, Truck, X } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, Loading } from '@/components/ui/misc';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { isNetworkError } from '@/lib/api';
import { formatQty, timeAgo } from '@/lib/format';
import { describe, useOutbox, type OutboxItem } from '@/lib/offlineQueue';
import { useDeclineReorderRequest, useIncomingRequests, useStockBalances } from '@/lib/queries';
import { useFacilityId } from '@/lib/session';
import type { ProductStock, ReorderRequest, ReorderRequestStatus } from '@/lib/types';

const STATUS: Record<ReorderRequestStatus, { label: string; tone: 'warning' | 'ok' | 'critical' | 'neutral' }> = {
  pending: { label: 'To answer', tone: 'warning' },
  fulfilled: { label: 'Issued', tone: 'ok' },
  rejected: { label: 'Declined', tone: 'critical' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

/**
 * Reorder requests from the facilities below, waiting on this store. Issue
 * the stock (a dispatch, see fulfil.tsx) or decline with a reason. A push
 * about a new request lands here with ?focus=<id>.
 */
export default function Incoming() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const facilityId = useFacilityId();
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const requests = useIncomingRequests(facilityId);
  const stock = useStockBalances(facilityId);
  const decline = useDeclineReorderRequest();
  const outbox = useOutbox();
  const focusId = focus ? Number(focus) : null;
  const queuedFor = (id: number) => outbox.find((i) => i.kind === 'fulfil' && i.requestId === id);
  const rows = [...(requests.data?.data ?? [])].sort(
    (a, b) => Number(b.id === focusId) - Number(a.id === focusId) || Number(b.status === 'pending') - Number(a.status === 'pending'),
  );
  const waiting = rows.filter((r) => r.status === 'pending').length;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <FlatList
        data={rows}
        keyExtractor={(r) => String(r.id)}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + Spacing.eight }]}
        refreshControl={<RefreshControl refreshing={requests.isRefetching} onRefresh={() => void requests.refetch()} tintColor={c.primary} />}
        ListHeaderComponent={
          <PageHeader
            back
            eyebrow="Your store"
            title="Incoming requests"
            subtitle={waiting > 0 ? `${waiting} waiting for an answer. Issue the stock, or decline with a reason.` : 'Facilities below ask your store for stock here.'}
          />
        }
        ItemSeparatorComponent={() => <View style={{ height: Spacing.three }} />}
        renderItem={({ item }) => (
          <View style={styles.pad}>
            <IncomingCard
              r={item}
              stock={stock.data}
              highlight={item.id === focusId}
              queued={queuedFor(item.id)}
              onDecline={(reason) => decline.mutate({ id: item.id, reason })}
              declining={decline.isPending && decline.variables?.id === item.id}
              declineError={decline.isError && decline.variables?.id === item.id ? decline.error.message : undefined}
            />
          </View>
        )}
        ListEmptyComponent={
          requests.isPending ? (
            <Loading />
          ) : requests.isError && isNetworkError(requests.error) ? (
            <EmptyState icon={CloudOff} title="You're offline" body="Requests will load when you're back online." />
          ) : (
            <EmptyState icon={Inbox} title="No requests yet" body="When a facility below asks your store for stock, it shows up here and you get a notification." />
          )
        }
      />
    </View>
  );
}

interface CardProps {
  r: ReorderRequest;
  stock: ProductStock[] | undefined;
  highlight: boolean;
  queued?: OutboxItem;
  onDecline: (reason: string | null) => void;
  declining: boolean;
  declineError?: string;
}

function IncomingCard({ r, stock, highlight, queued, onDecline, declining, declineError }: CardProps) {
  const c = useTheme();
  const [declineOpen, setDeclineOpen] = useState(false);
  const [reason, setReason] = useState('');
  const st = STATUS[r.status];
  const pending = r.status === 'pending' && !queued;

  return (
    <Card style={[{ gap: Spacing.two }, highlight && { borderColor: c.primary, borderWidth: 2 }]}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text variant="label">{r.facility.name}</Text>
          <Text variant="caption" tone="muted">
            {r.number} · {timeAgo(r.created_at)}
            {r.requested_by_name ? ` · ${r.requested_by_name}` : ''}
          </Text>
        </View>
        <Badge label={queued ? 'Sending…' : st.label} tone={queued ? 'notice' : st.tone} />
      </View>
      {r.items.map((i) => {
        const usable = stock?.find((s) => s.product.id === i.product.id)?.usable_quantity ?? 0;
        return (
          <Text key={i.id} variant="small" tone="secondary">
            {i.product.name}: {formatQty(i.quantity_requested)} {i.product.unit_of_measure}
            {i.quantity_supplied !== null
              ? ` · ${formatQty(i.quantity_supplied)} sent`
              : r.status === 'pending'
                ? ` · ${formatQty(usable)} usable here`
                : ''}
          </Text>
        );
      })}
      {r.comments && (
        <Text variant="caption" tone="muted">
          “{r.comments}”
        </Text>
      )}
      {r.status === 'fulfilled' && r.delivery_note && (
        <Text variant="caption" tone="primary">
          Sent as {r.delivery_note.delivery_note_no} — {r.delivery_note.status === 'draft' ? 'waiting for them to confirm' : r.delivery_note.status}
        </Text>
      )}
      {r.status === 'rejected' && r.response_note && (
        <Text variant="caption" tone="critical">
          “{r.response_note}”
        </Text>
      )}
      {queued && (
        <Text variant="caption" tone={queued.status === 'failed' ? 'critical' : 'warning'}>
          {queued.status === 'failed' ? `Not accepted — ${queued.error ?? 'see Account'}` : `Waiting to send · ${describe(queued).detail}`}
        </Text>
      )}
      {pending &&
        (declineOpen ? (
          <View style={{ gap: Spacing.two }}>
            <TextField label="Reason (optional)" value={reason} onChangeText={setReason} placeholder="e.g. Out of stock until the next CMS delivery" />
            <View style={styles.row}>
              <Button label="Keep it" variant="ghost" size="sm" onPress={() => setDeclineOpen(false)} />
              <View style={{ flex: 1 }}>
                <Button label="Decline request" icon={X} variant="danger" size="sm" block loading={declining} onPress={() => onDecline(reason.trim() || null)} />
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Button label="Issue stock" icon={Truck} size="sm" block onPress={() => router.push({ pathname: '/fulfil', params: { id: String(r.id) } })} />
            </View>
            <Button label="Decline" variant="ghost" size="sm" onPress={() => setDeclineOpen(true)} />
          </View>
        ))}
      {declineError && (
        <Text variant="caption" tone="critical">
          {declineError}
        </Text>
      )}
    </Card>
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
});
