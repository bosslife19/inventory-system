import { Link, router } from 'expo-router';
import { CheckCircle2, Mail } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AuthError, AuthShell } from '@/components/auth-shell';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, api, unwrap } from '@/lib/api';

/**
 * "Forgot password": emails a link to choose a new password. The link opens
 * the web app's reset page in the phone's browser; then sign in here with
 * the new password. The answer is the same whether or not the account exists.
 */
export default function ForgotPassword() {
  const c = useTheme();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  async function submit() {
    if (!email.trim()) return setError('Enter the email you sign in with.');
    setBusy(true);
    setError(null);
    try {
      setSent((await unwrap(api.POST('/auth/forgot-password', { body: { email: email.trim() } }))).message);
    } catch (err) {
      setError(
        err instanceof ApiError ? (err.errors.email?.[0] ?? err.message) : "Can't reach the server. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      headline="Locked out? It happens."
      title={sent ? 'Check your email' : 'Forgot your password?'}
      subtitle={sent ? 'Open the link on this phone or any computer.' : 'We’ll email you a link to choose a new one.'}
      footer={
        <>
          <Text variant="small" style={{ color: '#dbe3f1' }}>
            Remembered it?{' '}
          </Text>
          <Link href="/sign-in" replace>
            <Text variant="small" weight="semibold" style={{ color: '#ffffff' }}>
              Sign in
            </Text>
          </Link>
        </>
      }>
      {sent ? (
        <>
          <View style={[styles.sent, { backgroundColor: c.okSoft }]}>
            <CheckCircle2 size={18} color={c.ok} />
            <Text variant="small" style={{ flex: 1, color: c.text }}>
              {sent}
            </Text>
          </View>
          <Text variant="caption" tone="muted">
            The link works for an hour. After choosing a new password, come back and sign in with it. Nothing arrived? Check your spam
            folder, or ask whoever manages your account to reset it.
          </Text>
          <Button label="Back to sign in" size="lg" block onPress={() => router.replace('/sign-in')} />
        </>
      ) : (
        <>
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
            returnKeyType="send"
            onSubmitEditing={submit}
          />
          {error && <AuthError message={error} />}
          <Button label="Send reset link" size="lg" block loading={busy} onPress={submit} />
        </>
      )}
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  sent: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'flex-start',
    padding: Spacing.three,
    borderRadius: Radius.md,
  },
});
