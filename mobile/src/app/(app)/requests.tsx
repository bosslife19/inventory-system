import { router, useLocalSearchParams } from 'expo-router';
import { ClipboardList, CloudOff, Plus } from 'lucide-react-native';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, Loading } from '@/components/ui/misc';
import { Text } from '@/components/ui/text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { isNetworkError } from '@/lib/api';
import { formatQty, timeAgo } from '@/lib/format';
import { describe, useOutbox } from '@/lib/offlineQueue';
import { useCancelReorderRequest, useConfirmDelivery, useMyReorderRequests } from '@/lib/queries';
import { useFacilityId } from '@/lib/session';
import type { ReorderRequest, ReorderRequestStatus } from '@/lib/types';
import { usePaidAction } from '@/lib/plan';

const STATUS: Record<ReorderRequestStatus, { label: string; tone: 'warning' | 'ok' | 'critical' | 'neutral' }> = {
  pending: { label: 'Waiting', tone: 'warning' },
  fulfilled: { label: 'On its way', tone: 'ok' },
  rejected: { label: 'Declined', tone: 'critical' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

/**
 * What this facility has asked the stores above for, and where each stands.
 * A push about a request lands here with ?focus=<id>. Sent stock arrives as a
 * delivery to confirm, like any other.
 */
export default function Requests() {
  const supplyChain = usePaidAction('supply_chain');
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const facilityId = useFacilityId();
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const requests = useMyReorderRequests(facilityId);
  const cancel = useCancelReorderRequest();
  const confirm = useConfirmDelivery();
  const queued = useOutbox().filter((i) => i.kind === 'reorder_request' && i.facilityId === facilityId);
  const focusId = focus ? Number(focus) : null;
  const rows = [...(requests.data?.data ?? [])].sort((a, b) => Number(b.id === focusId) - Number(a.id === focusId));

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <FlatList
        data={rows}
        keyExtractor={(r) => String(r.id)}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + Spacing.eight }]}
        refreshControl={<RefreshControl refreshing={requests.isRefetching} onRefresh={() => void requests.refetch()} tintColor={c.primary} />}
        ListHeaderComponent={
          <View style={{ gap: Spacing.four, marginBottom: Spacing.four }}>
            <PageHeader back eyebrow="Reorder" title="Reorder requests" subtitle="Ask a store above for stock. You’re notified when it’s sent or declined." />
            <View style={[styles.pad, { gap: Spacing.three }]}>
              <Button label="New request" icon={Plus} block onPress={supplyChain(() => router.push('/reorder'))} />
              {queued.map((i) => (
                <Card key={i.id} style={{ borderColor: c.warning }}>
                  <Text variant="label">{describe(i).title}</Text>
                  <Text variant="caption" tone="warning">
                    {i.status === 'failed' ? `Not accepted — ${i.error ?? 'see Account'}` : 'Waiting to send'} · {describe(i).detail}
                  </Text>
                </Card>
              ))}
            </View>
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: Spacing.three }} />}
        renderItem={({ item }) => (
          <View style={styles.pad}>
            <RequestCard
              r={item}
              highlight={item.id === focusId}
              onCancel={() => cancel.mutate(item.id)}
              cancelling={cancel.isPending && cancel.variables === item.id}
              onConfirm={(noteId) => confirm.mutate(noteId)}
              confirming={confirm.isPending && confirm.variables === item.delivery_note?.id}
              confirmError={confirm.isError && confirm.variables === item.delivery_note?.id ? confirm.error.message : undefined}
            />
          </View>
        )}
        ListEmptyComponent={
          requests.isPending ? (
            <Loading />
          ) : requests.isError && isNetworkError(requests.error) ? (
            <EmptyState icon={CloudOff} title="You're offline" body="Your requests will load when you're back online." />
          ) : queued.length ? null : (
            <EmptyState icon={ClipboardList} title="No requests yet" body="When stock runs low, ask the store above you — or one further up." />
          )
        }
      />
    </View>
  );
}

interface CardProps {
  r: ReorderRequest;
  highlight: boolean;
  onCancel: () => void;
  cancelling: boolean;
  onConfirm: (deliveryNoteId: number) => void;
  confirming: boolean;
  confirmError?: string;
}

function RequestCard({ r, highlight, onCancel, cancelling, onConfirm, confirming, confirmError }: CardProps) {
  const c = useTheme();
  const st = STATUS[r.status];
  return (
    <Card style={[{ gap: Spacing.two }, highlight && { borderColor: c.primary, borderWidth: 2 }]}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text variant="label">{r.supplier.name}</Text>
          <Text variant="caption" tone="muted">
            {r.number} · {timeAgo(r.created_at)}
          </Text>
        </View>
        <Badge label={st.label} tone={st.tone} />
      </View>
      {r.items.map((i) => (
        <Text key={i.id} variant="small" tone="secondary">
          {i.product.name}: {formatQty(i.quantity_requested)} {i.product.unit_of_measure}
          {i.quantity_supplied !== null ? ` · ${formatQty(i.quantity_supplied)} sent` : ''}
        </Text>
      ))}
      {r.status === 'fulfilled' && r.delivery_note && (
        <Text variant="caption" tone="primary">
          Sent as {r.delivery_note.delivery_note_no}
          {r.delivery_note.status === 'draft' ? ' — confirm it when it arrives' : ` — ${r.delivery_note.status}`}
        </Text>
      )}
      {r.delivery_note?.status === 'draft' && (
        <>
          <Button label="Confirm received" size="sm" onPress={() => onConfirm(r.delivery_note!.id)} loading={confirming} />
          {confirmError && (
            <Text variant="caption" tone="critical">
              {confirmError}
            </Text>
          )}
        </>
      )}
      {r.status === 'rejected' && (
        <Text variant="caption" tone="critical">
          {r.response_note ? `“${r.response_note}”` : 'Declined'} — you can ask another store.
        </Text>
      )}
      {r.status === 'pending' && <Button label="Cancel request" variant="ghost" size="sm" onPress={onCancel} loading={cancelling} />}
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
