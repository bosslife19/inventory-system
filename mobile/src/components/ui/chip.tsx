import * as Haptics from 'expo-haptics';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Text } from './text';

export function Chip({ label, selected, onPress, count }: { label: string; selected: boolean; onPress: () => void; count?: number }) {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={() => {
        if (Platform.OS !== 'web') void Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? c.primary : c.surface,
          borderColor: selected ? c.primary : c.borderStrong,
          opacity: pressed ? 0.85 : 1,
        },
      ]}>
      <Text variant="caption" weight="semibold" style={{ color: selected ? '#ffffff' : c.text2 }}>
        {label}
      </Text>
      {count !== undefined && count > 0 && (
        <View style={[styles.count, { backgroundColor: selected ? 'rgba(255,255,255,0.22)' : c.surface2 }]}>
          <Text variant="caption" weight="bold" style={{ color: selected ? '#ffffff' : c.text2, fontSize: 11 }}>
            {count}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

/** Horizontally scrolling chip row, edge to edge. */
export function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {children}
    </ScrollView>
  );
}

/** Two to four options in a pill track (like the web's segmented control). */
export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const c = useTheme();
  return (
    <View style={[styles.track, { backgroundColor: c.surface2, borderColor: c.border }]} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, on && { backgroundColor: c.surface, shadowColor: c.shadow, shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 }]}>
            <Text variant="caption" weight="semibold" tone={on ? 'default' : 'muted'}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  count: {
    minWidth: 20,
    paddingHorizontal: 5,
    borderRadius: Radius.pill,
    alignItems: 'center',
  },
  row: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.five,
  },
  track: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 34,
    borderRadius: 9,
  },
});
