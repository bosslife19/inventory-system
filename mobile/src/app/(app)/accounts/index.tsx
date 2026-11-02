import { router } from 'expo-router';
import { CloudOff, KeyRound, Search, Share2, UserCheck, UserPlus, UserRound, UserX } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, RefreshControl, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip, ChipRow, Segmented } from '@/components/ui/chip';
import { EmptyState, Loading } from '@/components/ui/misc';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { isNetworkError } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { ROLE_LABEL } from '@/lib/format';
import { useResetPassword, useUpdateUser, useUsers } from '@/lib/queries';
import { manageableRoles } from '@/lib/roles';
import { useUser } from '@/lib/session';
import type { User, UserRole } from '@/lib/types';

/**
 * The accounts this user manages (admins: everyone; officers: the level
 * below in their area). Reset a password or deactivate / reactivate here;
 * every action needs a connection and the API re-checks it.
 */
export default function Accounts() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const me = useUser();
  const roles = manageableRoles(me);
  const [draft, setDraft] = useState('');
  const [q, setQ] = useState('');
  const [role, setRole] = useState<UserRole | 'all'>('all');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [open, setOpen] = useState<number | null>(null);
  const users = useUsers({ q, role: role === 'all' ? undefined : role, is_active: status === 'active' });
  const rows = users.data?.data ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <FlatList
        data={rows}
        keyExtractor={(u) => String(u.id)}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + Spacing.eight }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={users.isRefetching} onRefresh={() => void users.refetch()} tintColor={c.primary} />}
        ListHeaderComponent={
          <View style={{ gap: Spacing.three, marginBottom: Spacing.four }}>
            <PageHeader
              back
              eyebrow="Administration"
              title="Accounts"
              subtitle={me.role === 'admin' ? 'Every account in your organization.' : `${roles.map((r) => ROLE_LABEL[r]).join(', ')} accounts in your area.`}
              right={<Button label="Add" icon={UserPlus} size="sm" onPress={() => router.push('/accounts/new')} />}
            />
            <View style={[styles.pad, { gap: Spacing.three }]}>
              <TextField
                icon={Search}
                placeholder="Name or email…"
                value={draft}
                onChangeText={setDraft}
                onSubmitEditing={() => setQ(draft.trim())}
                onEndEditing={() => setQ(draft.trim())}
                returnKeyType="search"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Segmented
                value={status}
                onChange={setStatus}
                options={[
                  { value: 'active', label: 'Active' },
                  { value: 'inactive', label: 'Deactivated' },
                ]}
              />
            </View>
            {roles.length > 1 && (
              <ChipRow>
                <Chip label="All roles" selected={role === 'all'} onPress={() => setRole('all')} />
                {roles.map((r) => (
                  <Chip key={r} label={ROLE_LABEL[r]} selected={role === r} onPress={() => setRole(r)} />
                ))}
              </ChipRow>
            )}
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: Spacing.three }} />}
        renderItem={({ item }) => (
          <View style={styles.pad}>
            <AccountCard user={item} open={open === item.id} onToggle={() => setOpen(open === item.id ? null : item.id)} />
          </View>
        )}
        ListEmptyComponent={
          users.isPending ? (
            <Loading />
          ) : users.isError && isNetworkError(users.error) ? (
            <EmptyState icon={CloudOff} title="You're offline" body="Accounts load when you're back online." />
          ) : users.isError ? (
            <EmptyState icon={UserRound} title="Can't load accounts" body={users.error.message} />
          ) : (
            <EmptyState icon={UserRound} title="No accounts" body={q || role !== 'all' ? 'Try another search or role.' : status === 'active' ? 'Add the first one with the Add button.' : 'Nobody has been deactivated.'} />
          )
        }
      />
    </View>
  );
}

function AccountCard({ user: u, open, onToggle }: { user: User; open: boolean; onToggle: () => void }) {
  const c = useTheme();
  const toast = useToast();
  const update = useUpdateUser();
  const reset = useResetPassword();
  const [password, setPassword] = useState<string | null>(null);
  const busy = update.isPending || reset.isPending;
  const fail = (err: Error) => toast({ kind: 'error', title: isNetworkError(err) ? 'You’re offline' : 'Not done', body: isNetworkError(err) ? 'Try again when you have a connection.' : err.message });

  async function onReset() {
    if (!(await confirm('Reset password?', `${u.name} will be signed out everywhere and must choose a new password with the temporary one.`, 'Reset'))) return;
    reset.mutate(u.id, { onSuccess: (res) => setPassword(res.temporary_password), onError: fail });
  }

  async function onToggleActive() {
    const deactivate = u.is_active;
    if (deactivate && !(await confirm('Deactivate account?', `${u.name} is signed out everywhere and can’t sign in until reactivated. Their history is kept.`, 'Deactivate'))) return;
    update.mutate(
      { id: u.id, body: { is_active: !deactivate } },
      { onSuccess: () => toast({ kind: 'success', title: deactivate ? 'Account deactivated' : 'Account reactivated' }), onError: fail },
    );
  }

  return (
    <Card onPress={onToggle} style={{ gap: Spacing.two }} accessibilityLabel={`${u.name}, ${ROLE_LABEL[u.role]}`}>
      <View style={styles.row}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="label">{u.name}</Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {u.email}
          </Text>
        </View>
        <Badge label={ROLE_LABEL[u.role]} tone="notice" dot={false} />
      </View>
      <Text variant="caption" tone="secondary" numberOfLines={1}>
        {u.node.path.join(' › ')}
      </Text>

      {password && (
        <View style={[styles.password, { backgroundColor: c.primarySoft }]}>
          <Text variant="caption" tone="secondary">
            Temporary password — shown only now. Give it to {u.name.split(' ')[0]}; they choose their own at first sign-in.
          </Text>
          <Text variant="mono" weight="semibold" selectable style={{ fontSize: 20, lineHeight: 26, color: c.text }}>
            {password}
          </Text>
          <Button
            label="Share"
            icon={Share2}
            variant="ghost"
            size="sm"
            onPress={() => void Share.share({ message: `Sign in as ${u.email} with the temporary password ${password}` })}
          />
        </View>
      )}

      {open && (
        <View style={styles.actions}>
          {u.is_active && <Button label="Reset password" icon={KeyRound} variant="ghost" size="sm" disabled={busy} onPress={() => void onReset()} />}
          <Button
            label={u.is_active ? 'Deactivate' : 'Reactivate'}
            icon={u.is_active ? UserX : UserCheck}
            variant={u.is_active ? 'danger' : 'soft'}
            size="sm"
            loading={update.isPending}
            disabled={busy}
            onPress={() => void onToggleActive()}
          />
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  list: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  pad: {
    paddingHorizontal: Spacing.five,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  password: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.md,
  },
});
