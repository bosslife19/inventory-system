import { router, useLocalSearchParams } from 'expo-router';
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowRightLeft,
  ArrowUpFromLine,
  Check,
  ClipboardCheck,
  Minus,
  PackageMinus,
  Plus,
  Search,
  SquareMinus,
  SquarePlus,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Badge, ExpiryBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import { Fonts, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  NEEDS_COUNTERPARTY,
  OUTBOUND,
  TRANSACTION_TYPES,
  counterpartyLabel,
  formatDate,
  formatQty,
  todayInLagos,
  transactionLabel,
} from '@/lib/format';
import { enqueue } from '@/lib/offlineQueue';
import { useProducts, useStockBalances } from '@/lib/queries';
import { useFacilityId } from '@/lib/session';
import { requestSync, useSyncState } from '@/lib/sync';
import type { BatchStock, TransactionType } from '@/lib/types';

const TYPE_ICON: Record<TransactionType, LucideIcon> = {
  issue: ArrowUpFromLine,
  receipt: ArrowDownToLine,
  loss: PackageMinus,
  physical_count: ClipboardCheck,
  adjustment_in: SquarePlus,
  adjustment_out: SquareMinus,
  transfer_in: ArrowLeftRight,
  transfer_out: ArrowRightLeft,
};

type Errors = Record<string, string | undefined>;

/** Earliest-expiring batch that can go out: FEFO, skipping expired stock for issues (same rule as the web form). */
function suggestBatch(batches: BatchStock[], type: TransactionType): string {
  return batches.find((b) => b.quantity_on_hand > 0 && !(type === 'issue' && b.expiry_status === 'expired'))?.batch_no ?? '';
}

/** Back to where the sheet was opened from, or Home if it was opened directly (deep link, web reload). */
function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime());

/**
 * The digital Stock Card entry — the screen staff use every day. Saved to
 * the outbox first, online or not (mobile/CLAUDE.md rule 1); the server is
 * the real gate and anything it refuses shows up on the Account tab.
 */
