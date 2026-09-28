import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowDownToLine, ArrowUpFromLine, Clock3, PackageSearch } from 'lucide-react-native';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PageHeader } from '@/components/page-header';
import { ExpiryBadge, LevelBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, Loading, SectionHeader } from '@/components/ui/misc';
import { Text } from '@/components/ui/text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { INBOUND, formatDate, formatQty, transactionLabel } from '@/lib/format';
import { useOutbox } from '@/lib/offlineQueue';
import { useProductHistory, useReorderSuggestions, useStockBalances } from '@/lib/queries';
import { useFacilityId } from '@/lib/session';

/** One product's Stock Card: balance, batches, reorder figure and running-balance history. */
export default function ProductDetail() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const facilityId = useFacilityId();
  const productId = Number(useLocalSearchParams<{ id: string }>().id);
  const stock = useStockBalances(facilityId);
  const history = useProductHistory(facilityId, productId);
  const reorder = useReorderSuggestions(facilityId);
  const pending = useOutbox().filter((i) => i.body.product_id === productId);

  const s = stock.data?.find((x) => x.product.id === productId);
  const suggestion = reorder.data?.find((r) => r.product.id === productId);

  if (stock.isPending) return <Loading />;
  if (!s)
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <PageHeader back title="Product" />
        <EmptyState icon={PackageSearch} title="Not stocked here" body="This product has no Stock Card at your facility yet." />
      </View>
    );

  const p = s.product;
  const record = (type: 'issue' | 'receipt') => router.push({ pathname: '/record', params: { productId: String(p.id), type } });

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}>
        <PageHeader back eyebrow={`${p.sku} · ${p.category}`} title={p.name} />
        <View style={styles.body}>
          <LinearGradient colors={['#0a0f1c', '#1d4ed8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.balance}>
            <View style={styles.balanceTop}>
              <View>
                <Text variant="caption" style={{ color: '#b8c3d8' }}>
                  Usable stock
                </Text>
                <Text variant="display" tone="inverse" style={{ fontSize: 40, lineHeight: 46 }}>
                  {formatQty(s.usable_quantity)}
                </Text>
                <Text variant="caption" style={{ color: '#b8c3d8' }}>
                  {p.unit_of_measure} · {formatQty(s.quantity_on_hand)} on hand
                  {s.expired_quantity > 0 ? ` · ${formatQty(s.expired_quantity)} expired` : ''}
                </Text>
              </View>
              <LevelBadge level={s.level} />
            </View>
            <View style={styles.levels}>
              {[
                ['Min', p.min_stock_level],
                ['Reorder (EOP)', p.reorder_level],
                ['Max', p.max_stock_level],
              ].map(([label, value]) => (
                <View key={label} style={styles.levelCell}>
                  <Text variant="caption" style={{ color: '#9fb0cc' }}>
                    {label}
                  </Text>
                  <Text variant="label" tone="inverse">
                    {formatQty(Number(value))}
                  </Text>
                </View>
              ))}
            </View>
          </LinearGradient>

          {suggestion && (
            <Card style={styles.reorder}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="label">Quantity to order</Text>
                <Text variant="caption" tone="muted">
                  {suggestion.amc_quantity !== null
                    ? `Uses ${formatQty(suggestion.amc_quantity)}/month · ${suggestion.months_of_stock?.toFixed(1)} months left`
                    : 'No consumption history yet · based on max level'}
                </Text>
              </View>
              <View style={[styles.orderPill, { backgroundColor: suggestion.suggested_quantity > 0 ? c.primary : c.surface2 }]}>
                <Text variant="heading" style={{ color: suggestion.suggested_quantity > 0 ? '#ffffff' : c.muted }}>
                  {formatQty(suggestion.suggested_quantity)}
                </Text>
              </View>
            </Card>
          )}

          {p.requires_batch_tracking && (
            <View>
              <SectionHeader title="Batches" />
              <Card padded={false}>
                {s.batches.filter((b) => b.quantity_on_hand > 0).map((b, i) => (
                  <View key={b.batch_id} style={[styles.batchRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.border }]}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text variant="mono" weight="semibold" style={{ color: c.text }}>
                        {b.batch_no}
                      </Text>
                      <Text variant="caption" tone="muted">
                        Expires {formatDate(b.expiry_date)}
                      </Text>
                    </View>
                    <ExpiryBadge status={b.expiry_status} />
                    <Text variant="label" style={{ minWidth: 48, textAlign: 'right' }}>
                      {formatQty(b.quantity_on_hand)}
                    </Text>
                  </View>
                ))}
                {s.batches.every((b) => b.quantity_on_hand <= 0) && (
                  <Text variant="small" tone="muted" style={{ padding: Spacing.four }}>
                    No batches in stock.
                  </Text>
                )}
              </Card>
            </View>
          )}

          <View>
            <SectionHeader title="Stock card" />
            <Card padded={false}>
              {pending.map((i) => (
                <View key={i.id} style={[styles.txRow, { borderColor: c.border, backgroundColor: c.warningSoft }]}>
                  <Clock3 size={16} color={c.warning} />
                  <View style={{ flex: 1 }}>
                    <Text variant="label">{transactionLabel(i.body.transaction_type)}</Text>
                    <Text variant="caption" tone="warning">
                      {i.status === 'failed' ? 'Not accepted — see Account' : 'Waiting to sync'} · {formatDate(i.body.transaction_date)}
                    </Text>
                  </View>
                  <Text variant="label">{formatQty(i.body.quantity)}</Text>
                </View>
              ))}
              {history.data?.map((t, i) => {
                const inbound = INBOUND.includes(t.transaction_type);
                const sign = t.transaction_type === 'physical_count' ? '=' : inbound ? '+' : '−';
                return (
                  <View key={t.id} style={[styles.txRow, (i > 0 || pending.length > 0) && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.border }]}>
                    <View style={{ flex: 1, gap: 1 }}>
                      <Text variant="label">
                        {transactionLabel(t.transaction_type)}
                        <Text variant="caption" tone="muted">
                          {'  '}
                          {formatDate(t.transaction_date)}
                        </Text>
                      </Text>
                      <Text variant="caption" tone="muted" numberOfLines={1}>
                        {[t.counterparty, t.batch_no, t.voucher_no].filter(Boolean).join(' · ') || t.performed_by_name}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text variant="label" style={{ color: inbound ? c.primary : c.text }}>
                        {sign}
                        {formatQty(t.quantity)}
                      </Text>
                      <Text variant="caption" tone="muted">
                        bal {formatQty(t.running_balance)}
                      </Text>
                    </View>
                  </View>
                );
              })}
              {history.isPending && <Loading />}
            </Card>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.actions, { paddingBottom: insets.bottom + Spacing.three, backgroundColor: c.surface, borderColor: c.border }]}>
        <View style={styles.actionsInner}>
          <Button label="Receive" icon={ArrowDownToLine} variant="ghost" size="lg" style={{ flex: 1 }} onPress={() => record('receipt')} />
          <Button label="Issue" icon={ArrowUpFromLine} size="lg" style={{ flex: 1 }} onPress={() => record('issue')} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.five,
    gap: Spacing.five,
  },
  balance: {
    padding: Spacing.five,
    borderRadius: Radius.xl,
    gap: Spacing.five,
  },
  balanceTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  levels: {
    flexDirection: 'row',
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: Spacing.three,
  },
  levelCell: {
    flex: 1,
    gap: 2,
  },
  reorder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  orderPill: {
    minWidth: 64,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
    alignItems: 'center',
  },
  batchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three + 2,
  },
  actions: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: Spacing.three,
    paddingHorizontal: Spacing.five,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionsInner: {
    flexDirection: 'row',
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
});
