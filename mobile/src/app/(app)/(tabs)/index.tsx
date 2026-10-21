import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import {
  AlertOctagon,
  ArrowDownToLine,
  ArrowUpFromLine,
  BellRing,
  ClipboardList,
  Clock3,
  FileText,
  Gauge,
  Inbox,
  MapPin,
  Package,
  PackageX,
  Plus,
  ScanLine,
  ShoppingCart,
  TrendingDown,
  TriangleAlert,
  Truck,
} from 'lucide-react-native';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { AlertCard } from '@/components/alert-card';
import { ActivityBars, LevelBar } from '@/components/charts';
import { Hero } from '@/components/hero';
import { SyncPill } from '@/components/sync-pill';
import { Card } from '@/components/ui/card';
import { KpiTile } from '@/components/ui/kpi-tile';
import { IconChip, SectionHeader } from '@/components/ui/misc';
import { Text } from '@/components/ui/text';
import { MaxContentWidth, Radius, Spacing, TabBarInset } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { INBOUND, formatDate, formatQty, greeting, initials, transactionFigure, transactionLabel } from '@/lib/format';
import { describe, useOutbox } from '@/lib/offlineQueue';
import {
  useActivity,
  useAlerts,
  useDeliveryNotes,
  useFacility,
  useIncomingRequests,
  useNotifications,
  useRecentTransactions,
  useReorderSuggestions,
  useStockBalances,
} from '@/lib/queries';
import { useFacilityId, useIsStoreOfficer, useUser } from '@/lib/session';
import { requestSync } from '@/lib/sync';
import type { StockLevel } from '@/lib/types';
import { BrandStrip } from '@/components/brand';
import { usePaidAction } from '@/lib/plan';

