import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Text } from './ui/text';

interface Props {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  back?: boolean;
  right?: React.ReactNode;
  /** Modal sheets already sit below the status bar on iOS. */
  inModal?: boolean;
}

/** Plain page header for list screens: eyebrow in brand blue, bold title. */
export function PageHeader({ title, eyebrow, subtitle, back, right, inModal }: Props) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { paddingTop: (inModal ? Spacing.four : insets.top + Spacing.three) }]}>
      {back && (
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={12}
          style={[styles.back, { backgroundColor: c.surface, borderColor: c.border }]}>
          <ChevronLeft size={22} color={c.text} />
        </Pressable>
      )}
      <View style={styles.row}>
        <View style={{ flex: 1, gap: 2 }}>
          {eyebrow && (
            <Text variant="eyebrow" tone="primary">
              {eyebrow}
            </Text>
          )}
          <Text variant="title" style={{ fontSize: 26, lineHeight: 32 }}>
            {title}
          </Text>
          {subtitle && (
            <Text variant="small" tone="muted">
              {subtitle}
            </Text>
          )}
        </View>
        {right}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: Spacing.five,
    paddingBottom: Spacing.four,
    gap: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.three,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
