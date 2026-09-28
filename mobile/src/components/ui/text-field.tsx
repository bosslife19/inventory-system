import type { LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Text } from './text';

interface Props extends TextInputProps {
  label?: string;
  hint?: string;
  error?: string;
  icon?: LucideIcon;
}

/** Labelled input with hint / error, focus ring in the brand blue. */
export function TextField({ label, hint, error, icon: Icon, style, onFocus, onBlur, ...rest }: Props) {
  const c = useTheme();
  const [focused, setFocused] = useState(false);
  const border = error ? c.critical : focused ? c.primary : c.borderStrong;

  return (
    <View style={styles.wrap}>
      {label && (
        <Text variant="caption" weight="semibold" tone="secondary">
          {label}
        </Text>
      )}
      <View
        style={[
          styles.box,
          { borderColor: border, backgroundColor: c.surface },
          focused && !error && { shadowColor: c.primary, shadowOpacity: 0.18, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
        ]}>
        {Icon && <Icon size={18} color={focused ? c.primary : c.muted} />}
        <TextInput
          placeholderTextColor={c.muted}
          selectionColor={c.primary}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[styles.input, { color: c.text }, style]}
          accessibilityLabel={label}
          {...rest}
        />
      </View>
      {error ? (
        <Text variant="caption" tone="critical">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 6,
  },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 48,
    paddingHorizontal: Spacing.three,
    borderWidth: 1.2,
    borderRadius: Radius.md,
  },
  input: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: 15,
    paddingVertical: Spacing.three,
  },
});
