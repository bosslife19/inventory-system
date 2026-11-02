import type { UseQueryResult } from '@tanstack/react-query';
import { AlertOctagon, Building2, CalendarClock, ChevronRight, MapPinned, PackageX, Search, TrendingDown, Warehouse } from 'lucide-react-native';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { ActivityBars, FacilityStatusBar } from '@/components/charts';
import { PageHeader } from '@/components/page-header';
import { Badge, LevelBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { IconChip, SectionHeader } from '@/components/ui/misc';
import { KpiTile } from '@/components/ui/kpi-tile';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ZONE_LABEL, formatDate, formatQty } from '@/lib/format';
import type { AreaStockSummary, FacilityStockSummary, ProductRollup, RollupSummary, StockActivity } from '@/lib/types';

type Row = FacilityStockSummary | AreaStockSummary;

const CHILDREN_SHOWN = 15;
const PRODUCTS_SHOWN = 8;

interface Props {
  eyebrow: string;
  title: string;
  subtitle: string;
  back?: boolean;
  summary: RollupSummary;
  activity: UseQueryResult<StockActivity>;
  /** The node's own store, above the rollup figures (which count SDPs only). */
  store?: { name: string; onPress: () => void; hint: string } | null;
  /** Plural, e.g. "Facilities", "LGAs", "States". */
  childNoun: string;
  onOpen: (row: Row) => void;
  refreshing: boolean;
  onRefresh: () => void;
  /** Space under the content: the tab bar on the overview tab. */
  bottomInset: number;
}

/**
 * The rollup dashboard — tiles, facility status, activity, worst-first
 * drill-down and per-product totals — shared by the LGA, State and Federal
 * screens, like the web's RollupDashboard. Only the children differ by level.
 */
export function RollupView({ eyebrow, title, subtitle, back, summary: s, activity, store, childNoun, onOpen, refreshing, onRefresh, bottomInset }: Props) {
  const c = useTheme();
  const [query, setQuery] = useState('');
  const [allChildren, setAllChildren] = useState(false);
  const [allProducts, setAllProducts] = useState(false);
  const areas = childNoun !== 'Facilities';
  const counts = s.facility_counts;
  const share = (n: number) => (s.facility_count ? `${Math.round((n / s.facility_count) * 100)}% of facilities` : undefined);

  const q = query.trim().toLowerCase();
  const children = (q ? (s.children as Row[]).filter((r) => r.name.toLowerCase().includes(q)) : (s.children as Row[]));
  const shownChildren = allChildren || q ? children : children.slice(0, CHILDREN_SHOWN);
  const shownProducts = allProducts ? s.products : s.products.slice(0, PRODUCTS_SHOWN);

  return (
    <ScrollView
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={{ paddingBottom: bottomInset }}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}>
      <PageHeader back={back} eyebrow={eyebrow} title={title} subtitle={subtitle} />
      <View style={styles.body}>
        <View style={styles.kpis}>
          <View style={styles.kpiRow}>
            {areas ? (
              <KpiTile tone="primary" icon={MapPinned} label={childNoun} value={s.child_count} sub={`${formatQty(s.facility_count)} facilities beneath`} />
            ) : (
              <KpiTile tone="primary" icon={Building2} label="Facilities" value={s.child_count} sub="Reporting here" />
            )}
            <KpiTile tone={counts.stock_out ? 'critical' : 'default'} icon={PackageX} label="With a stock-out" value={counts.stock_out} sub={share(counts.stock_out)} />
          </View>
          <View style={styles.kpiRow}>
            <KpiTile tone={counts.low_stock ? 'warning' : 'default'} icon={TrendingDown} label="At EOP" value={counts.low_stock} sub={share(counts.low_stock)} />
            <KpiTile tone="ink" icon={AlertOctagon} label="Holding expired stock" value={counts.expired} sub={share(counts.expired)} />
          </View>
          <View style={styles.kpiRow}>
            <KpiTile icon={CalendarClock} label="With stock expiring soon" value={counts.expiring_soon} sub={share(counts.expiring_soon)} />
          </View>
        </View>

        {store && (
          <Card onPress={store.onPress} style={styles.row}>
            <IconChip icon={Warehouse} tone="ink" size={40} />
            <View style={{ flex: 1 }}>
              <Text variant="label">{store.name}</Text>
              <Text variant="caption" tone="muted">
                {store.hint}
              </Text>
            </View>
            <ChevronRight size={18} color={c.muted} />
          </Card>
        )}

        <Card>
          <SectionHeader title="Facility status" />
          <Text variant="caption" tone="muted" style={styles.cardSub}>
            Each facility counted once, by its most serious issue
          </Text>
          <FacilityStatusBar status={s.facility_status} />
        </Card>

        {activity.data && (
          <Card>
            <SectionHeader title="Recording activity" />
            <Text variant="caption" tone="muted" style={styles.cardSub}>
              Stock Card entries per week across all facilities
              {activity.data.last_transaction_date && ` · last ${formatDate(activity.data.last_transaction_date)}`}
            </Text>
            <ActivityBars weeks={activity.data.weeks} />
          </Card>
        )}

        <View style={{ gap: Spacing.three }}>
          <SectionHeader title={`${childNoun}, worst first`} />
          {s.children.length > 6 && (
            <TextField icon={Search} placeholder={`Search ${childNoun.toLowerCase()}…`} value={query} onChangeText={setQuery} autoCorrect={false} />
          )}
          {shownChildren.map((row) => (
            <ChildCard key={row.id} row={row} onPress={() => onOpen(row)} />
          ))}
          {children.length === 0 && (
            <Text variant="small" tone="muted">
              No {childNoun.toLowerCase()} {q ? 'match' : 'yet'}.
            </Text>
          )}
          {!q && !allChildren && children.length > CHILDREN_SHOWN && (
            <Button label={`Show all ${children.length}`} variant="ghost" onPress={() => setAllChildren(true)} />
          )}
        </View>

        <Card>
          <SectionHeader title={`Products across ${title}`} />
          <Text variant="caption" tone="muted" style={styles.cardSub}>
            Consolidated usable stock and how many facilities are short
          </Text>
          <View style={{ gap: Spacing.four }}>
            {shownProducts.map((p) => (
              <ProductRow key={p.product.id} p={p} />
            ))}
            {s.products.length === 0 && (
              <Text variant="small" tone="muted">
                No stock recorded yet.
              </Text>
            )}
          </View>
          {!allProducts && s.products.length > PRODUCTS_SHOWN && (
            <Button label={`Show all ${s.products.length} products`} variant="ghost" size="sm" onPress={() => setAllProducts(true)} style={{ marginTop: Spacing.three }} />
          )}
        </Card>
      </View>
    </ScrollView>
  );
}

