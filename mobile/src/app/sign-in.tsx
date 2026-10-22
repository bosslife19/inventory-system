import { Link } from 'expo-router';
import { Lock, Mail } from 'lucide-react-native';
import { useState } from 'react';

import { AuthError, AuthShell } from '@/components/auth-shell';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';

const POINTS = ['Record receipts, issues and counts', 'Works offline — syncs when you’re back', 'Stock-out and expiry alerts'];

export default function SignIn() {
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
    <AuthShell
      headline="Your facility’s stock card, in your pocket."
      points={POINTS}
      title="Welcome back"
      subtitle="Sign in with your facility account."
      footer={
        <>
          <Text variant="small" style={{ color: '#dbe3f1' }}>
            New here?{' '}
          </Text>
          <Link href="/sign-up" replace>
            <Text variant="small" weight="semibold" style={{ color: '#ffffff' }}>
              Create an account
            </Text>
          </Link>
        </>
      }>
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

      {error && <AuthError message={error} />}

      <Button label="Sign in" size="lg" block loading={busy} onPress={submit} />
    </AuthShell>
  );
}
