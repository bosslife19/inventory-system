import { CloudOff, LifeBuoy, SendHorizontal } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PageHeader } from '@/components/page-header';
import { EmptyState, Loading } from '@/components/ui/misc';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { Fonts, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { isNetworkError } from '@/lib/api';
import { useMarkSupportRead, useSendSupportMessage, useSupportThread, useSupportUnread } from '@/lib/queries';
import type { SupportMessage } from '@/lib/types';

const timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' });
const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' });
const dayOf = (m: SupportMessage) => (m.created_at ? dayFmt.format(new Date(m.created_at)) : '');

/**
 * Live chat with the platform's support team. Polls every few seconds while
 * open (no websockets); a reply also arrives as a push that opens this screen.
 * Sending needs a connection — chat isn't queued like Stock Card entries.
 */
export default function Support() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const thread = useSupportThread(true);
  const unread = useSupportUnread().data ?? 0;
  const send = useSendSupportMessage();
  const markRead = useMarkSupportRead();
  const [draft, setDraft] = useState('');
  const list = useRef<FlatList<SupportMessage>>(null);
  const messages = thread.data?.messages ?? [];
  const replies = messages.filter((m) => m.from_support).length;

  // Reading the screen marks replies read — on opening, and as new ones arrive.
  const markReadNow = markRead.mutate;
  useEffect(() => {
    if (unread > 0 || replies > 0) markReadNow();
  }, [unread, replies, markReadNow]);

  function submit() {
    const body = draft.trim();
    if (!body || send.isPending) return;
    send.mutate(body, {
      onSuccess: () => setDraft(''),
      onError: (err) =>
        toast({
          kind: 'error',
          title: isNetworkError(err) ? 'You’re offline' : 'Not sent',
          body: isNetworkError(err) ? 'Your message is still here — send it when you’re back online.' : err.message,
        }),
    });
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior="padding">
      <PageHeader back eyebrow="Help" title="Support" subtitle="Chat with the support team. We usually reply within a few hours." />
      <FlatList
        ref={list}
        data={messages}
        keyExtractor={(m) => String(m.id)}
        style={{ flex: 1 }}
        contentContainerStyle={[styles.list, messages.length === 0 && { flexGrow: 1, justifyContent: 'center' }]}
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
        onLayout={() => list.current?.scrollToEnd({ animated: false })}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item: m, index }) => {
          const mine = !m.from_support;
          const newDay = index === 0 || dayOf(messages[index - 1]) !== dayOf(m);
          return (
            <View>
              {newDay && (
                <Text variant="caption" tone="muted" align="center" style={{ marginVertical: Spacing.two }}>
                  {dayOf(m)}
                </Text>
              )}
              <View style={[styles.row, mine && { alignItems: 'flex-end' }]}>
                {!mine && (index === 0 || newDay || !messages[index - 1].from_support) && (
                  <Text variant="caption" tone="muted" style={{ marginLeft: 4, marginBottom: 2 }}>
                    Support
                  </Text>
                )}
                <View
                  style={[
                    styles.bubble,
                    mine
                      ? { backgroundColor: c.primary, borderBottomRightRadius: 4 }
                      : { backgroundColor: c.surface, borderColor: c.border, borderWidth: StyleSheet.hairlineWidth, borderBottomLeftRadius: 4 },
                  ]}>
                  <Text variant="body" selectable style={{ color: mine ? '#ffffff' : c.text }}>
                    {m.body}
                  </Text>
                  <Text variant="caption" style={{ color: mine ? 'rgba(255,255,255,0.75)' : c.muted, fontSize: 11, alignSelf: 'flex-end' }}>
                    {m.created_at ? timeFmt.format(new Date(m.created_at)) : ''}
                  </Text>
                </View>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          thread.isPending ? (
            <Loading />
          ) : thread.isError && isNetworkError(thread.error) ? (
            <EmptyState icon={CloudOff} title="You're offline" body="Your chat loads when you're back online." />
          ) : (
            <EmptyState icon={LifeBuoy} title="How can we help?" body="Ask about recording stock, deliveries, reports, accounts or your plan." />
          )
        }
      />
      <View style={[styles.compose, { paddingBottom: insets.bottom + Spacing.three, backgroundColor: c.surface, borderColor: c.border }]}>
        <View style={styles.composeInner}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Write a message…"
            placeholderTextColor={c.muted}
            multiline
            maxLength={2000}
            accessibilityLabel="Message"
            style={[styles.input, { color: c.text, backgroundColor: c.surface2, borderColor: c.border }]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send"
            disabled={!draft.trim() || send.isPending}
            onPress={submit}
            style={({ pressed }) => [
              styles.send,
              { backgroundColor: pressed ? c.primaryPressed : c.primary, opacity: !draft.trim() ? 0.5 : 1 },
            ]}>
            {send.isPending ? <ActivityIndicator color="#ffffff" /> : <SendHorizontal size={20} color="#ffffff" />}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  list: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.five,
    paddingBottom: Spacing.four,
  },
  row: {
    alignItems: 'flex-start',
    marginTop: Spacing.two,
  },
  bubble: {
    maxWidth: '82%',
    gap: 2,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 16,
  },
  compose: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  composeInner: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: Spacing.four,
    paddingTop: 11,
    paddingBottom: 11,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    fontFamily: Fonts.regular,
    fontSize: 15,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
