import { router } from 'expo-router';
import { Check, ChevronDown, Search, Share2, UserPlus } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, Share, StyleSheet, View } from 'react-native';

import { Sheet, SheetSection } from '@/components/sheet';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, isNetworkError } from '@/lib/api';
import { ROLE_LABEL } from '@/lib/format';
import { useCreateUser, useLgaFacilities, useLgas, useStates } from '@/lib/queries';
import { manageableRoles } from '@/lib/roles';
import { useUser } from '@/lib/session';
import type { User, UserRole } from '@/lib/types';

/**
 * Add an account. The roles offered and the places they can be anchored
 * follow what the API allows the signed-in user (one level down, in their own
 * area); the API re-checks everything, including the plan's account limits.
 * Needs a connection: the temporary password comes back from the server.
 */
export default function NewAccount() {
  const me = useUser();
  const roles = manageableRoles(me);
  const create = useCreateUser();

  // Officers are fixed to their own area; admins and federal officers pick.
  const ownState = me.role === 'state_officer' ? me.state_id : null;
  const ownLga = me.role === 'lga_officer' ? me.lga_id : null;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>(roles[0]);
  const [stateId, setStateId] = useState<number | null>(ownState);
  const [lgaId, setLgaId] = useState<number | null>(ownLga);
  const [facilityId, setFacilityId] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<{ user: User; password: string } | null>(null);

  const needsState = role === 'state_officer' || ((role === 'lga_officer' || role === 'sdp_staff') && !ownState && !ownLga);
  const needsLga = (role === 'lga_officer' || role === 'sdp_staff') && !ownLga;
  const states = useStates();
  const lgas = useLgas(needsLga ? stateId : null);
  const facilities = useLgaFacilities(role === 'sdp_staff' ? lgaId : null);

  if (created) return <Created user={created.user} password={created.password} />;

  function submit() {
    const body = {
      name: name.trim(),
      email: email.trim(),
      role,
      state_id: role === 'state_officer' ? stateId : null,
      lga_id: role === 'lga_officer' ? lgaId : null,
      facility_id: role === 'sdp_staff' ? facilityId : null,
    };
    const found: Record<string, string> = {};
    if (!body.name) found.name = 'Enter their name.';
    if (!/^\S+@\S+\.\S+$/.test(body.email)) found.email = 'Enter a valid email address.';
    if (role === 'state_officer' && !body.state_id) found.state_id = 'Choose the state.';
    if (role === 'lga_officer' && !body.lga_id) found.lga_id = 'Choose the LGA.';
    if (role === 'sdp_staff' && !body.facility_id) found.facility_id = 'Choose the facility.';
    setErrors(found);
    if (Object.keys(found).length) return;

    create.mutate(body, {
      onSuccess: (res) => setCreated({ user: res.data, password: res.temporary_password }),
      onError: (err) => {
        if (isNetworkError(err)) return setErrors({ general: 'You’re offline. Adding an account needs a connection.' });
        const fields = err instanceof ApiError ? Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, v[0]])) : {};
        // 402 (plan limit) and 403 come with a message only.
        setErrors(Object.keys(fields).length ? fields : { general: err.message });
      },
    });
  }

  const shownErrors = Object.entries(errors).filter(([k]) => !['name', 'email', 'state_id', 'lga_id', 'facility_id'].includes(k));

  return (
    <Sheet
      eyebrow="Accounts"
      title="Add an account"
      footer={<Button label="Add account" icon={UserPlus} size="lg" block loading={create.isPending} onPress={submit} />}>
      <SheetSection>
        <TextField label="Full name" value={name} onChangeText={setName} error={errors.name} autoComplete="off" />
        <TextField
          label="Email"
          hint="They sign in with this; their sign-in details are emailed to them"
          value={email}
          onChangeText={setEmail}
          error={errors.email}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </SheetSection>

      {roles.length > 1 && (
        <SheetSection label="Role">
          <View style={styles.chips}>
            {roles.map((r) => (
              <Chip
                key={r}
                label={ROLE_LABEL[r]}
                selected={r === role}
                onPress={() => {
                  setRole(r);
                  setFacilityId(null);
                }}
              />
            ))}
          </View>
        </SheetSection>
      )}

      {needsState && (
        <SheetSection label="State">
          <Picker
            placeholder="Choose the state"
            value={stateId}
            options={states.data?.map((s) => ({ id: s.id, name: s.name })) ?? []}
            loading={states.isPending}
            error={errors.state_id}
            onChange={(id) => {
              setStateId(id);
              setLgaId(null);
              setFacilityId(null);
            }}
          />
        </SheetSection>
      )}

      {needsLga && (
        <SheetSection label="LGA">
          <Picker
            placeholder={stateId ? 'Choose the LGA' : 'Choose a state first'}
            value={lgaId}
            disabled={!stateId}
            options={lgas.data?.map((l) => ({ id: l.id, name: l.name })) ?? []}
            loading={lgas.isFetching}
            error={errors.lga_id}
            onChange={(id) => {
              setLgaId(id);
              setFacilityId(null);
            }}
          />
        </SheetSection>
      )}

      {role === 'sdp_staff' && (
        <SheetSection label="Facility">
          <Picker
            placeholder={lgaId ? 'Choose the facility' : 'Choose an LGA first'}
            value={facilityId}
            disabled={!lgaId}
            options={facilities.data?.filter((f) => f.is_active).map((f) => ({ id: f.id, name: f.name })) ?? []}
            loading={facilities.isFetching}
            error={errors.facility_id}
            onChange={setFacilityId}
          />
        </SheetSection>
      )}

      {shownErrors.map(([k, message]) => (
        <Text key={k} variant="small" tone="critical">
          {message}
        </Text>
      ))}
    </Sheet>
  );
}

