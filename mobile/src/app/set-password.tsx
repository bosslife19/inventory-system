import { LinearGradient } from 'expo-linear-gradient';
import { AlertCircle, KeyRound, Lock, ShieldCheck } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api';
import { useSession, useUser } from '@/lib/session';

/**
 * After signing in with a temporary password (a new account, or one whose
 * password was reset): choose your own before the app opens. The API allows
 * nothing else until this is done.
 */
export default function SetPassword() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const user = useUser();
  const { changePassword, signOut } = useSession();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);

  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => scroll.current?.scrollToEnd({ animated: true }));
    return () => sub.remove();
  }, []);

  async function submit() {
    if (!current) return setError('Enter the temporary password you were given.');
    if (next.length < 8) return setError('Your new password needs at least 8 characters.');
    if (next === current) return setError('Choose a password different from the temporary one.');
    if (next !== confirm) return setError('The two new passwords don’t match.');
    setBusy(true);
    setError(null);
    try {
      await changePassword(current, next);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? (Object.values(err.errors)[0]?.[0] ?? err.message)
          : "Can't reach the server. You need a connection to set your password.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    // Padding on both platforms: edge-to-edge Android (Expo SDK 57) no longer resizes the window for the keyboard.
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.ink }} behavior="padding">
      <LinearGradient colors={['#0a0f1c', '#0f1d45', '#1d4ed8']} locations={[0, 0.5, 1]} start={{ x: 0, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFill} />

      <ScrollView
        ref={scroll}
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + Spacing.eight, paddingBottom: insets.bottom + Spacing.six }]}
        keyboardShouldPersistTaps="handled">
        <View style={styles.inner}>
          <View style={[styles.mark, { backgroundColor: c.primary }]}>
            <ShieldCheck size={22} color="#fff" />
          </View>
          <Text variant="display" tone="inverse" style={{ fontSize: 28, lineHeight: 34, marginTop: Spacing.five }}>
            Set your password
          </Text>
          <Text variant="small" style={{ color: '#dbe3f1', marginTop: Spacing.two }}>
            Welcome, {user.name}. You signed in with a temporary password — choose your own to continue. Only you should know it.
          </Text>

          <View style={{ flexGrow: 1, minHeight: Spacing.six }} />

          <View style={[styles.card, { backgroundColor: c.surface, shadowColor: '#000' }]}>
            <TextField
              label="Temporary password"
              icon={KeyRound}
              value={current}
              onChangeText={setCurrent}
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="next"
            />
            <TextField
              label="New password"
              icon={Lock}
              value={next}
              onChangeText={setNext}
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              placeholder="At least 8 characters"
              returnKeyType="next"
            />
            <TextField
              label="Confirm new password"
              icon={Lock}
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
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

            <Button label="Set my password" size="lg" block loading={busy} onPress={submit} />
            <Button label="Sign out" variant="ghost" block onPress={() => void signOut()} />
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
  mark: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
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
