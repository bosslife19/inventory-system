import type { LucideIcon } from 'lucide-react-native';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Text } from './text';

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.section}>
      <Text variant="heading">{title}</Text>
      {action && onAction && (
        <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button">
          <Text variant="caption" weight="semibold" tone="primary">
            {action}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

/** Thin progress bar: share of a max level. Tone follows stock status. */
export function Meter({ value, tone = 'primary' }: { value: number; tone?: 'primary' | 'critical' | 'warning' | 'ok' }) {
  const c = useTheme();
  const color = { primary: c.primary, critical: c.statusCritical, warning: c.statusWarning, ok: c.statusOk }[tone];
  return (
    <View style={[styles.meter, { backgroundColor: c.surface2, borderColor: c.border }]}>
      <View style={[styles.meterFill, { width: `${Math.max(0, Math.min(100, value))}%`, backgroundColor: color }]} />
    </View>
  );
}

export function EmptyState({ icon: Icon, title, body, children }: { icon: LucideIcon; title: string; body?: string; children?: React.ReactNode }) {
  const c = useTheme();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: c.primarySoft }]}>
        <Icon size={26} color={c.primary} />
      </View>
      <Text variant="heading" align="center">
        {title}
      </Text>
      {body && (
        <Text variant="small" tone="muted" align="center" style={{ maxWidth: 300 }}>
          {body}
        </Text>
      )}
      {children}
    </View>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  const c = useTheme();
  return (
    <View style={styles.empty}>
      <ActivityIndicator color={c.primary} size="large" />
      <Text variant="small" tone="muted">
        {label}
      </Text>
    </View>
  );
}

/** Round soft-blue icon chip, used beside list items. */
export function IconChip({ icon: Icon, tone = 'primary', size = 40 }: { icon: LucideIcon; tone?: 'primary' | 'critical' | 'warning' | 'ok' | 'ink'; size?: number }) {
  const c = useTheme();
  const { bg, fg } = {
    primary: { bg: c.primarySoft, fg: c.primary },
    critical: { bg: c.criticalSoft, fg: c.critical },
    warning: { bg: c.warningSoft, fg: c.warning },
    ok: { bg: c.okSoft, fg: c.ok },
    ink: { bg: c.ink, fg: '#ffffff' },
  }[tone];
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Icon size={size * 0.46} color={fg} strokeWidth={2.2} />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.three,
  },
  meter: {
    height: 6,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  meterFill: {
    height: '100%',
    borderRadius: Radius.pill,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.eight + 8,
    paddingHorizontal: Spacing.six,
  },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