export default function Home() {
  const c = useTheme();
  const user = useUser();
  const facilityId = useFacilityId();
  const queryClient = useQueryClient();
  const facility = useFacility(facilityId);
  const stock = useStockBalances(facilityId);
  const alerts = useAlerts(undefined, facilityId);
  const activity = useActivity(facilityId);
  const reorder = useReorderSuggestions(facilityId);
  const recent = useRecentTransactions(facilityId);
  const isStore = useIsStoreOfficer();
  const incoming = useIncomingRequests(facilityId, isStore);
  const toConfirm = useDeliveryNotes(facilityId, 'draft').data?.meta.pagination.total ?? 0;
  const unread = useNotifications().data?.meta.unread_count ?? 0;
  const outbox = useOutbox();
  const [refreshing, setRefreshing] = useState(false);
  const scanning = usePaidAction('delivery_scanning');
  const supplyChain = usePaidAction('supply_chain');
  const plan = user.organization;

  const rows = stock.data ?? [];
  const count = (level: StockLevel) => rows.filter((r) => r.level === level).length;
  const levels = { stock_out: count('stock_out'), low_stock: count('low_stock'), reorder: count('reorder'), ok: count('ok') };
  const expired = rows.filter((r) => r.flags.includes('expired')).length;
  const toOrder = (reorder.data ?? []).filter((r) => r.suggested_quantity > 0);
  const failed = outbox.filter((i) => i.status === 'failed').length;
  const toAnswer = (incoming.data?.data ?? []).filter((r) => r.status === 'pending').length;
  const isNational = facility.data?.store_level === 'national';

  async function refresh() {
    setRefreshing(true);
    requestSync();
    await queryClient.invalidateQueries();
    setRefreshing(false);
  }

  return (
    <ScrollView
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={{ paddingBottom: TabBarInset + Spacing.four }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#ffffff" />}>
      <Hero extraBottom={48}>
        <BrandStrip organization={user.organization} />
        <View style={styles.heroTop}>
          <View style={{ flex: 1 }}>
            <Text variant="small" style={{ color: '#b8c3d8' }}>
              {greeting()}, {user.name.split(' ')[0]}
            </Text>
            <Text variant="title" tone="inverse" numberOfLines={2} style={{ marginTop: 2 }}>
              {facility.data?.name ?? user.node.path.at(-1) ?? 'Your facility'}
            </Text>
            {facility.data && (
              <View style={styles.location}>
                <MapPin size={13} color="#9fb0cc" />
                <Text variant="caption" style={{ color: '#9fb0cc' }}>
                  {[facility.data.lga?.name, facility.data.state?.name].filter(Boolean).join(', ') || 'Nigeria'}
                </Text>
              </View>
            )}
          </View>
          <View style={[styles.avatar, { borderColor: 'rgba(255,255,255,0.3)' }]}>
            <Text variant="label" tone="inverse">
              {initials(user.name)}
            </Text>
          </View>
        </View>
        <View style={{ marginTop: Spacing.four }}>
          <SyncPill />
        </View>
      </Hero>

      <View style={styles.body}>
        <View style={[styles.kpis, { marginTop: -56 }]}>
          <View style={styles.kpiRow}>
            <KpiTile tone="primary" icon={Package} label="Products tracked" value={rows.length} sub={`${levels.ok} at a healthy level`} />
            <KpiTile tone={levels.stock_out ? 'critical' : 'default'} icon={PackageX} label="Stock-outs" value={levels.stock_out} sub={levels.stock_out ? 'No usable stock' : 'None — good'} />
          </View>
          <View style={styles.kpiRow}>
            <KpiTile tone={levels.low_stock ? 'warning' : 'default'} icon={TrendingDown} label="At EOP" value={levels.low_stock} sub="Order urgently" />
            <KpiTile tone="ink" icon={AlertOctagon} label="Expired stock" value={expired} sub="Products affected" />
          </View>
        </View>

        <View style={styles.actions}>
          <Card onPress={scanning(() => router.push('/deliveries/scan'))} style={styles.action}>
            <IconChip icon={ScanLine} tone="ink" size={42} />
            <View style={{ flex: 1 }}>
              <Text variant="label">Scan delivery</Text>
              <Text variant="caption" tone="muted">
                Photo → receipts
              </Text>
            </View>
          </Card>
          <Card onPress={() => router.push('/record')} style={styles.action}>
            <IconChip icon={Plus} size={42} />
            <View style={{ flex: 1 }}>
              <Text variant="label">New entry</Text>
              <Text variant="caption" tone="muted">
                Issue, loss, count…
              </Text>
            </View>
          </Card>
        </View>

        {isStore && (
          <>
            <Card onPress={() => router.push('/incoming')} style={[styles.banner, toAnswer > 0 && { borderColor: c.warning }]}>
              <IconChip icon={Inbox} tone={toAnswer > 0 ? 'warning' : 'primary'} size={38} />
              <View style={{ flex: 1 }}>
                <Text variant="label">Incoming requests</Text>
                <Text variant="caption" tone={toAnswer > 0 ? 'warning' : 'muted'}>
                  {toAnswer > 0 ? `${toAnswer} waiting for your answer` : 'Requests from the facilities you supply'}
                </Text>
              </View>
            </Card>
            <Card onPress={supplyChain(() => router.push('/dispatch'))} style={styles.banner}>
              <IconChip icon={Truck} tone="ink" size={38} />
              <View style={{ flex: 1 }}>
                <Text variant="label">Dispatch stock</Text>
                <Text variant="caption" tone="muted">
                  Send stock to a facility below — they confirm it on arrival
                </Text>
              </View>
            </Card>
          </>
        )}

        {plan?.renewal_due && plan.days_left !== null && (
          <Card style={[styles.banner, { backgroundColor: c.warningSoft, borderColor: c.warningSoft }]}>
            <IconChip icon={Clock3} tone="warning" size={38} />
            <View style={{ flex: 1 }}>
              <Text variant="label">Paid plan ends {plan.days_left === 1 ? 'today' : `in ${plan.days_left} days`}</Text>
              <Text variant="caption" tone="muted">
                Scanning, dispatches, reorder requests and push pause after that — your Stock Card keeps working.
              </Text>
            </View>
          </Card>
        )}

        <Card onPress={() => router.push('/delivery-notes')} style={[styles.banner, toConfirm > 0 && { borderColor: c.warning }]}>
          <IconChip icon={Truck} tone={toConfirm > 0 ? 'warning' : 'primary'} size={38} />
          <View style={{ flex: 1 }}>
            <Text variant="label">Delivery notes</Text>
            <Text variant="caption" tone={toConfirm > 0 ? 'warning' : 'muted'}>
              {toConfirm > 0 ? `${toConfirm} deliver${toConfirm === 1 ? 'y' : 'ies'} to confirm` : 'Deliveries to you, and ones you’ve signed for'}
            </Text>
          </View>
        </Card>

        {!isNational && (
          <Card onPress={() => router.push('/requests')} style={styles.banner}>
            <IconChip icon={ShoppingCart} size={38} />
            <View style={{ flex: 1 }}>
              <Text variant="label">Reorder requests</Text>
              <Text variant="caption" tone="muted">
                {toOrder.length > 0
                  ? `${toOrder.length} product${toOrder.length === 1 ? '' : 's'} to order — ask ${isStore ? 'a store above' : 'your LGA store'}`
                  : 'Ask a store above for stock, and follow your requests'}
              </Text>
            </View>
          </Card>
        )}

        <View style={styles.actions}>
          <Card onPress={() => router.push('/reports')} style={styles.action}>
            <IconChip icon={FileText} size={38} />
            <View style={{ flex: 1 }}>
              <Text variant="label">Reports</Text>
              <Text variant="caption" tone="muted">
                Status, movement…
              </Text>
            </View>
          </Card>
          {isStore && (
            <Card onPress={() => router.push('/notifications')} style={styles.action}>
              <IconChip icon={BellRing} tone={unread > 0 ? 'warning' : 'primary'} size={38} />
              <View style={{ flex: 1 }}>
                <Text variant="label">Notifications</Text>
                <Text variant="caption" tone={unread > 0 ? 'warning' : 'muted'}>
                  {unread > 0 ? `${unread} unread` : 'Digests, alerts'}
                </Text>
              </View>
            </Card>
          )}
        </View>

        <Card onPress={() => router.push('/amc')} style={styles.banner}>
          <IconChip icon={Gauge} tone="ink" size={38} />
          <View style={{ flex: 1 }}>
            <Text variant="label">Starting AMCs</Text>
            <Text variant="caption" tone="muted">
              New here? Enter each product’s monthly use so reorder suggestions work from day one
            </Text>
          </View>
        </Card>

        {failed > 0 && (
          <Card onPress={() => router.push('/account')} style={[styles.banner, { backgroundColor: c.warningSoft, borderColor: c.warningSoft }]}>
            <IconChip icon={TriangleAlert} tone="warning" size={38} />
            <View style={{ flex: 1 }}>
              <Text variant="label" tone="warning">
                {failed} {failed === 1 ? 'entry was' : 'entries were'} not accepted
              </Text>
              <Text variant="caption" tone="secondary">
                Tap to review and retry or discard
              </Text>
            </View>
          </Card>
        )}

        <View>
          <SectionHeader title="Needs attention" action={alerts.data?.data.length ? 'See all' : undefined} onAction={() => router.push('/alerts')} />
          {alerts.data && alerts.data.data.length === 0 ? (
            <Card style={styles.allClear}>
              <Text variant="label" tone="ok">
                All clear
              </Text>
              <Text variant="caption" tone="muted">
                No stock alerts at your facility right now.
              </Text>
            </Card>
          ) : (
            <View style={{ gap: Spacing.three }}>
              {alerts.data?.data.slice(0, 3).map((a) => <AlertCard key={a.id} alert={a} compact />)}
            </View>
          )}
        </View>

        <Card>
          <SectionHeader title="Stock status" action="View stock" onAction={() => router.push('/stock')} />
          <LevelBar counts={levels} />
        </Card>

        {activity.data && (
          <Card>
            <SectionHeader title="Recording activity" />
            <Text variant="caption" tone="muted" style={{ marginTop: -Spacing.two, marginBottom: Spacing.three }}>
              Stock Card entries per week
              {activity.data.last_transaction_date && ` · last ${formatDate(activity.data.last_transaction_date)}`}
            </Text>
            <ActivityBars weeks={activity.data.weeks} />
          </Card>
        )}

        {toOrder.length > 0 && (
          <Card>
            <SectionHeader title="To order" />
            <View style={{ gap: Spacing.three }}>
              {toOrder.slice(0, 4).map((r) => (
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

        <Card>
          <SectionHeader title="Recent entries" />
          <View style={{ gap: Spacing.three }}>
            {outbox.map((i) => (
              <View key={i.id} style={styles.listRow}>
                <IconChip icon={Clock3} tone="warning" size={36} />
                <View style={{ flex: 1 }}>
                  <Text variant="label" numberOfLines={1}>
                    {describe(i).title}
                  </Text>
                  <Text variant="caption" tone={i.status === 'failed' ? 'critical' : 'warning'}>
                    {i.status === 'failed' ? 'Not accepted — see Account' : 'Waiting to sync'}
                  </Text>
                </View>
                <Text variant="label">{describe(i).figure}</Text>
              </View>
            ))}
            {recent.data?.map((t) => {
              const inbound = INBOUND.includes(t.transaction_type);
              const isCount = t.transaction_type === 'physical_count';
              return (
                <View key={t.id} style={[styles.listRow, isCount && { backgroundColor: c.criticalSoft, borderRadius: Radius.md, padding: Spacing.two }]}>
                  <IconChip icon={t.transaction_type === 'physical_count' ? ClipboardList : inbound ? ArrowDownToLine : ArrowUpFromLine} tone={inbound ? 'primary' : 'ink'} size={36} />
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
                    {isCount && (
                      <Text variant="caption" tone="critical">
                        physical count: {formatQty(t.quantity)}
                      </Text>
                    )}
                    <Text variant="caption" tone="muted">
                      bal {formatQty(t.running_balance)}
                    </Text>
                  </View>
                </View>
              );
            })}
            {!recent.data?.length && !outbox.length && (
              <Text variant="small" tone="muted">
                Nothing recorded yet. Tap + to add your first entry.
              </Text>
            )}
          </View>
        </Card>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  heroTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  location: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  actions: {
    flexDirection: 'row',
    gap: Spacing.three,
    marginTop: -Spacing.two,
  },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  allClear: {
    gap: 2,
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
