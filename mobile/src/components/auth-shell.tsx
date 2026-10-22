import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { AlertCircle, Boxes, CheckCircle2 } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { Keyboard, KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { usePlatform } from '@/lib/queries';

interface Props {
  headline: string;
  points?: string[];
  title: string;
  subtitle: string;
  /** The form: fields, error and buttons, inside the card. */
  children: React.ReactNode;
  /** Under the card, e.g. a link to the other screen. */
  footer?: React.ReactNode;
}

/** The signed-out screens (sign-in, sign-up): branded gradient, headline, then the form card at the bottom. */
export function AuthShell({ headline, points, title, subtitle, children, footer }: Props) {
  const c = useTheme();
  const platform = usePlatform().data;
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);

  // The form sits at the bottom of the screen: when the keyboard opens, bring it into view.
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => scroll.current?.scrollToEnd({ animated: true }));
    return () => sub.remove();
  }, []);

  return (
    // Padding on both platforms: edge-to-edge Android (Expo SDK 57) no longer resizes the window for the keyboard.
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.ink }} behavior="padding">
      <LinearGradient colors={['#0a0f1c', '#0f1d45', '#1d4ed8']} locations={[0, 0.5, 1]} start={{ x: 0, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={[styles.glow, { top: -120, right: -100, width: 320, height: 320, backgroundColor: 'rgba(59,130,246,0.16)' }]} />
      <View style={[styles.glow, { bottom: 120, left: -120, width: 260, height: 260, backgroundColor: 'rgba(29,78,216,0.18)' }]} />

      <ScrollView
        ref={scroll}
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + Spacing.eight, paddingBottom: insets.bottom + Spacing.six }]}
        keyboardShouldPersistTaps="handled">
        <View style={styles.inner}>
          <View style={styles.brand}>
            {platform?.logo_url ? (
              <Image source={{ uri: platform.logo_url }} style={styles.mark} contentFit="contain" />
            ) : (
              <View style={[styles.mark, { backgroundColor: c.primary }]}>
                <Boxes size={22} color="#fff" />
              </View>
            )}
            <View>
              <Text variant="heading" tone="inverse">
                {platform?.name ?? 'Stock Card'}
              </Text>
              <Text variant="caption" style={{ color: '#9fb0cc' }}>
                {platform?.tagline ?? 'Health supply chain · Nigeria'}
              </Text>
            </View>
          </View>

          <View style={{ gap: Spacing.three, marginTop: Spacing.eight }}>
            <Text variant="display" tone="inverse" style={{ fontSize: 32, lineHeight: 38 }}>
              {headline}
            </Text>
            {points && (
              <View style={{ gap: Spacing.two }}>
                {points.map((p) => (
                  <View key={p} style={styles.point}>
                    <CheckCircle2 size={17} color="#6ea0ff" />
                    <Text variant="small" style={{ color: '#dbe3f1' }}>
                      {p}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          <View style={{ flexGrow: 1, minHeight: Spacing.eight }} />

          <View style={[styles.card, { backgroundColor: c.surface, shadowColor: '#000' }]}>
            <View style={{ gap: 4 }}>
              <Text variant="title">{title}</Text>
              <Text variant="small" tone="muted">
                {subtitle}
              </Text>
            </View>
            {children}
          </View>

          {footer && <View style={styles.footer}>{footer}</View>}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** A form's error, inside the card. */
export function AuthError({ message }: { message: string }) {
  const c = useTheme();
  return (
    <View style={[styles.error, { backgroundColor: c.criticalSoft }]} accessibilityRole="alert">
      <AlertCircle size={16} color={c.critical} />
      <Text variant="small" tone="critical" style={{ flex: 1 }}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    paddingHorizontal: Spacing.five,
    alignItems: 'center',
  },
  inner: {
    width: '100%',
    maxWidth: MaxContentWidth - 200,
    flexGrow: 1,
  },
  glow: {
    position: 'absolute',
    borderRadius: 999,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  mark: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  point: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  card: {
    paddingTop: Spacing.six,
    gap: Spacing.four,
    padding: Spacing.five,
    borderRadius: Radius.xl + 2,
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.35,
    shadowRadius: 40,
    elevation: 16,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.four,
  },
  error: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.md,
  },
});
