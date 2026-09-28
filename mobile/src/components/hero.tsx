import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Radius, Spacing } from '@/constants/theme';

/**
 * The brand header: near-black into blue with a soft glow — the same look
 * as the web sign-in panel. Content sits on it in white.
 */
export function Hero({ children, extraBottom = 0 }: { children: React.ReactNode; extraBottom?: number }) {
  const insets = useSafeAreaInsets();
  return (
    <LinearGradient
      colors={['#0a0f1c', '#10204a', '#1d4ed8']}
      locations={[0, 0.55, 1]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.hero, { paddingTop: insets.top + Spacing.four, paddingBottom: Spacing.six + extraBottom }]}>
      <View style={[styles.glow, styles.glowA]} pointerEvents="none" />
      <View style={[styles.glow, styles.glowB]} pointerEvents="none" />
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  hero: {
    paddingHorizontal: Spacing.five,
    borderBottomLeftRadius: Radius.xl + 6,
    borderBottomRightRadius: Radius.xl + 6,
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    borderRadius: 999,
  },
  glowA: {
    width: 260,
    height: 260,
    right: -90,
    top: -110,
    backgroundColor: 'rgba(59,130,246,0.35)',
  },
  glowB: {
    width: 180,
    height: 180,
    left: -70,
    bottom: -90,
    backgroundColor: 'rgba(29,78,216,0.35)',
  },
});
