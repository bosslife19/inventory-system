import { StyleSheet, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { LEVEL_LABEL, formatShortDate } from '@/lib/format';
import type { ActivityWeek, StockLevel } from '@/lib/types';

import { Text } from './ui/text';

const LEVELS: StockLevel[] = ['stock_out', 'low_stock', 'reorder', 'ok'];

/**
 * Products by stock status as one stacked bar with a labelled legend — the
 * web donut's data in a phone-friendly form. Status colours carry labels.
 */
export function LevelBar({ counts }: { counts: Record<StockLevel, number> }) {
  const c = useTheme();
  const color: Record<StockLevel, string> = { stock_out: c.statusCritical, low_stock: c.statusWarning, reorder: c.statusNotice, ok: c.statusOk };
  const total = LEVELS.reduce((n, l) => n + counts[l], 0);

  return (
    <View style={{ gap: Spacing.three }}>
      <View style={[styles.stack, { backgroundColor: c.surface2 }]}>
        {LEVELS.filter((l) => counts[l] > 0).map((l) => (
          <View key={l} style={{ flex: counts[l], backgroundColor: color[l] }} />
        ))}
      </View>
      <View style={styles.legend}>
        {LEVELS.map((l) => (
          <View key={l} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: color[l] }]} />
            <Text variant="caption" tone="secondary" style={{ flex: 1 }}>
              {LEVEL_LABEL[l]}
            </Text>
            <Text variant="caption" weight="bold">
              {counts[l]}
            </Text>
            <Text variant="caption" tone="muted" style={{ width: 34, textAlign: 'right' }}>
              {total ? Math.round((counts[l] / total) * 100) : 0}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Stock Card entries per week, stacked received / issued / other — the web
 * ActivityChart's series and colours, drawn with plain views.
 */
export function ActivityBars({ weeks }: { weeks: ActivityWeek[] }) {
  const c = useTheme();
  const series = [
    { key: 'received', label: 'Received', color: c.chart1 },
    { key: 'issued', label: 'Issued', color: c.chart2 },
    { key: 'other', label: 'Other', color: c.chart3 },
  ] as const;
  const max = Math.max(1, ...weeks.map((w) => w.received + w.issued + w.other));
  const shown = weeks.slice(-8);

  return (
    <View style={{ gap: Spacing.three }}>
      <View style={styles.bars}>
        {shown.map((w) => {
          const total = w.received + w.issued + w.other;
          return (
            <View key={w.week_start} style={styles.barCol} accessibilityLabel={`Week of ${formatShortDate(w.week_start)}: ${total} entries`}>
              <Text variant="caption" tone="muted" style={{ fontSize: 10 }}>
                {total || ''}
              </Text>
              <View style={[styles.barTrack, { height: 96 }]}>
                <View style={{ height: `${(total / max) * 100}%`, width: '100%', borderRadius: 6, overflow: 'hidden', justifyContent: 'flex-end' }}>
                  {series.map((s) =>
                    w[s.key] > 0 ? <View key={s.key} style={{ flex: w[s.key], backgroundColor: s.color, borderTopWidth: 1, borderColor: c.surface }} /> : null,
                  )}
                </View>
              </View>
              <Text variant="caption" tone="muted" style={{ fontSize: 10 }} numberOfLines={1}>
                {formatShortDate(w.week_start).split(' ')[0]}
              </Text>
            </View>
          );
        })}
      </View>
      <View style={styles.inlineLegend}>
        {series.map((s) => (
          <View key={s.key} style={styles.inlineLegendItem}>
            <View style={[styles.swatch, { backgroundColor: s.color }]} />
            <Text variant="caption" tone="secondary">
              {s.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    flexDirection: 'row',
    height: 14,
    borderRadius: Radius.pill,
    overflow: 'hidden',
    gap: 2,
  },
  legend: {
    gap: Spacing.two,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  barTrack: {
    width: '100%',
    maxWidth: 28,
    justifyContent: 'flex-end',
  },
  inlineLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.four,
  },
  inlineLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});
