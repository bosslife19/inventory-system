import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Text } from './text';

export type KpiTone = 'default' | 'primary' | 'ink' | 'critical' | 'warning';

interface Props {
  label: string;
  value: string | number;
  sub?: string;
  icon: LucideIcon;
  tone?: KpiTone;
}

/** Headline number with its label — same tones as the web dashboard's KPI tiles. */
export function KpiTile({ label, value, sub, icon: Icon, tone = 'default' }: Props) {
  const c = useTheme();
  const solid = tone === 'primary' || tone === 'ink';
  const bg = tone === 'primary' ? c.primary : tone === 'ink' ? c.ink : c.surface;
  const valueColor = solid ? '#ffffff' : tone === 'critical' ? c.critical : tone === 'warning' ? c.warning : c.text;
  const chip = solid
    ? { bg: 'rgba(255,255,255,0.16)', fg: '#ffffff' }
    : tone === 'critical'
      ? { bg: c.criticalSoft, fg: c.critical }
      : tone === 'warning'
        ? { bg: c.warningSoft, fg: c.warning }
        : { bg: c.primarySoft, fg: c.primary };

  return (
    <View
      style={[
        styles.tile,
        { backgroundColor: bg, borderColor: solid ? bg : c.border, shadowColor: tone === 'primary' ? c.primary : c.shadow },
        tone === 'primary' && { shadowOpacity: 0.3 },
      ]}>
      <View style={styles.top}>
        <Text variant="caption" style={{ color: solid ? 'rgba(255,255,255,0.8)' : c.muted, flex: 1 }} numberOfLines={2}>
          {label}
        </Text>
        <View style={[styles.icon, { backgroundColor: chip.bg }]}>
          <Icon size={17} color={chip.fg} strokeWidth={2.2} />
        </View>
      </View>
      <Text variant="display" style={{ color: valueColor, fontSize: 28 }}>
        {value}
      </Text>
      {sub && (
        <Text variant="caption" style={{ color: solid ? 'rgba(255,255,255,0.75)' : c.muted }} numberOfLines={1}>
          {sub}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minWidth: 150,
    gap: Spacing.one,
    padding: Spacing.four,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 3,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    marginBottom: Spacing.one,
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
