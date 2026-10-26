import { LinearGradient } from 'expo-linear-gradient';
import { AlertCircle, CheckCircle2, MailCheck } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api';
import { useSession, useUser } from '@/lib/session';

/**
 * After signing up: confirm the email with the link sent to it (opened in
 * any browser), then come back. The API allows nothing else until then.
 */
export default function VerifyEmail() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const user = useUser();
  const { refresh, resendVerification, signOut } = useSession();
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function check() {
    setChecking(true);
    setNote(null);
    try {
      const fresh = await refresh();
      if (!fresh.email_verified) setNote({ ok: false, text: 'Not confirmed yet. Open the link in the email, then try again.' });
    } catch {
      setNote({ ok: false, text: "Can't reach the server. You need a connection to continue." });
    } finally {
      setChecking(false);
    }
  }

  async function resend() {
    setSending(true);
    setNote(null);
    try {
      setNote({ ok: true, text: await resendVerification() });
    } catch (err) {
      setNote({
        ok: false,
        text:
          err instanceof ApiError && err.status === 429
            ? 'You’ve asked a few times already. Wait a few minutes and try again.'
            : err instanceof ApiError
              ? err.message
              : "Can't reach the server. You need a connection to send it.",
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.ink }}>
      <LinearGradient colors={['#0a0f1c', '#0f1d45', '#1d4ed8']} locations={[0, 0.5, 1]} start={{ x: 0, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFill} />

      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + Spacing.eight, paddingBottom: insets.bottom + Spacing.six }]}>
        <View style={styles.inner}>
          <View style={[styles.mark, { backgroundColor: c.primary }]}>
            <MailCheck size={22} color="#fff" />
          </View>
          <Text variant="display" tone="inverse" style={{ fontSize: 28, lineHeight: 34, marginTop: Spacing.five }}>
            Confirm your email
          </Text>
          <Text variant="small" style={{ color: '#dbe3f1', marginTop: Spacing.two }}>
            Welcome, {user.name}. We’ve sent a link to {user.email}. Open it on this phone or any computer, then come back and continue.
            Check your spam folder if you can’t see it.
          </Text>

          <View style={{ flexGrow: 1, minHeight: Spacing.six }} />

          <View style={[styles.card, { backgroundColor: c.surface, shadowColor: '#000' }]}>
            {note && (
              <View style={[styles.note, { backgroundColor: note.ok ? c.okSoft : c.criticalSoft }]} accessibilityRole={note.ok ? 'text' : 'alert'}>
                {note.ok ? <CheckCircle2 size={16} color={c.ok} /> : <AlertCircle size={16} color={c.critical} />}
                <Text variant="small" tone={note.ok ? 'ok' : 'critical'} style={{ flex: 1 }}>
                  {note.text}
                </Text>
              </View>
            )}

            <Button label="I’ve confirmed it — continue" size="lg" block loading={checking} onPress={check} />
            <Button label="Send the link again" variant="soft" block loading={sending} onPress={resend} />
            <Button label="Sign out" variant="ghost" block onPress={() => void signOut()} />
          </View>
        </View>
      </ScrollView>
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
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.md,
  },
});
