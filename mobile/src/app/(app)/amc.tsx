import { router, useLocalSearchParams } from 'expo-router';
import { CloudOff, Gauge, Save, Search } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, Loading } from '@/components/ui/misc';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatQty, unitDescription } from '@/lib/format';
import { enqueue, useOutbox } from '@/lib/offlineQueue';
import { useProductLevels } from '@/lib/queries';
import { useFacilityId } from '@/lib/session';
import { requestSync, useSyncState } from '@/lib/sync';

/** "12.5" → 12.5; blank → null; anything else → NaN. */
const parse = (s: string) => (s.trim() === '' ? null : /^\d+(\.\d+)?$/.test(s.trim()) ? Number(s.trim()) : NaN);
const show = (n: number | null | undefined) => (n == null ? '' : String(n));

/**
 * Starting AMCs: how much of each product this facility expects to issue a
 * month, for a facility new to the system. Reorder suggestions use it until
 * there are 3 full months of records here to work one out. Saved to the
 * outbox like every other write, so it works offline.
 */
export default function StartingAmcs() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const facilityId = useFacilityId();
  const { online } = useSyncState();
  const levels = useProductLevels(facilityId);
  const outbox = useOutbox();
  const focus = Number(useLocalSearchParams<{ productId?: string }>().productId) || null;
  const [query, setQuery] = useState('');
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});

  // What each product holds now: an AMC still waiting to sync wins over the server's.
  const waiting = useMemo(() => {
    const m = new Map<number, number | null>();
    for (const i of outbox) if (i.kind === 'amc' && i.facilityId === facilityId) m.set(i.productId, i.body.amc_quantity);
    return m;
  }, [outbox, facilityId]);

  if (levels.isPending) return <Loading />;
  if (levels.isError)
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <PageHeader back title="Starting AMCs" />
        <EmptyState icon={CloudOff} title="Can’t load your products" body="Connect to the internet once to load them; after that this works offline." />
      </View>
    );

  const current = (productId: number, entered: number | null) => (waiting.has(productId) ? waiting.get(productId)! : entered);
  const q = query.trim().toLowerCase();
  const rows = levels.data
    .filter((r) => r.product.is_active || r.entered_amc !== null)
    .filter((r) => !q || r.product.name.toLowerCase().includes(q) || r.product.sku.toLowerCase().includes(q) || r.product.category.toLowerCase().includes(q))
    // The product opened from its own screen comes first.
    .sort((a, b) => Number(b.product.id === focus) - Number(a.product.id === focus));
  const changed = levels.data.filter(
    (r) => drafts[r.product.id] !== undefined && parse(drafts[r.product.id]) !== current(r.product.id, r.entered_amc),
  );
  const enteredCount = levels.data.filter((r) => current(r.product.id, r.entered_amc) !== null).length;

  function save() {
    const e: Record<number, string> = {};
    for (const r of changed) if (Number.isNaN(parse(drafts[r.product.id]))) e[r.product.id] = 'A number, e.g. 40 or 12.5';
    setErrors(e);
    if (Object.keys(e).length || changed.length === 0) return;

    for (const r of changed) {
      enqueue({
        kind: 'amc',
        facilityId,
        productId: r.product.id,
        productName: r.product.name,
        unit: r.product.unit_of_measure,
        body: { amc_quantity: parse(drafts[r.product.id]) },
      });
    }
    requestSync();
    toast({
      kind: online ? 'success' : 'queued',
      title: `Starting AMC saved for ${changed.length} product${changed.length === 1 ? '' : 's'}`,
      body: online ? 'Reorder suggestions use it from now on.' : 'You’re offline — it will send automatically.',
    });
    router.back();
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior="padding">
      <ScrollView contentContainerStyle={{ paddingBottom: 140 + insets.bottom }} keyboardShouldPersistTaps="handled">
        <PageHeader
          back
          eyebrow="Starting AMCs"
          title="Monthly use"
          subtitle="New to the system? Enter how much of each product you issue in a month. Reorder suggestions use it until there are 3 full months of records here."
        />
        <View style={styles.body}>
          <TextField icon={Search} value={query} onChangeText={setQuery} placeholder="Search name, code or category" autoCorrect={false} />
          <Text variant="caption" tone="muted">
            {enteredCount === 0 ? 'No starting AMC entered yet.' : `Entered for ${enteredCount} of ${levels.data.length} products.`} Leave a
            box empty to use the AMC worked out from your records.
          </Text>

          {rows.length === 0 && (
            <Text variant="small" tone="muted">
              No products match that search.
            </Text>
          )}
          {rows.map((r) => {
            const p = r.product;
            const now = current(p.id, r.entered_amc);
            const pending = waiting.has(p.id);
            return (
              <Card key={p.id} style={[styles.row, p.id === focus && { borderColor: c.primary }]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="label" numberOfLines={2}>
                    {p.name}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {p.sku} · {unitDescription(p)} a month
                  </Text>
                  {pending && <Badge label={now === null ? 'Clearing — waiting to sync' : `${formatQty(now)} — waiting to sync`} tone="warning" />}
                </View>
                <TextField
                  value={drafts[p.id] ?? show(now)}
                  onChangeText={(t) => setDrafts({ ...drafts, [p.id]: t.replace(/[^0-9.]/g, '') })}
                  keyboardType="decimal-pad"
                  placeholder="—"
                  accessibilityLabel={`Starting AMC of ${p.name}`}
                  error={errors[p.id]}
                  style={{ width: 92, textAlign: 'right' }}
                />
              </Card>
            );
          })}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.three, backgroundColor: c.surface, borderColor: c.border }]}>
        <View style={styles.footerInner}>
          {!online && <Badge label="Offline — sends when you’re back online" tone="warning" />}
          <Button
            label={changed.length ? `Save ${changed.length} change${changed.length === 1 ? '' : 's'}` : 'No changes'}
            icon={changed.length ? Save : Gauge}
            size="lg"
            block
            disabled={changed.length === 0}
            onPress={save}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  body: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.five,
    gap: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: Radius.lg,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.three,
    paddingHorizontal: Spacing.five,
  },
  footerInner: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.two,
    alignItems: 'center',
  },
});
