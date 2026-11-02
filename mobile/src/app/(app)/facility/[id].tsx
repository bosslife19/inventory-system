import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { AlertOctagon, ArrowDownToLine, ArrowUpFromLine, ClipboardList, CloudOff, Package, PackageX, Search, ShoppingCart, TrendingDown } from 'lucide-react-native';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AlertCard } from '@/components/alert-card';
import { ActivityBars, LevelBar } from '@/components/charts';
import { PageHeader } from '@/components/page-header';
import { ProductCard } from '@/components/product-card';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { KpiTile } from '@/components/ui/kpi-tile';
import { EmptyState, IconChip, Loading, SectionHeader } from '@/components/ui/misc';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { isNetworkError } from '@/lib/api';
import { INBOUND, formatDate, formatQty, transactionFigure, transactionLabel } from '@/lib/format';
import { useActivity, useAlerts, useFacility, useRecentTransactions, useReorderSuggestions, useStockBalances } from '@/lib/queries';
import type { StockLevel } from '@/lib/types';

const PRODUCTS_SHOWN = 10;
const STORE_LABEL = { lga: 'LGA store', state: 'State store', national: 'National store' } as const;

/**
 * A facility or store opened from an area dashboard: its stock, alerts,
 * activity and recent Stock Card entries — the web FacilityPage, read-only.
 * The API decides whether the signed-in user may see it.
 */
