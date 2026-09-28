import { Search } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatQty } from '@/lib/format';
import type { Product, ProductStock } from '@/lib/types';

import { Card } from './ui/card';
import { Text } from './ui/text';
import { TextField } from './ui/text-field';

interface Props {
  products: Product[] | undefined;
  stock: ProductStock[] | undefined;
  onPick: (product: Product) => void;
  error?: string;
  loading?: boolean;
  limit?: number;
  autoFocus?: boolean;
}

/** Search the catalogue; products stocked here first, with their usable quantity. */
export function ProductSearch({ products, stock, onPick, error, loading, limit = 8, autoFocus }: Props) {
  const c = useTheme();
  const [search, setSearch] = useState('');

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    const usable = new Map(stock?.map((s) => [s.product.id, s.usable_quantity]));
    return (products ?? [])
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
      .map((p) => ({ p, usable: usable.get(p.id) }))
      .sort((a, b) => Number(b.usable !== undefined) - Number(a.usable !== undefined) || a.p.name.localeCompare(b.p.name));
  }, [products, stock, search]);

  return (
    <Card padded={false} style={{ overflow: 'hidden' }}>
      <View style={{ padding: Spacing.three }}>
        <TextField icon={Search} placeholder="Search products" value={search} onChangeText={setSearch} autoCorrect={false} autoFocus={autoFocus} error={error} />
      </View>
      {matches.slice(0, limit).map(({ p, usable }, i) => (
        <Pressable
          key={p.id}
          onPress={() => onPick(p)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.option, { borderTopColor: c.border, backgroundColor: pressed ? c.surface2 : undefined }, i === 0 && { borderTopWidth: StyleSheet.hairlineWidth }]}>
          <View style={{ flex: 1 }}>
            <Text variant="label" numberOfLines={1}>
              {p.name}
            </Text>
            <Text variant="caption" tone="muted">
              {p.sku} · {p.category}
            </Text>
          </View>
          <Text variant="caption" tone={usable === undefined ? 'muted' : 'secondary'}>
            {usable === undefined ? 'not stocked' : `${formatQty(usable)} ${p.unit_of_measure}`}
          </Text>
        </Pressable>
      ))}
      {matches.length === 0 && (
        <Text variant="small" tone="muted" style={{ padding: Spacing.four }}>
          {loading ? 'Loading products…' : 'No product matches.'}
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
