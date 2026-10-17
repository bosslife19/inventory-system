import { router } from 'expo-router';
import { Send, Trash2, X } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProductSearch } from '@/components/product-search';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip, ChipRow } from '@/components/ui/chip';
import { Loading } from '@/components/ui/misc';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatQty, unitDescription } from '@/lib/format';
import { enqueue } from '@/lib/offlineQueue';
import { useProducts, useReorderSuggestions, useReorderSuppliers, useStockBalances } from '@/lib/queries';
import { useFacilityId } from '@/lib/session';
import { requestSync, useSyncState } from '@/lib/sync';
import type { Product } from '@/lib/types';

interface Line {
  product: Product;
  quantity: string;
  suggested?: number;
}

/**
 * Ask a store above for stock. Starts from the reorder suggestions (what's
 * needed to get back to the max level); saved to the outbox like every other
 * write, so it can be made offline and is sent when there's signal.
 */
export default function Reorder() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const facilityId = useFacilityId();
  const { online } = useSyncState();
  const suppliers = useReorderSuppliers(facilityId);
  const products = useProducts();
  const stock = useStockBalances(facilityId);
  const suggestions = useReorderSuggestions(facilityId);
  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [lines, setLines] = useState<Line[] | null>(null);
  const [comments, setComments] = useState('');
  const [adding, setAdding] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (suppliers.isPending || suggestions.isPending) return <Loading />;

  const current =
    lines ??
    (suggestions.data ?? [])
      .filter((s) => s.suggested_quantity > 0)
      .map((s) => ({ product: s.product, quantity: String(s.suggested_quantity), suggested: s.suggested_quantity }));
  const supplier = suppliers.data?.find((s) => s.id === supplierId) ?? suppliers.data?.[0];
  const setLine = (i: number, patch: Partial<Line>) => setLines(current.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  function save() {
    const e: Record<string, string> = {};
    if (!supplier) e.supplier = suppliers.isError ? 'Connect once to load the stores you can ask.' : 'Choose the store to ask.';
    if (current.length === 0) e.lines = 'Add at least one product.';
    current.forEach((l, i) => {
      const q = Number(l.quantity);
      if (!l.quantity || !Number.isInteger(q) || q < 1) e[`q${i}`] = 'Whole number above 0.';
    });
    setErrors(e);
    if (Object.keys(e).length || !supplier) return;

    enqueue({
      kind: 'reorder_request',
      facilityId,
      supplierName: supplier.name,
      body: {
        supplier_facility_id: supplier.id,
        comments: comments.trim() || null,
        items: current.map((l) => ({ product_id: l.product.id, quantity: Number(l.quantity) })),
      },
    });
    requestSync();
    toast({
      kind: online ? 'success' : 'queued',
      title: `Request sent to ${supplier.name}`,
      body: online ? 'Their officers are notified. You’ll hear when it’s on its way.' : 'You’re offline — it will send automatically.',
    });
    router.back();
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior="padding">
      <View style={[styles.header, { paddingTop: Platform.OS === 'ios' ? Spacing.four : insets.top + Spacing.three, borderColor: c.border, backgroundColor: c.surface }]}>
        <View style={{ flex: 1 }}>
          <Text variant="eyebrow" tone="primary">
            Reorder request
          </Text>
          <Text variant="title">Request stock</Text>
        </View>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} style={[styles.close, { backgroundColor: c.surface2 }]}>
          <X size={20} color={c.text} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.section}>
          <Text variant="label" tone="secondary">
            Ask
          </Text>
          <ChipRow>
            {(suppliers.data ?? []).map((s) => (
              <Chip key={s.id} label={s.name} selected={s.id === supplier?.id} onPress={() => setSupplierId(s.id)} />
            ))}
          </ChipRow>
          {errors.supplier && (
            <Text variant="caption" tone="critical">
              {errors.supplier}
            </Text>
          )}
        </View>

        <View style={styles.section}>
          <Text variant="label" tone="secondary">
            Products
          </Text>
          {current.length === 0 && (
            <Text variant="small" tone="muted">
              Nothing is below its level right now — add what you need.
            </Text>
          )}
          {current.map((l, i) => (
            <Card key={l.product.id} style={styles.line}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="label" numberOfLines={2}>
                  {l.product.name}
                </Text>
                <Text variant="caption" tone="muted">
                  {unitDescription(l.product)}
                  {l.suggested ? ` · suggested ${formatQty(l.suggested)}` : ''}
                </Text>
              </View>
              <TextField
                value={l.quantity}
                onChangeText={(t) => setLine(i, { quantity: t.replace(/[^0-9]/g, '') })}
                keyboardType="number-pad"
                accessibilityLabel={`Quantity of ${l.product.name}`}
                error={errors[`q${i}`]}
                style={{ width: 92 }}
              />
              <Pressable onPress={() => setLines(current.filter((_, j) => j !== i))} accessibilityRole="button" accessibilityLabel={`Remove ${l.product.name}`} hitSlop={8}>
                <Trash2 size={18} color={c.muted} />
              </Pressable>
            </Card>
          ))}
          {errors.lines && (
            <Text variant="caption" tone="critical">
              {errors.lines}
            </Text>
          )}
          {adding ? (
            <ProductSearch
              products={(products.data ?? []).filter((p) => !current.some((l) => l.product.id === p.id))}
              stock={stock.data}
              autoFocus
              onPick={(p) => {
                setLines([...current, { product: p, quantity: '' }]);
                setAdding(false);
              }}
            />
          ) : (
            <Button label="Add a product" variant="soft" onPress={() => setAdding(true)} />
          )}
        </View>

        <View style={styles.section}>
          <TextField label="Comments (optional)" value={comments} onChangeText={setComments} placeholder="e.g. Malaria season — demand is up" />
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.three, backgroundColor: c.surface, borderColor: c.border }]}>
        <View style={styles.footerInner}>
          {!online && <Badge label="Offline — sends when you’re back online" tone="warning" />}
          <Button label="Send request" icon={Send} size="lg" block onPress={save} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.five,
    paddingBottom: Spacing.four,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  close: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.five,
    gap: Spacing.six,
    paddingBottom: Spacing.eight * 2,
  },
  section: {
    gap: Spacing.three,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: Radius.lg,
  },
  footer: {
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