export default function FacilityScreen() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  const facility = useFacility(id);
  const stock = useStockBalances(id);
  const alerts = useAlerts(undefined, id);
  const activity = useActivity(id);
  const reorder = useReorderSuggestions(id);
  const recent = useRecentTransactions(id);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [allProducts, setAllProducts] = useState(false);

  const f = facility.data;
  const rows = stock.data ?? [];
  const count = (level: StockLevel) => rows.filter((r) => r.level === level).length;
  const levels = { stock_out: count('stock_out'), low_stock: count('low_stock'), reorder: count('reorder'), ok: count('ok') };
  const expired = rows.filter((r) => r.flags.includes('expired')).length;
  const toOrder = (reorder.data ?? []).filter((r) => r.suggested_quantity > 0);
  const q = query.trim().toLowerCase();
  // Worst first, as on the dashboards.
  const order: StockLevel[] = ['stock_out', 'low_stock', 'reorder', 'ok'];
  const products = rows
    .filter((s) => !q || s.product.name.toLowerCase().includes(q) || s.product.sku.toLowerCase().includes(q))
    .sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level));
  const shown = allProducts || q ? products : products.slice(0, PRODUCTS_SHOWN);

  async function refresh() {
    setRefreshing(true);
    await Promise.all(
      [['facility', id], ['stock-balances', id], ['alerts'], ['stock-activity', id], ['reorder-suggestions', id], ['stock-transactions', id]].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );
    setRefreshing(false);
  }

  if (!f) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <PageHeader back title="Facility" />
        {facility.isPending ? (
          <Loading />
        ) : isNetworkError(facility.error) ? (
          <EmptyState icon={CloudOff} title="You're offline" body="This facility loads when you're back online." />
        ) : (
          <EmptyState icon={PackageX} title="Can't open this facility" body={facility.error?.message} />
        )}
      </View>
    );
  }

  const where = [f.lga && `${f.lga.name} LGA`, f.state && `${f.state.name} State`].filter(Boolean).join(' · ') || 'Nigeria';

  return (
    <ScrollView
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.eight }}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={c.primary} />}>
      <PageHeader
        back
        eyebrow={f.store_level ? STORE_LABEL[f.store_level] : f.type.replace('_', ' ')}
        title={f.name}
        subtitle={`${where}${f.is_active ? '' : ' · closed'}`}
      />
      <View style={styles.body}>
        <View style={styles.kpis}>
          <View style={styles.kpiRow}>
            <KpiTile tone="primary" icon={Package} label="Products tracked" value={rows.length} sub={`${levels.ok} at a healthy level`} />
            <KpiTile tone={levels.stock_out ? 'critical' : 'default'} icon={PackageX} label="Stock-outs" value={levels.stock_out} sub={levels.stock_out ? 'No usable stock' : 'None'} />
          </View>
          <View style={styles.kpiRow}>
            <KpiTile tone={levels.low_stock ? 'warning' : 'default'} icon={TrendingDown} label="At EOP" value={levels.low_stock} sub="Order urgently" />
            <KpiTile tone="ink" icon={AlertOctagon} label="Expired stock" value={expired} sub="Products affected" />
          </View>
        </View>

        <View>
          <SectionHeader title="Needs attention" />
          {alerts.data && alerts.data.data.length === 0 ? (
            <Card style={{ gap: 2 }}>
              <Text variant="label" tone="ok">
                All clear
              </Text>
              <Text variant="caption" tone="muted">
                No stock alerts here right now.
              </Text>
            </Card>
          ) : (
            <View style={{ gap: Spacing.three }}>
              {alerts.data?.data.slice(0, 5).map((a) => <AlertCard key={a.id} alert={a} />)}
              {(alerts.data?.meta.pagination.total ?? 0) > 5 && (
                <Text variant="caption" tone="muted">
                  +{(alerts.data?.meta.pagination.total ?? 0) - 5} more on the Alerts tab
                </Text>
              )}
            </View>
          )}
        </View>

        <Card>
          <SectionHeader title="Stock status" />
          <LevelBar counts={levels} />
        </Card>

        {activity.data && (
          <Card>
            <SectionHeader title="Recording activity" />
            <Text variant="caption" tone="muted" style={styles.cardSub}>
              Stock Card entries per week
              {activity.data.last_transaction_date ? ` · last ${formatDate(activity.data.last_transaction_date)}` : ' · nothing recorded yet'}
            </Text>
            <ActivityBars weeks={activity.data.weeks} />
          </Card>
        )}

        {toOrder.length > 0 && (
          <Card>
            <SectionHeader title="To order" />
            <View style={{ gap: Spacing.three }}>
              {toOrder.slice(0, 5).map((r) => (
                <View key={r.product.id} style={styles.listRow}>
                  <IconChip icon={ShoppingCart} size={36} />
                  <View style={{ flex: 1 }}>
                    <Text variant="label" numberOfLines={1}>
                      {r.product.name}
                    </Text>
                    <Text variant="caption" tone="muted">
                      {formatQty(r.usable_quantity)} usable
                      {r.months_of_stock !== null && ` · ${r.months_of_stock.toFixed(1)} months left`}
                    </Text>
                  </View>
                  <View style={[styles.orderQty, { backgroundColor: c.primarySoft }]}>
                    <Text variant="label" tone="primary">
                      {formatQty(r.suggested_quantity)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </Card>
        )}

        <View style={{ gap: Spacing.three }}>
          <SectionHeader title="Stock" />
          {rows.length > 6 && <TextField icon={Search} placeholder="Search products…" value={query} onChangeText={setQuery} autoCorrect={false} />}
          {shown.map((s) => (
            <ProductCard
              key={s.product.id}
              stock={s}
              pending={0}
              onPress={() => router.push({ pathname: '/product/[id]', params: { id: String(s.product.id), facility: String(id) } })}
            />
          ))}
          {stock.isPending && <Loading />}
          {stock.data && products.length === 0 && (
            <Text variant="small" tone="muted">
              {rows.length ? 'No products match.' : 'Nothing on the Stock Card yet.'}
            </Text>
          )}
          {!q && !allProducts && products.length > PRODUCTS_SHOWN && (
            <Button label={`Show all ${products.length} products`} variant="ghost" onPress={() => setAllProducts(true)} />
          )}
        </View>

        <Card>
          <SectionHeader title="Recent entries" />
          <View style={{ gap: Spacing.three }}>
            {recent.data?.map((t) => {
              const inbound = INBOUND.includes(t.transaction_type);
              const isCount = t.transaction_type === 'physical_count';
              return (
                <View key={t.id} style={[styles.listRow, isCount && { backgroundColor: c.criticalSoft, borderRadius: Radius.md, padding: Spacing.two }]}>
                  <IconChip icon={isCount ? ClipboardList : inbound ? ArrowDownToLine : ArrowUpFromLine} tone={inbound ? 'primary' : 'ink'} size={36} />
                  <View style={{ flex: 1 }}>
                    <Text variant="label" numberOfLines={1} tone={isCount ? 'critical' : 'default'}>
                      {transactionLabel(t.transaction_type)} · {t.product_name}
                    </Text>
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                      {formatDate(t.transaction_date)}
                      {t.counterparty ? ` · ${t.counterparty}` : ''}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text variant="label">{transactionFigure(t)}</Text>
                    <Text variant="caption" tone="muted">
                      bal {formatQty(t.running_balance)}
                    </Text>
                  </View>
                </View>
              );
            })}
            {recent.data?.length === 0 && (
              <Text variant="small" tone="muted">
                Nothing recorded yet.
              </Text>
            )}
          </View>
        </Card>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.five,
    gap: Spacing.six,
  },
  kpis: {
    gap: Spacing.three,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  cardSub: {
    marginTop: -Spacing.two,
    marginBottom: Spacing.three,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  orderQty: {
    paddingHorizontal: Spacing.three,
    paddingVertical: 5,
    borderRadius: 999,
    minWidth: 52,
    alignItems: 'center',
  },
});
