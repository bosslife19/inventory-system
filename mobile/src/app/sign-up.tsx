import { Link } from 'expo-router';
import { Building2, Lock, Mail, Phone, User } from 'lucide-react-native';
import { useState } from 'react';

import { AuthError, AuthShell } from '@/components/auth-shell';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { ApiError } from '@/lib/api';
import { type SignUp as Details, useSession } from '@/lib/session';

const EMPTY: Details = { organization_name: '', name: '', email: '', phone: '', password: '' };

/**
 * Self sign-up: a new organization on the free plan, with this person as its
 * admin, signed in straight away. The platform owner upgrades it once paid.
 */
export default function SignUp() {
  const { signUp } = useSession();
  const [form, setForm] = useState(EMPTY);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const set = (key: keyof Details) => (value: string) => setForm({ ...form, [key]: value });
  const fieldError = (key: keyof Details) => fieldErrors[key]?.[0];

  async function submit() {
    if (!form.organization_name.trim() || !form.name.trim() || !form.email.trim() || !form.password) {
      return setError('Fill in your organization, name, email and password.');
    }
    if (form.password.length < 8) return setError('Use a password of at least 8 characters.');
    if (form.password !== confirm) return setError('The passwords don’t match.');
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      await signUp({ ...form, organization_name: form.organization_name.trim(), name: form.name.trim(), email: form.email.trim() });
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.errors).length) {
        setFieldErrors(err.errors);
      } else {
        setError(err instanceof ApiError ? err.message : "Can't reach the server. Check your connection and try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      headline="Set up your organization’s stock cards."
      title="Create an account"
      subtitle="Free plan: Stock Cards, alerts and reports. You’ll be the admin and add facilities and staff from the web dashboard."
      footer={
        <>
          <Text variant="small" style={{ color: '#dbe3f1' }}>
            Already have an account?{' '}
          </Text>
          <Link href="/sign-in" replace>
            <Text variant="small" weight="semibold" style={{ color: '#ffffff' }}>
              Sign in
            </Text>
          </Link>
        </>
      }>
      <TextField
        label="Organization"
        icon={Building2}
        value={form.organization_name}
        onChangeText={set('organization_name')}
        error={fieldError('organization_name')}
        autoCapitalize="words"
        maxLength={255}
        returnKeyType="next"
      />
      <TextField
        label="Your name"
        icon={User}
        value={form.name}
        onChangeText={set('name')}
        error={fieldError('name')}
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        maxLength={255}
        returnKeyType="next"
      />
      <TextField
        label="Email"
        icon={Mail}
        value={form.email}
        onChangeText={set('email')}
        error={fieldError('email')}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="next"
      />
      <TextField
        label="Phone (optional)"
        icon={Phone}
        value={form.phone}
        onChangeText={set('phone')}
        error={fieldError('phone')}
        autoComplete="tel"
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        maxLength={30}
      />
      <TextField
        label="Password"
        hint="At least 8 characters"
        icon={Lock}
        value={form.password}
        onChangeText={set('password')}
        error={fieldError('password')}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="next"
      />
      <TextField
        label="Confirm password"
        icon={Lock}
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={submit}
      />

      {error && <AuthError message={error} />}

      <Button label="Create account" size="lg" block loading={busy} onPress={submit} />
    </AuthShell>
  );
}