interface PickerProps {
  placeholder: string;
  value: number | null;
  options: { id: number; name: string }[];
  onChange: (id: number) => void;
  loading?: boolean;
  disabled?: boolean;
  error?: string;
}

/** A tap-to-open, searchable list (states and LGAs run to dozens). */
function Picker({ placeholder, value, options, onChange, loading, disabled, error }: PickerProps) {
  const c = useTheme();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const selected = options.find((o) => o.id === value);
  const shown = options.filter((o) => o.name.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <View style={{ gap: Spacing.two }}>
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={() => setOpen(!open)}
        style={[styles.field, { backgroundColor: c.surface, borderColor: error ? c.critical : c.borderStrong, opacity: disabled ? 0.5 : 1 }]}>
        <Text variant="body" tone={selected ? 'default' : 'muted'} style={{ flex: 1 }}>
          {selected?.name ?? (loading && !disabled ? 'Loading…' : placeholder)}
        </Text>
        <ChevronDown size={18} color={c.muted} />
      </Pressable>
      {error && (
        <Text variant="caption" tone="critical">
          {error}
        </Text>
      )}
      {open && !disabled && (
        <Card padded={false} style={{ overflow: 'hidden' }}>
          {options.length > 8 && (
            <View style={{ padding: Spacing.three }}>
              <TextField icon={Search} placeholder="Search…" value={q} onChangeText={setQ} autoCorrect={false} />
            </View>
          )}
          {shown.slice(0, 50).map((o) => (
            <Pressable
              key={o.id}
              onPress={() => {
                onChange(o.id);
                setOpen(false);
                setQ('');
              }}
              style={({ pressed }) => [styles.option, { borderColor: c.border, backgroundColor: pressed ? c.surface2 : 'transparent' }]}>
              <Text variant="body" style={{ flex: 1 }}>
                {o.name}
              </Text>
              {o.id === value && <Check size={18} color={c.primary} />}
            </Pressable>
          ))}
          {shown.length === 0 && (
            <Text variant="small" tone="muted" style={{ padding: Spacing.four }}>
              {loading ? 'Loading…' : 'Nothing to choose.'}
            </Text>
          )}
        </Card>
      )}
    </View>
  );
}

/** The new account's temporary password, shown once. */
function Created({ user, password }: { user: User; password: string }) {
  const c = useTheme();
  return (
    <Sheet eyebrow="Accounts" title="Account added" footer={<Button label="Done" size="lg" block onPress={() => router.back()} />}>
      <SheetSection>
        <Text variant="body">
          {user.name} ({ROLE_LABEL[user.role]}, {user.node.path.join(' › ')}) can now sign in as {user.email}.
        </Text>
        <View style={[styles.password, { backgroundColor: c.primarySoft }]}>
          <Text variant="caption" tone="secondary">
            Temporary password — shown only now. It’s also emailed to them; they choose their own at first sign-in.
          </Text>
          <Text variant="mono" weight="semibold" selectable style={{ fontSize: 22, lineHeight: 28, color: c.text }}>
            {password}
          </Text>
          <Button
            label="Share"
            icon={Share2}
            variant="ghost"
            size="sm"
            onPress={() => void Share.share({ message: `Sign in as ${user.email} with the temporary password ${password}` })}
          />
        </View>
      </SheetSection>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 50,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  password: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.md,
  },
});
