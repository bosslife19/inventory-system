import { router } from 'expo-router';
import { Check, CloudOff, ScanLine, Truck, X } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Segmented } from '@/components/ui/chip';
import { EmptyState, Loading } from '@/components/ui/misc';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { isNetworkError } from '@/lib/api';
import { formatDate, formatQty } from '@/lib/format';
import { describe, useOutbox } from '@/lib/offlineQueue';
import { useConfirmDelivery, useDeliveryNotes, useRejectDelivery } from '@/lib/queries';
import { useFacilityId } from '@/lib/session';
import type { DeliveryNote, DeliveryNoteStatus } from '@/lib/types';

type Filter = DeliveryNoteStatus | 'all';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'draft', label: 'To confirm' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'All' },
];

const STATUS: Record<DeliveryNoteStatus, { label: string; tone: 'warning' | 'ok' | 'critical' }> = {
  draft: { label: 'To confirm', tone: 'warning' },
  confirmed: { label: 'Confirmed', tone: 'ok' },
  rejected: { label: 'Rejected', tone: 'critical' },
};

/**
 * Every delivery to this facility or store: ones waiting to be signed for
 * (sent from a store above, or saved as a draft on the web), and past ones.
 * Confirming posts the receipts; rejecting adds nothing here and puts the
 * stock back on the sender's card. Both need a connection.
 */
export default function Deliveries() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const facilityId = useFacilityId();
  const [filter, setFilter] = useState<Filter>('draft');
  const notes = useDeliveryNotes(facilityId, filter === 'all' ? undefined : filter);
  const confirm = useConfirmDelivery();
  const reject = useRejectDelivery();
  const queued = useOutbox().filter((i) => i.kind === 'delivery_note' && i.facilityId === facilityId);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <FlatList
        data={notes.data?.data ?? []}
        keyExtractor={(n) => String(n.id)}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + Spacing.eight }]}
        refreshControl={<RefreshControl refreshing={notes.isRefetching} onRefresh={() => void notes.refetch()} tintColor={c.primary} />}
        ListHeaderComponent={
          <View style={{ gap: Spacing.four, marginBottom: Spacing.four }}>
            <PageHeader back eyebrow="Deliveries" title="Delivery notes" subtitle="Sign for stock sent to you, or reject it if it isn’t right." />
            <View style={[styles.pad, { gap: Spacing.three }]}>
              <Button label="Scan a delivery note" icon={ScanLine} variant="ink" block onPress={() => router.push('/deliveries/scan')} />
              <Segmented options={FILTERS} value={filter} onChange={setFilter} />
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
            <NoteCard
              note={item}
              onConfirm={() => confirm.mutate(item.id)}
              confirming={confirm.isPending && confirm.variables === item.id}
              onReject={(reason) => reject.mutate({ id: item.id, reason })}
              rejecting={reject.isPending && reject.variables?.id === item.id}
              error={
                confirm.isError && confirm.variables === item.id
                  ? confirm.error.message
                  : reject.isError && reject.variables?.id === item.id
                    ? reject.error.message
                    : undefined
              }
            />
          </View>
        )}
        ListEmptyComponent={
          notes.isPending ? (
            <Loading />
          ) : notes.isError && isNetworkError(notes.error) ? (
            <EmptyState icon={CloudOff} title="You're offline" body="Delivery notes will load when you're back online." />
          ) : (
            <EmptyState
              icon={Truck}
              title={filter === 'draft' ? 'Nothing to confirm' : 'No delivery notes'}
              body={filter === 'draft' ? 'Stock a store sends you shows up here to sign for.' : 'Deliveries you record or are sent show up here.'}
            />
          )
        }
      />
    </View>
  );
}

interface CardProps {
  note: DeliveryNote;
  onConfirm: () => void;
  confirming: boolean;
  onReject: (reason: string | null) => void;
  rejecting: boolean;
  error?: string;
}

function NoteCard({ note: n, onConfirm, confirming, onReject, rejecting, error }: CardProps) {
  const [expanded, setExpanded] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('');
  const st = STATUS[n.status];
  const shown = expanded ? n.items : n.items.slice(0, 3);

  return (
    <Card style={{ gap: Spacing.two }}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text variant="label">{n.source_facility?.name ?? n.source}</Text>
          <Text variant="caption" tone="muted">
            {n.delivery_note_no ?? 'No number'} · {n.dispatched_date && n.status === 'draft' ? `sent ${formatDate(n.dispatched_date)}` : formatDate(n.received_date)}
          </Text>
        </View>
        <Badge label={st.label} tone={st.tone} />
      </View>
      {shown.map((i) => (
        <Text key={i.id} variant="small" tone="secondary">
          {i.product.name}: {formatQty(i.quantity)} {i.product.unit_of_measure}
          {i.batch_no ? ` · ${i.batch_no}` : ''}
          {i.expiry_date ? ` · exp ${formatDate(i.expiry_date)}` : ''}
        </Text>
      ))}
      {n.items.length > 3 && (
        <Pressable onPress={() => setExpanded(!expanded)} accessibilityRole="button" hitSlop={6}>
          <Text variant="caption" weight="semibold" tone="primary">
            {expanded ? 'Show less' : `+ ${n.items.length - 3} more`}
          </Text>
        </Pressable>
      )}
      {n.status === 'confirmed' && n.confirmed_by_name && (
        <Text variant="caption" tone="muted">
          Confirmed by {n.confirmed_by_name}
        </Text>
      )}
      {n.status === 'rejected' && (
        <Text variant="caption" tone="critical">
          Rejected{n.rejected_by_name ? ` by ${n.rejected_by_name}` : ''}
          {n.rejection_reason ? `: “${n.rejection_reason}”` : ''}
        </Text>
      )}
      {n.status === 'draft' &&
        (rejectOpen ? (
          <View style={{ gap: Spacing.two }}>
            <TextField label="Reason (optional)" value={reason} onChangeText={setReason} placeholder="e.g. Wrong product, damaged cartons" />
            <View style={styles.row}>
              <Button label="Keep it" variant="ghost" size="sm" onPress={() => setRejectOpen(false)} />
              <View style={{ flex: 1 }}>
                <Button label="Reject delivery" icon={X} variant="danger" size="sm" block loading={rejecting} onPress={() => onReject(reason.trim() || null)} />
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Button label="Confirm received" icon={Check} size="sm" block loading={confirming} onPress={onConfirm} />
            </View>
            <Button label="Reject" variant="ghost" size="sm" onPress={() => setRejectOpen(true)} />
          </View>
        ))}
      {error && (
        <Text variant="caption" tone="critical">
          {error}
        </Text>
      )}
      {n.status === 'draft' && n.source_facility && (
        <Text variant="caption" tone="muted">
          Rejecting puts the stock back on {n.source_facility.name}’s Stock Card.
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
