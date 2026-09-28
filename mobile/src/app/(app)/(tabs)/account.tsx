import Constants from 'expo-constants';
import { Building2, CloudCheck, CloudOff, LogOut, RefreshCw, RotateCcw, Server, Trash2, TriangleAlert } from 'lucide-react-native';
import { ScrollView, StyleSheet, View } from 'react-native';

import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { IconChip, SectionHeader } from '@/components/ui/misc';
import { Text } from '@/components/ui/text';
import { MaxContentWidth, Radius, Spacing, TabBarInset } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { API_URL } from '@/lib/config';
import { confirm } from '@/lib/confirm';
import { ROLE_LABEL, initials, timeAgo } from '@/lib/format';
import { describe, removeItem, retryItem, useOutbox } from '@/lib/offlineQueue';
import { useFacility } from '@/lib/queries';
import { useFacilityId, useSession, useUser } from '@/lib/session';
import { requestSync, useSyncState } from '@/lib/sync';

export default function Account() {
  const c = useTheme();
  const user = useUser();
  const facility = useFacility(useFacilityId());
  const { signOut } = useSession();
  const outbox = useOutbox();
  const { online, running, lastSyncedAt } = useSyncState();
  const waiting = outbox.filter((i) => i.status !== 'failed').length;

  async function onSignOut() {
    if (outbox.length > 0) {
      const ok = await confirm(
        'Discard unsynced entries?',
        `${outbox.length} ${outbox.length === 1 ? 'entry has' : 'entries have'} not reached the server. Signing out deletes ${outbox.length === 1 ? 'it' : 'them'} from this phone.`,
        'Sign out anyway',
      );
      if (!ok) return;
    }
    await signOut();
  }

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={styles.scroll}>
      <PageHeader eyebrow="Account" title="You & sync" />
      <View style={styles.body}>
        <Card style={styles.profile}>
          <View style={[styles.avatar, { backgroundColor: c.primary }]}>
            <Text variant="heading" tone="inverse">
              {initials(user.name)}
            </Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="heading">{user.name}</Text>
            <Text variant="small" tone="muted">
              {user.email}
            </Text>
            <View style={{ marginTop: 4 }}>
              <Badge label={ROLE_LABEL[user.role]} tone="notice" dot={false} />
            </View>
          </View>
        </Card>

        <Card style={styles.facility}>
          <IconChip icon={Building2} tone="ink" />
          <View style={{ flex: 1 }}>
            <Text variant="label">{facility.data?.name ?? '—'}</Text>
            <Text variant="caption" tone="muted">
              {facility.data ? `${facility.data.lga.name} LGA · ${facility.data.state.name} State` : user.node.path.join(' › ')}
            </Text>
          </View>
        </Card>

        <View>
          <SectionHeader title="Sync" />
          <Card style={{ gap: Spacing.four }}>
            <View style={styles.syncHead}>
              <IconChip icon={online ? CloudCheck : CloudOff} tone={online ? 'ok' : 'warning'} />
              <View style={{ flex: 1 }}>
                <Text variant="label">{online ? 'Online' : 'Offline'}</Text>
                <Text variant="caption" tone="muted">
                  {outbox.length === 0
                    ? `Everything is synced${lastSyncedAt ? ` · last sync ${timeAgo(lastSyncedAt)}` : ''}`
                    : `${waiting} waiting · entries sync automatically when you're online`}
                </Text>
              </View>
            </View>
            <Button label={running ? 'Syncing…' : 'Sync now'} icon={RefreshCw} variant="soft" loading={running} disabled={!outbox.length} onPress={requestSync} />

            {outbox.map((i) => (
              <View key={i.id} style={[styles.item, { borderColor: i.status === 'failed' ? c.criticalSoft : c.border, backgroundColor: i.status === 'failed' ? c.criticalSoft : c.surface2 }]}>
                <View style={styles.itemTop}>
                  <View style={{ flex: 1 }}>
                    <Text variant="label" numberOfLines={1}>
                      {describe(i).title}
                    </Text>
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                      {describe(i).figure} · {describe(i).detail}
                    </Text>
                  </View>
                  <Badge label={i.status === 'failed' ? 'Not accepted' : i.status === 'syncing' ? 'Syncing' : 'Waiting'} tone={i.status === 'failed' ? 'critical' : 'warning'} />
                </View>
                {i.status === 'failed' && (
                  <>
                    <View style={styles.reason}>
                      <TriangleAlert size={14} color={c.critical} />
                      <Text variant="caption" tone="critical" style={{ flex: 1 }}>
                        {i.error}
                      </Text>
                    </View>
                    <View style={styles.itemActions}>
                      <Button
                        label="Discard"
                        icon={Trash2}
                        variant="danger"
                        size="sm"
                        onPress={async () => {
                          if (await confirm('Discard this entry?', 'It will not be recorded on the Stock Card.', 'Discard')) void removeItem(i.id);
                        }}
                      />
                      <Button
                        label="Retry"
                        icon={RotateCcw}
                        variant="ghost"
                        size="sm"
                        onPress={() => {
                          void retryItem(i.id).then(requestSync);
                        }}
                      />
                    </View>
                  </>
                )}
              </View>
            ))}
          </Card>
        </View>

        <Card style={styles.facility}>
          <IconChip icon={Server} />
          <View style={{ flex: 1 }}>
            <Text variant="label">Server</Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {API_URL}
            </Text>
          </View>
          <Text variant="caption" tone="muted">
            v{Constants.expoConfig?.version ?? '1.0.0'}
          </Text>
        </Card>

        <Button label="Sign out" icon={LogOut} variant="ghost" size="lg" block onPress={() => void onSignOut()} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingBottom: TabBarInset + Spacing.four,
  },
  body: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.five,
    gap: Spacing.five,
  },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  facility: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  syncHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  item: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  itemTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  reason: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'flex-start',
  },
  itemActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.two,
  },
});
