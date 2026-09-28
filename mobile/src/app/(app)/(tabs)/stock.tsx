import { router } from 'expo-router';
import { PackageSearch, Search } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { PageHeader } from '@/components/page-header';
import { ProductCard } from '@/components/product-card';
import { Chip, ChipRow } from '@/components/ui/chip';
import { EmptyState, Loading } from '@/components/ui/misc';
import { TextField } from '@/components/ui/text-field';
import { MaxContentWidth, Spacing, TabBarInset } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useOutbox } from '@/lib/offlineQueue';
import { useStockBalances } from '@/lib/queries';
import { useFacilityId } from '@/lib/session';
import type { ProductStock } from '@/lib/types';

type Filter = 'all' | 'stock_out' | 'low_stock' | 'reorder' | 'expiring';

const FILTERS: { value: Filter; label: string; test: (s: ProductStock) => boolean }[] = [
  { value: 'all', label: 'All', test: () => true },
  { value: 'stock_out', label: 'Stock-out', test: (s) => s.level === 'stock_out' },
  { value: 'low_stock', label: 'Low', test: (s) => s.level === 'low_stock' },
  { value: 'reorder', label: 'Reorder', test: (s) => s.level === 'reorder' },
  { value: 'expiring', label: 'Expiry', test: (s) => s.flags.includes('expired') || s.flags.includes('expiring_soon') },
];

const ORDER = { stock_out: 0, low_stock: 1, reorder: 2, ok: 3 } as const;

export default function Stock() {
  const c = useTheme();
  const facilityId = useFacilityId();
  const stock = useStockBalances(facilityId);
  const outbox = useOutbox();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const pendingByProduct = useMemo(() => {
    const m = new Map<number, number>();
    for (const i of outbox) m.set(i.body.product_id, (m.get(i.body.product_id) ?? 0) + 1);
    return m;
  }, [outbox]);

  const rows = stock.data ?? [];
  const q = query.trim().toLowerCase();
  const test = FILTERS.find((f) => f.value === filter)!.test;
  const shown = rows
    .filter((s) => test(s) && (!q || s.product.name.toLowerCase().includes(q) || s.product.sku.toLowerCase().includes(q)))
    .sort((a, b) => ORDER[a.level] - ORDER[b.level] || a.product.name.localeCompare(b.product.name));

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <FlatList
        data={shown}
        keyExtractor={(s) => String(s.product.id)}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={stock.isRefetching} onRefresh={() => void stock.refetch()} tintColor={c.primary} />}
        ListHeaderComponent={
          <View style={{ gap: Spacing.four, marginBottom: Spacing.four }}>
            <PageHeader eyebrow="Current stock" title="Stock" subtitle={`${rows.length} products · worst first`} />
            <View style={styles.pad}>
              <TextField icon={Search} placeholder="Search by name or code" value={query} onChangeText={setQuery} autoCorrect={false} clearButtonMode="while-editing" />
            </View>
            <View>
              <ChipRow>
                {FILTERS.map((f) => (
                  <Chip
                    key={f.value}
                    label={f.label}
                    selected={filter === f.value}
                    count={f.value === 'all' ? undefined : rows.filter(f.test).length}
                    onPress={() => setFilter(f.value)}
                  />
                ))}
              </ChipRow>
            </View>
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: Spacing.three }} />}
        renderItem={({ item }) => (
          <View style={styles.pad}>
            <ProductCard stock={item} pending={pendingByProduct.get(item.product.id) ?? 0} onPress={() => router.push(`/product/${item.product.id}`)} />
          </View>
        )}
        ListEmptyComponent={
          stock.isPending ? (
            <Loading label="Loading stock…" />
          ) : (
            <EmptyState
              icon={PackageSearch}
              title={rows.length ? 'No products match' : 'No stock recorded yet'}
              body={rows.length ? 'Try another search or filter.' : 'Record a receipt to start this facility’s Stock Card.'}
            />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingBottom: TabBarInset + Spacing.four,
  },
  pad: {
    paddingHorizontal: Spacing.five,
  },
});