/** One child of the node: a facility (counts are products) or an LGA / state (counts are facilities). */
function ChildCard({ row, onPress }: { row: Row; onPress: () => void }) {
  const c = useTheme();
  const f = row.flag_counts;
  const critical = f.stock_out > 0;

  return (
    <Card onPress={onPress} style={[{ gap: Spacing.two }, critical && { borderColor: c.statusCritical }]} accessibilityLabel={`Open ${row.name}`}>
      <View style={styles.row}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="label">{row.name}</Text>
          <Text variant="caption" tone="muted">
            {row.level === 'facility'
              ? `${row.type.replace('_', ' ')} · ${row.product_count} products${row.is_active ? '' : ' · closed'}`
              : [
                  row.geopolitical_zone && (ZONE_LABEL[row.geopolitical_zone] ?? row.geopolitical_zone),
                  `${row.facility_count} ${row.facility_count === 1 ? 'facility' : 'facilities'}`,
                  row.facility_count > 0 && `${row.reporting_facility_count} reporting`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
          </Text>
        </View>
        <ChevronRight size={18} color={c.muted} />
      </View>

      <View style={styles.badges}>
        {f.stock_out > 0 && <Badge label={`${f.stock_out} stock-out${f.stock_out === 1 ? '' : 's'}`} tone="critical" />}
        {f.expired > 0 && <Badge label={`${f.expired} expired`} tone="ink" dot={false} />}
        {f.low_stock > 0 && <Badge label={`${f.low_stock} at EOP`} tone="warning" />}
        {f.expiring_soon > 0 && <Badge label={`${f.expiring_soon} expiring`} tone="notice" />}
        {row.needs_reorder_count > 0 && <Badge label={`${row.needs_reorder_count} need reorder`} tone="neutral" />}
        {f.stock_out + f.expired + f.low_stock + f.expiring_soon + row.needs_reorder_count === 0 &&
          (row.level === 'facility' ? row.product_count > 0 : row.reporting_facility_count > 0) && <Badge label="All OK" tone="ok" />}
      </View>

      {row.level === 'facility'
        ? row.flagged_products.slice(0, 3).map((p) => (
            <View key={p.product.id} style={styles.flagRow}>
              <Text variant="caption" tone="secondary" numberOfLines={1} style={{ flex: 1 }}>
                {p.product.name} · {formatQty(p.usable_quantity)} usable
              </Text>
              <LevelBadge level={p.level} />
            </View>
          ))
        : row.stock_out_products.map((p) => (
            <Text key={p.product.id} variant="caption" tone="secondary" numberOfLines={1}>
              {p.product.name} — out at {p.facility_count} {p.facility_count === 1 ? 'facility' : 'facilities'}
            </Text>
          ))}

      <Text variant="caption" tone="muted">
        {(row.level === 'facility' ? row.product_count > 0 : row.reporting_facility_count > 0) || row.last_transaction_date
          ? `Last entry ${row.last_transaction_date ? formatDate(row.last_transaction_date) : 'never'}`
          : 'Nothing recorded yet'}
      </Text>
    </Card>
  );
}

function ProductRow({ p }: { p: ProductRollup }) {
  const fc = p.facility_counts;
  return (
    <View style={{ gap: 4 }}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text variant="label" numberOfLines={1}>
            {p.product.name}
          </Text>
          <Text variant="caption" tone="muted">
            {p.product.sku} · {p.product.unit_of_measure}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text variant="label">{formatQty(p.usable_quantity)}</Text>
          <Text variant="caption" tone="muted">
            usable
          </Text>
        </View>
      </View>
      <View style={styles.badges}>
        {fc.stock_out > 0 && <Badge label={`out at ${fc.stock_out}`} tone="critical" />}
        {fc.low_stock > 0 && <Badge label={`EOP at ${fc.low_stock}`} tone="warning" />}
        {p.facilities_needing_reorder > 0 && <Badge label={`${p.facilities_needing_reorder} need reorder`} tone="neutral" />}
        {p.expired_quantity > 0 && <Badge label={`${formatQty(p.expired_quantity)} expired`} tone="ink" dot={false} />}
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
    gap: Spacing.six,
  },
  kpis: {
    gap: Spacing.three,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  cardSub: {
    marginTop: -Spacing.two,
    marginBottom: Spacing.three,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  flagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
