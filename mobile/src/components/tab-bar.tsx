import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { Bell, House, Package, Plus, UserRound, type LucideIcon } from 'lucide-react-native';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAlerts } from '@/lib/queries';

import { Text } from './ui/text';

const TABS: Record<string, { label: string; icon: LucideIcon }> = {
  index: { label: 'Home', icon: House },
  stock: { label: 'Stock', icon: Package },
  alerts: { label: 'Alerts', icon: Bell },
  account: { label: 'Account', icon: UserRound },
};

function tap() {
  if (Platform.OS !== 'web') void Haptics.selectionAsync();
}

/**
 * Floating tab bar: white pill on the page, blue active state, and a raised
 * "record" button in the middle — the most-used action in the app
 * (web/CLAUDE.md rule 3: the entry form is the most important screen).
 */
export function TabBar({ state, navigation, insets }: BottomTabBarProps) {
  const c = useTheme();
  const open = useAlerts('open').data?.meta.pagination.total ?? 0;
  const routes = state.routes.filter((r) => r.name in TABS);
  const half = Math.ceil(routes.length / 2);

  const item = (route: (typeof routes)[number]) => {
    const { label, icon: Icon } = TABS[route.name];
    const focused = state.routes[state.index]?.key === route.key;
    return (
      <Pressable
        key={route.key}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={route.name === 'alerts' && open ? `${label}, ${open} open` : label}
        onPress={() => {
          tap();
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
        }}
        style={styles.item}>
        <View style={[styles.iconWrap, focused && { backgroundColor: c.primarySoft }]}>
          <Icon size={21} color={focused ? c.primary : c.muted} strokeWidth={focused ? 2.4 : 2} />
          {route.name === 'alerts' && open > 0 && (
            <View style={[styles.badge, { backgroundColor: c.statusCritical, borderColor: c.surface }]}>
              <Text variant="caption" weight="bold" style={styles.badgeText}>
                {open > 9 ? '9+' : open}
              </Text>
            </View>
          )}
        </View>
        <Text variant="caption" weight={focused ? 'semibold' : 'medium'} style={{ color: focused ? c.primary : c.muted, fontSize: 11 }}>
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, Spacing.three) }]}>
      <View style={[styles.bar, { backgroundColor: c.surface, borderColor: c.border, shadowColor: c.shadow }]}>
        {routes.slice(0, half).map(item)}
        <View style={styles.centerSlot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Record a transaction"
            onPress={() => {
              if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              router.push('/record');
            }}
            style={({ pressed }) => [
              styles.fab,
              { backgroundColor: pressed ? c.primaryPressed : c.primary, shadowColor: c.primary, borderColor: c.surface },
              pressed && { transform: [{ scale: 0.95 }] },
            ]}>
            <Plus size={28} color="#ffffff" strokeWidth={2.6} />
          </Pressable>
        </View>
        {routes.slice(half).map(item)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    maxWidth: 520,
    height: 70,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.xl + 4,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 12,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  iconWrap: {
    width: 46,
    height: 30,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: 4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 10,
    lineHeight: 12,
  },
  centerSlot: {
    width: 72,
    alignItems: 'center',
  },
  fab: {
    width: 60,
    height: 60,
    marginTop: -34,
    borderRadius: 30,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 10,
  },
});
