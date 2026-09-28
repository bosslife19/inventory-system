import { AlertOctagon, CalendarClock, Check, CheckCheck, PackageX, TriangleAlert, type LucideIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ALERT_TITLE, formatDate, timeAgo } from '@/lib/format';
import { useAlertAction } from '@/lib/queries';
import type { Alert, AlertType } from '@/lib/types';

import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { IconChip } from './ui/misc';
import { Text } from './ui/text';

const ICON: Record<AlertType, LucideIcon> = {
  stock_out: PackageX,
  expired: AlertOctagon,
  low_stock: TriangleAlert,
  expiring_soon: CalendarClock,
};
const TONE = { critical: 'critical', warning: 'warning', info: 'primary' } as const;

function detail(a: Alert): string {
  if (a.batch) return `Batch ${a.batch.batch_no} ${a.alert_type === 'expired' ? 'expired' : 'expires'} ${formatDate(a.batch.expiry_date)}`;
  return a.alert_type === 'stock_out' ? 'No usable stock left' : 'Usable stock is below the minimum level';
}

/** An alert with its follow-up actions. Status is always written out, not colour alone. */
export function AlertCard({ alert: a, compact, highlight, actions = true }: { alert: Alert; compact?: boolean; highlight?: boolean; actions?: boolean }) {
  const c = useTheme();
  const act = useAlertAction();
  const busy = act.isPending;

  return (
    <Card style={[styles.card, highlight && { borderColor: c.primary, borderWidth: 1.5 }]}>
      <View style={styles.row}>
        <IconChip icon={ICON[a.alert_type]} tone={TONE[a.severity]} size={compact ? 36 : 42} />
        <View style={{ flex: 1, gap: 3 }}>
          <View style={styles.title}>
            <Text variant="label">{ALERT_TITLE[a.alert_type]}</Text>
            {a.status === 'acknowledged' && <Badge label="Acknowledged" tone="neutral" dot={false} />}
            {a.status === 'resolved' && <Badge label="Resolved" tone="ok" dot={false} />}
          </View>
          <Text variant="small" tone="secondary" numberOfLines={1}>
            {a.product.name}
          </Text>
          <Text variant="caption" tone="muted">
            {detail(a)} · {a.status === 'resolved' ? (a.resolved_by_name ? `resolved ${timeAgo(a.resolved_at)}` : `cleared ${timeAgo(a.resolved_at)}`) : timeAgo(a.created_at)}
          </Text>
        </View>
      </View>
      {actions && !compact && a.status !== 'resolved' && (
        <View style={styles.actions}>
          {a.status === 'open' && (
            <Button label="Acknowledge" icon={Check} variant="ghost" size="sm" disabled={busy} onPress={() => act.mutate({ id: a.id, action: 'acknowledge' })} />
          )}
          <Button label="Resolve" icon={CheckCheck} variant="soft" size="sm" disabled={busy} onPress={() => act.mutate({ id: a.id, action: 'resolve' })} />
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.three,
    alignItems: 'flex-start',
  },
  title: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.two,
  },
});
