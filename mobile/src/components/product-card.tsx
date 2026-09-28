import { ChevronRight, Clock3, Snowflake } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatQty } from '@/lib/format';
import type { ProductStock } from '@/lib/types';

import { Badge, ExpiryBadge, LevelBadge } from './ui/badge';
import { Card } from './ui/card';
import { Meter } from './ui/misc';
import { Text } from './ui/text';

const METER_TONE = { stock_out: 'critical', low_stock: 'warning', reorder: 'primary', ok: 'ok' } as const;

/** One product's current stock, straight from the API (never adjusted locally). */
export function ProductCard({ stock, pending, onPress }: { stock: ProductStock; pending: number; onPress: () => void }) {
  const c = useTheme();
  const p = stock.product;
  const pct = p.max_stock_level > 0 ? (stock.usable_quantity / p.max_stock_level) * 100 : 0;
  const expiry = stock.flags.includes('expired') ? 'expired' : stock.flags.includes('expiring_soon') ? 'expiring_soon' : null;

  return (
    <Card onPress={onPress} style={styles.card} accessibilityLabel={`${p.name}, ${formatQty(stock.usable_quantity)} ${p.unit_of_measure} usable`}>
      <View style={styles.row}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="label" numberOfLines={2}>
            {p.name}
          </Text>
          <View style={styles.meta}>
            <Text variant="caption" tone="muted">
              {p.sku} · {p.unit_of_measure}
            </Text>
            {p.requires_cold_chain && <Snowflake size={12} color={c.chart1} />}
          </View>
        </View>
        <View style={styles.qty}>
          <Text variant="title" style={{ color: stock.level === 'stock_out' ? c.critical : c.text }}>
            {formatQty(stock.usable_quantity)}
          </Text>
          <Text variant="caption" tone="muted">
            usable
          </Text>
        </View>
        <ChevronRight size={18} color={c.muted} />
      </View>

      <View style={styles.meterRow}>
        <View style={{ flex: 1 }}>
          <Meter value={pct} tone={METER_TONE[stock.level]} />
        </View>
        <Text variant="caption" tone="muted" style={styles.pct}>
          {p.max_stock_level > 0 ? `${Math.round(pct)}% of max` : '—'}
        </Text>
      </View>

      <View style={styles.badges}>
        <LevelBadge level={stock.level} />
        <ExpiryBadge status={expiry} />
        {stock.expired_quantity > 0 && <Badge label={`${formatQty(stock.expired_quantity)} expired`} tone="critical" dot={false} />}
        {pending > 0 && (
          <View style={[styles.pending, { backgroundColor: c.warningSoft }]}>
            <Clock3 size={12} color={c.warning} />
            <Text variant="caption" weight="semibold" tone="warning">
              {pending} pending
            </Text>
          </View>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  qty: {
    alignItems: 'flex-end',
  },
  meterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  pct: {
    minWidth: 76,
    textAlign: 'right',
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  pending: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
  },
});
