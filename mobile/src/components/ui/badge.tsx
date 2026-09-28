import { StyleSheet, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { EXPIRY_LABEL, LEVEL_LABEL } from '@/lib/format';
import type { ExpiryStatus, StockLevel } from '@/lib/types';

import { Text } from './text';

export type Tone = 'critical' | 'warning' | 'notice' | 'ok' | 'neutral' | 'ink';

/** Pill with a status dot — status is always spelled out, never colour alone. */
export function Badge({ label, tone = 'neutral', dot = true }: { label: string; tone?: Tone; dot?: boolean }) {
  const c = useTheme();
  const { bg, fg } = {
    critical: { bg: c.criticalSoft, fg: c.critical },
    warning: { bg: c.warningSoft, fg: c.warning },
    notice: { bg: c.noticeSoft, fg: c.notice },
    ok: { bg: c.okSoft, fg: c.ok },
    neutral: { bg: c.surface2, fg: c.muted },
    ink: { bg: c.ink, fg: '#ffffff' },
  }[tone];

  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      {dot && <View style={[styles.dot, { backgroundColor: fg }]} />}
      <Text variant="caption" weight="semibold" style={{ color: fg }}>
        {label}
      </Text>
    </View>
  );
}

export const LEVEL_TONE: Record<StockLevel, Tone> = {
  stock_out: 'critical',
  low_stock: 'warning',
  reorder: 'notice',
  ok: 'ok',
};

export function LevelBadge({ level }: { level: StockLevel }) {
  return <Badge label={LEVEL_LABEL[level]} tone={LEVEL_TONE[level]} />;
}

export function ExpiryBadge({ status }: { status: ExpiryStatus | null }) {
  if (!status || status === 'ok') return null;
  return <Badge label={EXPIRY_LABEL[status]} tone={status === 'expired' ? 'critical' : 'notice'} />;
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    paddingHorizontal: Spacing.two + 1,
    paddingVertical: 3,
    borderRadius: Radius.pill,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
