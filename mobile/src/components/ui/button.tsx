import * as Haptics from 'expo-haptics';
import type { LucideIcon } from 'lucide-react-native';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Text } from './text';

interface Props {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ink' | 'ghost' | 'soft' | 'danger';
  size?: 'md' | 'lg' | 'sm';
  icon?: LucideIcon;
  loading?: boolean;
  disabled?: boolean;
  block?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({ label, onPress, variant = 'primary', size = 'md', icon: Icon, loading, disabled, block, style }: Props) {
  const c = useTheme();
  const palette = {
    primary: { bg: c.primary, pressed: c.primaryPressed, fg: c.onPrimary, border: c.primary },
    ink: { bg: c.ink, pressed: c.ink2, fg: '#ffffff', border: c.ink },
    ghost: { bg: c.surface, pressed: c.surface2, fg: c.text, border: c.borderStrong },
    soft: { bg: c.primarySoft, pressed: c.primarySoft, fg: c.primary, border: c.primarySoft },
    danger: { bg: c.criticalSoft, pressed: c.criticalSoft, fg: c.critical, border: c.criticalSoft },
  }[variant];
  const height = { sm: 36, md: 46, lg: 54 }[size];
  const inactive = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={() => {
        if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={({ pressed }) => [
        styles.base,
        {
          height,
          backgroundColor: pressed ? palette.pressed : palette.bg,
          borderColor: palette.border,
          paddingHorizontal: size === 'sm' ? Spacing.three : Spacing.five,
          opacity: inactive && !loading ? 0.55 : 1,
        },
        variant === 'primary' && { shadowColor: c.primary, shadowOpacity: 0.28, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
        block && styles.block,
        pressed && { transform: [{ scale: 0.98 }] },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <View style={styles.row}>
          {Icon && <Icon size={size === 'sm' ? 16 : 19} color={palette.fg} strokeWidth={2.2} />}
          <Text variant={size === 'sm' ? 'caption' : 'label'} weight="semibold" style={{ color: palette.fg, fontSize: size === 'lg' ? 16 : undefined }}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  block: {
    alignSelf: 'stretch',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
