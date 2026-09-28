import { LinearGradient } from 'expo-linear-gradient';
import { AlertCircle, Boxes, CheckCircle2, Lock, Mail } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';

const POINTS = ['Record receipts, issues and counts', 'Works offline — syncs when you’re back', 'Stock-out and expiry alerts'];

export default function SignIn() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { session, signIn } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    session.status === 'signedOut' && session.expired ? 'Your session expired. Please sign in again.' : null,
  );

  async function submit() {
    if (!email.trim() || !password) return setError('Enter your email and password.');
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? (err.errors.email?.[0] ?? err.message)
          : "Can't reach the server. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.ink }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <LinearGradient colors={['#0a0f1c', '#0f1d45', '#1d4ed8']} locations={[0, 0.5, 1]} start={{ x: 0, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={[styles.glow, { top: -120, right: -100, width: 320, height: 320, backgroundColor: 'rgba(59,130,246,0.16)' }]} />
      <View style={[styles.glow, { bottom: 120, left: -120, width: 260, height: 260, backgroundColor: 'rgba(29,78,216,0.18)' }]} />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + Spacing.eight, paddingBottom: insets.bottom + Spacing.six }]}
        keyboardShouldPersistTaps="handled">
        <View style={styles.inner}>
          <View style={styles.brand}>
            <View style={[styles.mark, { backgroundColor: c.primary }]}>
              <Boxes size={22} color="#fff" />
            </View>
            <View>
              <Text variant="heading" tone="inverse">
                Stock Card
              </Text>
              <Text variant="caption" style={{ color: '#9fb0cc' }}>
                Health supply chain · Nigeria
              </Text>
            </View>
          </View>

          <View style={{ gap: Spacing.three, marginTop: Spacing.eight }}>
            <Text variant="display" tone="inverse" style={{ fontSize: 32, lineHeight: 38 }}>
              Your facility’s stock card, in your pocket.
            </Text>
            <View style={{ gap: Spacing.two }}>
              {POINTS.map((p) => (
                <View key={p} style={styles.point}>
                  <CheckCircle2 size={17} color="#6ea0ff" />
                  <Text variant="small" style={{ color: '#dbe3f1' }}>
                    {p}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          <View style={{ flexGrow: 1, minHeight: Spacing.eight }} />

          <View style={[styles.card, { backgroundColor: c.surface, shadowColor: '#000' }]}>
            <View style={{ gap: 4 }}>
              <Text variant="title">Welcome back</Text>
              <Text variant="small" tone="muted">
                Sign in with your facility account.
              </Text>
            </View>

            <TextField
              label="Email"
              icon={Mail}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="username"
              placeholder="you@facility.ng"
              returnKeyType="next"
            />
            <TextField
              label="Password"
              icon={Lock}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
              placeholder="••••••••"
              returnKeyType="go"
              onSubmitEditing={submit}
            />

            {error && (
              <View style={[styles.error, { backgroundColor: c.criticalSoft }]} accessibilityRole="alert">
                <AlertCircle size={16} color={c.critical} />
                <Text variant="small" tone="critical" style={{ flex: 1 }}>
                  {error}
                </Text>
              </View>
            )}

            <Button label="Sign in" size="lg" block loading={busy} onPress={submit} />
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
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
  error: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.md,
  },
});