export default function Record() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const facilityId = useFacilityId();
  const { online } = useSyncState();
  const params = useLocalSearchParams<{ productId?: string; type?: TransactionType }>();
  const products = useProducts();
  const stock = useStockBalances(facilityId);

  const [type, setType] = useState<TransactionType>(params.type ?? 'issue');
  const [productId, setProductId] = useState<number | null>(params.productId ? Number(params.productId) : null);
  const [search, setSearch] = useState('');
  const [batchNo, setBatchNo] = useState(() =>
    suggestBatch(stock.data?.find((s) => s.product.id === Number(params.productId))?.batches ?? [], params.type ?? 'issue'),
  );
  const [expiry, setExpiry] = useState('');
  const [quantity, setQuantity] = useState('');
  const [date, setDate] = useState(todayInLagos());
  const [counterparty, setCounterparty] = useState('');
  const [voucher, setVoucher] = useState('');
  const [comments, setComments] = useState('');
  const [errors, setErrors] = useState<Errors>({});

  const product = products.data?.find((p) => p.id === productId);
  const productStock = stock.data?.find((s) => s.product.id === productId);
  const batches = productStock?.batches.filter((b) => b.batch_no !== null) ?? [];
  const outbound = OUTBOUND.includes(type);
  const tracked = product?.requires_batch_tracking ?? false;
  const normalizedBatch = batchNo.trim().toUpperCase();
  const knownBatch = batches.find((b) => b.batch_no === normalizedBatch);
  const onHand = tracked ? knownBatch?.quantity_on_hand : productStock?.quantity_on_hand;

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    const usable = new Map(stock.data?.map((s) => [s.product.id, s.usable_quantity]));
    return (products.data ?? [])
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
      .map((p) => ({ p, usable: usable.get(p.id) }))
      .sort((a, b) => Number(b.usable !== undefined) - Number(a.usable !== undefined) || a.p.name.localeCompare(b.p.name));
  }, [products.data, stock.data, search]);

  function pickType(next: TransactionType) {
    setType(next);
    setBatchNo(OUTBOUND.includes(next) ? suggestBatch(batches, next) : '');
    setExpiry('');
    setErrors({});
  }

  function pickProduct(id: number | null) {
    setProductId(id);
    setBatchNo(OUTBOUND.includes(type) ? suggestBatch(stock.data?.find((s) => s.product.id === id)?.batches ?? [], type) : '');
    setExpiry('');
    setErrors({});
  }

  function step(delta: number) {
    const n = Math.max(0, (Number(quantity) || 0) + delta);
    setQuantity(String(n));
  }

  function validate(): Errors {
    const e: Errors = {};
    const qty = Number(quantity);
    if (!product) e.product = 'Choose a product.';
    if (tracked && !normalizedBatch) e.batch = 'Batch number is required for this product.';
    if (tracked && normalizedBatch && !knownBatch && outbound) e.batch = 'This batch is not in stock here.';
    if (tracked && normalizedBatch && !knownBatch && !outbound && !isDate(expiry)) e.expiry = 'Enter the expiry date as YYYY-MM-DD.';
    if (quantity === '' || !Number.isInteger(qty) || qty < (type === 'physical_count' ? 0 : 1)) {
      e.quantity = type === 'physical_count' ? 'Enter the counted quantity (0 or more).' : 'Enter a whole number greater than 0.';
    } else if (outbound && onHand !== undefined && qty > onHand) {
      e.quantity = `Only ${formatQty(onHand)} on hand.`;
    }
    if (NEEDS_COUNTERPARTY.includes(type) && !counterparty.trim()) e.counterparty = `${counterpartyLabel(type)} is required.`;
    if (!isDate(date)) e.date = 'Enter the date as YYYY-MM-DD.';
    else if (date > todayInLagos()) e.date = 'The date can’t be in the future.';
    return e;
  }

  function save() {
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0 || !product) return;

    enqueue({
      facilityId,
      productName: product.name,
      unit: product.unit_of_measure,
      body: {
        product_id: product.id,
        transaction_type: type,
        quantity: Number(quantity),
        transaction_date: date,
        batch_no: tracked ? normalizedBatch : null,
        expiry_date: tracked && !knownBatch && expiry ? expiry : null,
        counterparty: NEEDS_COUNTERPARTY.includes(type) ? counterparty.trim() : null,
        voucher_no: voucher.trim() || null,
        comments: comments.trim() || null,
      },
    });
    requestSync();
    toast({
      kind: online ? 'success' : 'queued',
      title: `${transactionLabel(type)} of ${formatQty(Number(quantity))} ${product.unit_of_measure} saved`,
      body: online ? 'Syncing to the Stock Card now.' : 'You’re offline — it will sync automatically.',
    });
    close();
  }

  const hasExpired = batches.some((b) => b.expiry_status === 'expired' && b.quantity_on_hand > 0);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: Platform.OS === 'ios' ? Spacing.four : insets.top + Spacing.three, borderColor: c.border, backgroundColor: c.surface }]}>
        <View style={{ flex: 1 }}>
          <Text variant="eyebrow" tone="primary">
            New Stock Card entry
          </Text>
          <Text variant="title">Record {transactionLabel(type).toLowerCase()}</Text>
        </View>
        <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} style={[styles.close, { backgroundColor: c.surface2 }]}>
          <X size={20} color={c.text} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Type */}
        <View style={styles.section}>
          <Text variant="label" tone="secondary">
            What happened?
          </Text>
          <View style={styles.typeGrid}>
            {TRANSACTION_TYPES.map((t) => {
              const Icon = TYPE_ICON[t.value];
              const on = t.value === type;
              return (
                <Pressable
                  key={t.value}
                  onPress={() => pickType(t.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${t.label}: ${t.hint}`}
                  style={[
                    styles.typeTile,
                    { backgroundColor: on ? c.primary : c.surface, borderColor: on ? c.primary : c.border },
                    on && { shadowColor: c.primary, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
                  ]}>
                  <Icon size={20} color={on ? '#ffffff' : c.primary} strokeWidth={2.2} />
                  <Text variant="caption" weight="semibold" style={{ color: on ? '#ffffff' : c.text }} numberOfLines={1}>
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text variant="caption" tone="muted">
            {TRANSACTION_TYPES.find((t) => t.value === type)?.hint}
          </Text>
        </View>

        {/* Product */}
        <View style={styles.section}>
          <Text variant="label" tone="secondary">
            Product
          </Text>
          {product ? (
            <Card style={styles.selected}>
              <View style={{ flex: 1 }}>
                <Text variant="label">{product.name}</Text>
                <Text variant="caption" tone="muted">
                  {product.sku} · {productStock ? `${formatQty(productStock.usable_quantity)} ${product.unit_of_measure} usable` : 'Not stocked here yet'}
                </Text>
              </View>
              <Button label="Change" variant="ghost" size="sm" onPress={() => pickProduct(null)} />
            </Card>
          ) : (
            <Card padded={false} style={{ overflow: 'hidden' }}>
              <View style={{ padding: Spacing.three }}>
                <TextField icon={Search} placeholder="Search products" value={search} onChangeText={setSearch} autoCorrect={false} error={errors.product} />
              </View>
              {matches.slice(0, 8).map(({ p, usable }, i) => (
                <Pressable
                  key={p.id}
                  onPress={() => pickProduct(p.id)}
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
                  {products.isPending ? 'Loading products…' : 'No product matches.'}
                </Text>
              )}
            </Card>
          )}
        </View>

        {/* Batch */}
        {product && tracked && outbound && (
          <View style={styles.section}>
            <Text variant="label" tone="secondary">
              Batch
            </Text>
            {batches.filter((b) => b.quantity_on_hand > 0).map((b) => {
              const disabled = type === 'issue' && b.expiry_status === 'expired';
              const on = normalizedBatch === b.batch_no;
              return (
                <Pressable
                  key={b.batch_id}
                  disabled={disabled}
                  onPress={() => setBatchNo(b.batch_no ?? '')}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on, disabled }}
                  style={[styles.batch, { backgroundColor: c.surface, borderColor: on ? c.primary : c.border, opacity: disabled ? 0.5 : 1 }, on && { borderWidth: 2 }]}>
                  <View style={[styles.radio, { borderColor: on ? c.primary : c.borderStrong }]}>{on && <View style={[styles.radioDot, { backgroundColor: c.primary }]} />}</View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="mono" weight="semibold" style={{ color: c.text }}>
                      {b.batch_no}
                    </Text>
                    <Text variant="caption" tone="muted">
                      Expires {formatDate(b.expiry_date)} · {formatQty(b.quantity_on_hand)} on hand
                    </Text>
                  </View>
                  <ExpiryBadge status={b.expiry_status} />
                </Pressable>
              );
            })}
            {batches.every((b) => b.quantity_on_hand <= 0) && (
              <Text variant="small" tone="critical">
                No batches in stock for this product.
              </Text>
            )}
            {type === 'issue' && hasExpired && (
              <Text variant="caption" tone="muted">
                Expired batches can’t be issued — record them as a loss.
              </Text>
            )}
            {errors.batch && (
              <Text variant="caption" tone="critical">
                {errors.batch}
              </Text>
            )}
          </View>
        )}

        {product && tracked && !outbound && (
          <View style={styles.section}>
            <TextField
              label="Batch number"
              value={batchNo}
              onChangeText={setBatchNo}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="As printed on the pack"
              error={errors.batch}
            />
            {batches.length > 0 && (
              <View style={styles.suggestions}>
                {batches.map((b) => (
                  <Chip key={b.batch_id} label={b.batch_no ?? ''} selected={normalizedBatch === b.batch_no} onPress={() => setBatchNo(b.batch_no ?? '')} />
                ))}
              </View>
            )}
            {knownBatch ? (
              <Text variant="caption" tone="muted">
                Known batch · expires {formatDate(knownBatch.expiry_date)}
              </Text>
            ) : (
              normalizedBatch !== '' && (
                <TextField label="Expiry date (new batch)" value={expiry} onChangeText={setExpiry} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" error={errors.expiry} />
              )
            )}
          </View>
        )}

        {/* Quantity */}
        <View style={styles.section}>
          <Text variant="label" tone="secondary">
            {type === 'physical_count' ? 'Counted quantity' : 'Quantity'}
            {product ? ` (${product.unit_of_measure})` : ''}
          </Text>
          <View style={[styles.stepper, { backgroundColor: c.surface, borderColor: errors.quantity ? c.critical : c.border }]}>
            <Pressable onPress={() => step(-1)} accessibilityLabel="Decrease" style={[styles.stepBtn, { backgroundColor: c.surface2 }]}>
              <Minus size={22} color={c.text} />
            </Pressable>
            <TextInput
              value={quantity}
              onChangeText={(t) => setQuantity(t.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={c.muted}
              accessibilityLabel="Quantity"
              style={[styles.qtyInput, { color: c.text, fontFamily: Fonts.bold }]}
            />
            <Pressable onPress={() => step(1)} accessibilityLabel="Increase" style={[styles.stepBtn, { backgroundColor: c.primarySoft }]}>
              <Plus size={22} color={c.primary} />
            </Pressable>
          </View>
          {errors.quantity ? (
            <Text variant="caption" tone="critical">
              {errors.quantity}
            </Text>
          ) : (
            onHand !== undefined && (
              <Text variant="caption" tone="muted">
                On hand{tracked && knownBatch ? ` in ${knownBatch.batch_no}` : ''}: {formatQty(onHand)} {product?.unit_of_measure}
              </Text>
            )
          )}
        </View>

        {/* Date */}
        <View style={styles.section}>
          <Text variant="label" tone="secondary">
            Date
          </Text>
          <View style={styles.suggestions}>
            <Chip label="Today" selected={date === todayInLagos()} onPress={() => setDate(todayInLagos())} />
            <Chip label="Yesterday" selected={date === todayInLagos(-1)} onPress={() => setDate(todayInLagos(-1))} />
          </View>
          <TextField value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" error={errors.date} />
        </View>

        {NEEDS_COUNTERPARTY.includes(type) && (
          <View style={styles.section}>
            <TextField
              label={counterpartyLabel(type)}
              value={counterparty}
              onChangeText={setCounterparty}
              placeholder={type === 'receipt' ? 'e.g. State Central Medical Stores' : 'e.g. OPD Dispensary'}
              error={errors.counterparty}
            />
          </View>
        )}

        <View style={styles.section}>
          <TextField label="Voucher no. (optional)" value={voucher} onChangeText={setVoucher} autoCapitalize="characters" />
          <TextField label="Comments (optional)" value={comments} onChangeText={setComments} multiline style={{ minHeight: 64, textAlignVertical: 'top' }} />
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.three, backgroundColor: c.surface, borderColor: c.border }]}>
        <View style={styles.footerInner}>
          {!online && <Badge label="Offline — saves on this phone" tone="warning" />}
          <Button label={`Save ${transactionLabel(type).toLowerCase()}`} icon={Check} size="lg" block onPress={save} />
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
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  typeTile: {
    width: '23.5%',
    flexGrow: 1,
    minWidth: 72,
    alignItems: 'center',
    gap: 6,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.one,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  selected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  batch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three + 2,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  suggestions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.two,
    borderRadius: Radius.lg,
    borderWidth: 1.2,
  },
  stepBtn: {
    width: 52,
    height: 52,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyInput: {
    flex: 1,
    fontSize: 32,
    textAlign: 'center',
    paddingVertical: Spacing.two,
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
