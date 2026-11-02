import Constants from 'expo-constants';
import { router } from 'expo-router';
import {
  BellRing,
  Building2,
  ChevronRight,
  CloudCheck,
  CloudOff,
  FileText,
  ListChecks,
  LogOut,
  MapPinned,
  Monitor,
  RefreshCw,
  RotateCcw,
  Server,
  Trash2,
  TriangleAlert,
  UserCog,
  type LucideIcon,
} from 'lucide-react-native';
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
import { useFacility, useNotifications } from '@/lib/queries';
import { isAreaUser, manageableRoles } from '@/lib/roles';
import { useSession, useUser } from '@/lib/session';
import { requestSync, useSyncState } from '@/lib/sync';

/** Account and sync — for officers and admins also "More": their tools beyond the dashboard. */
export default function Account() {
  const c = useTheme();
  const user = useUser();
  const area = isAreaUser(user);
  const ownFacilityId = user.facility_id ?? user.store?.id ?? null;
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
      <PageHeader eyebrow={area ? 'More' : 'Account'} title={area ? 'Tools & account' : 'You & sync'} />
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

        {ownFacilityId !== null ? (
          <FacilityCard id={ownFacilityId} />
        ) : (
          <Card style={styles.facility}>
            <IconChip icon={MapPinned} tone="ink" />
            <View style={{ flex: 1 }}>
              <Text variant="label">{user.node.name}</Text>
              <Text variant="caption" tone="muted">
                {user.node.path.join(' › ')}
              </Text>
            </View>
          </Card>
        )}

        {area && <Tools />}

        {ownFacilityId !== null && (
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
        )}

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

function FacilityCard({ id }: { id: number }) {
  const user = useUser();
  const facility = useFacility(id);
  return (
    <Card style={styles.facility}>
      <IconChip icon={Building2} tone="ink" />
      <View style={{ flex: 1 }}>
        <Text variant="label">{facility.data?.name ?? '—'}</Text>
        <Text variant="caption" tone="muted">
          {facility.data
            ? [facility.data.lga && `${facility.data.lga.name} LGA`, facility.data.state && `${facility.data.state.name} State`].filter(Boolean).join(' · ') || 'Nigeria'
            : user.node.path.join(' › ')}
        </Text>
      </View>
    </Card>
  );
}

function ToolRow({ icon, title, hint, onPress, tone }: { icon: LucideIcon; title: string; hint: string; onPress: () => void; tone?: 'warning' }) {
  const c = useTheme();
  return (
    <Card onPress={onPress} style={styles.facility}>
      <IconChip icon={icon} tone={tone ?? 'primary'} />
      <View style={{ flex: 1 }}>
        <Text variant="label">{title}</Text>
        <Text variant="caption" tone={tone ?? 'muted'}>
          {hint}
        </Text>
      </View>
      <ChevronRight size={18} color={c.muted} />
    </Card>
  );
}

/** Officers' and admins' tools: the web dashboard's pages that work well on a phone. */
function Tools() {
  const c = useTheme();
  const user = useUser();
  const unread = useNotifications().data?.meta.unread_count ?? 0;
  const manages = manageableRoles(user).length > 0;

  return (
    <View style={{ gap: Spacing.three }}>
      <SectionHeader title="Tools" />
      <ToolRow
        icon={BellRing}
        title="Notifications"
        hint={unread > 0 ? `${unread} unread` : 'Daily digests of new alerts in your area'}
        tone={unread > 0 ? 'warning' : undefined}
        onPress={() => router.push('/notifications')}
      />
      <ToolRow icon={FileText} title="Reports" hint="Stock status, movement, reorder and expiry for your area" onPress={() => router.push('/reports')} />
      <ToolRow icon={ListChecks} title="Activity log" hint="Who recorded, confirmed or changed what" onPress={() => router.push('/activity')} />
      {manages && <ToolRow icon={UserCog} title="Accounts" hint="Add people, reset passwords, deactivate" onPress={() => router.push('/accounts')} />}
      <View style={[styles.webNote, { backgroundColor: c.surface2 }]}>
        <Monitor size={16} color={c.muted} />
        <Text variant="caption" tone="muted" style={{ flex: 1 }}>
          Products, stock levels, CSV imports{user.role === 'admin' ? ', facilities and billing' : ''} are on the web dashboard.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  webNote: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'flex-start',
    padding: Spacing.three,
    borderRadius: Radius.md,
  },
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
