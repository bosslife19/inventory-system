import { router } from 'expo-router';
import { X } from 'lucide-react-native';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Text } from './ui/text';

/** A modal form: titled header with a close button, scrolling body, and a footer for the main action. */
export function Sheet({ eyebrow, title, footer, children }: { eyebrow: string; title: string; footer: React.ReactNode; children: React.ReactNode }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior="padding">
      <View
        style={[
          styles.header,
          { paddingTop: Platform.OS === 'ios' ? Spacing.four : insets.top + Spacing.three, borderColor: c.border, backgroundColor: c.surface },
        ]}>
        <View style={{ flex: 1 }}>
          <Text variant="eyebrow" tone="primary">
            {eyebrow}
          </Text>
          <Text variant="title">{title}</Text>
        </View>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={10}
          style={[styles.close, { backgroundColor: c.surface2 }]}>
          <X size={20} color={c.text} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.three, backgroundColor: c.surface, borderColor: c.border }]}>
        <View style={styles.footerInner}>{footer}</View>
      </View>
    </KeyboardAvoidingView>
  );
}

export function SheetSection({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      {label && (
        <Text variant="label" tone="secondary">
          {label}
        </Text>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.five,
    paddingBottom: Spacing.four,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  close: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.five,
    gap: Spacing.six,
    paddingBottom: Spacing.eight * 2,
  },
  section: {
    gap: Spacing.three,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.three,
    paddingHorizontal: Spacing.five,
  },
  footerInner: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.two,
    alignItems: 'center',
  },
});
