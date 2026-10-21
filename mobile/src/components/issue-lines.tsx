import { Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatQty, unitDescription } from '@/lib/format';
import type { BatchStock, Product, ProductStock } from '@/lib/types';

import { ProductSearch } from './product-search';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Chip, ChipRow } from './ui/chip';
import { Text } from './ui/text';
import { TextField } from './ui/text-field';

/** One line a store issues: a product, its batch (batch-tracked products) and how many. */
export interface IssueLine {
  product: Product;
  batchNo: string;
  quantity: string;
  /** What was asked for, when fulfilling a request. */
  requested?: number;
}

/** Batches that can go out, earliest expiry first (FEFO), never expired stock. */
function issuable(stock: ProductStock | undefined): BatchStock[] {
  return (stock?.batches ?? []).filter((b) => b.batch_no !== null && b.quantity_on_hand > 0 && b.expiry_status !== 'expired');
}

export function newIssueLine(product: Product, stock: ProductStock[] | undefined, quantity = '', requested?: number): IssueLine {
  const own = stock?.find((s) => s.product.id === product.id);
  return { product, batchNo: product.requires_batch_tracking ? (issuable(own)[0]?.batch_no ?? '') : '', quantity, requested };
}

/**
 * Check lines against this store's last known stock (the server checks again
 * when it syncs) and build the API items. Errors are keyed `q{i}` / `b{i}`.
 */
export function checkIssueLines(lines: IssueLine[], stock: ProductStock[] | undefined) {
  const errors: Record<string, string> = {};
  if (lines.length === 0) errors.lines = 'Add at least one product.';
  lines.forEach((l, i) => {
    const q = Number(l.quantity);
    const own = stock?.find((s) => s.product.id === l.product.id);
    if (!l.quantity || !Number.isInteger(q) || q < 1) {
      errors[`q${i}`] = 'Whole number above 0.';
    } else if (l.product.requires_batch_tracking) {
      const batch = issuable(own).find((b) => b.batch_no === l.batchNo);
      if (!l.batchNo) errors[`b${i}`] = 'Choose the batch to send.';
      else if (batch && q > batch.quantity_on_hand) errors[`q${i}`] = `Only ${formatQty(batch.quantity_on_hand)} in batch ${l.batchNo}.`;
    } else if (own && q > own.usable_quantity) {
      errors[`q${i}`] = `Only ${formatQty(own.usable_quantity)} usable here.`;
    }
  });
  const items = lines.map((l) => ({
    product_id: l.product.id,
    batch_no: l.product.requires_batch_tracking ? l.batchNo : null,
    quantity: Number(l.quantity),
  }));
  return { errors, items };
}

interface Props {
  lines: IssueLine[];
  onChange: (lines: IssueLine[]) => void;
  stock: ProductStock[] | undefined;
  products: Product[] | undefined;
  errors: Record<string, string>;
}

/** Edit the lines a store sends out: batch chips from what it holds, quantity, add / remove. */
export function IssueLines({ lines, onChange, stock, products, errors }: Props) {
  const c = useTheme();
  const [adding, setAdding] = useState(false);
  const setLine = (i: number, patch: Partial<IssueLine>) => onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  // Only what this store has usable stock of can go out.
  const inStock = (products ?? []).filter(
    (p) => !lines.some((l) => l.product.id === p.id) && (stock?.find((s) => s.product.id === p.id)?.usable_quantity ?? 0) > 0,
  );

  return (
    <View style={{ gap: Spacing.three }}>
      {lines.map((l, i) => {
        const own = stock?.find((s) => s.product.id === l.product.id);
        const batches = issuable(own);
        return (
          <Card key={l.product.id} style={styles.line}>
            <View style={styles.row}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="label" numberOfLines={2}>
                  {l.product.name}
                </Text>
                <Text variant="caption" tone={own && own.usable_quantity > 0 ? 'muted' : 'critical'}>
                  {unitDescription(l.product)} · {formatQty(own?.usable_quantity ?? 0)} usable here
                  {l.requested !== undefined ? ` · asked for ${formatQty(l.requested)}` : ''}
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
              <Pressable
                onPress={() => onChange(lines.filter((_, j) => j !== i))}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${l.product.name}`}
                hitSlop={8}>
                <Trash2 size={18} color={c.muted} />
              </Pressable>
            </View>
            {l.product.requires_batch_tracking && (
              <View style={{ gap: Spacing.two }}>
                {batches.length > 0 ? (
                  <ChipRow>
                    {batches.map((b) => (
                      <Chip
                        key={b.batch_id}
                        label={`${b.batch_no} · ${formatQty(b.quantity_on_hand)}`}
                        selected={l.batchNo === b.batch_no}
                        onPress={() => setLine(i, { batchNo: b.batch_no ?? '' })}
                      />
                    ))}
                  </ChipRow>
                ) : (
                  <Text variant="caption" tone="critical">
                    No unexpired batch of this product in stock here.
                  </Text>
                )}
                {errors[`b${i}`] && (
                  <Text variant="caption" tone="critical">
                    {errors[`b${i}`]}
                  </Text>
                )}
              </View>
            )}
          </Card>
        );
      })}
      {errors.lines && (
        <Text variant="caption" tone="critical">
          {errors.lines}
        </Text>
      )}
      {adding ? (
        <ProductSearch
          products={inStock}
          stock={stock}
          autoFocus
          onPick={(p) => {
            onChange([...lines, newIssueLine(p, stock)]);
            setAdding(false);
          }}
        />
      ) : (
        <Button label="Add a product" variant="soft" onPress={() => setAdding(true)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  line: {
    gap: Spacing.three,
    borderRadius: Radius.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
});
