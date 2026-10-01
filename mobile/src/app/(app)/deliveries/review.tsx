import { Image } from 'expo-image';
import { router } from 'expo-router';
import { AlertTriangle, Check, FileText, Plus, ScanLine, Trash2, X } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProductSearch } from '@/components/product-search';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/misc';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getDeliveryDraft } from '@/lib/delivery-draft';
import { formatDate, formatQty, todayInLagos } from '@/lib/format';
import { enqueue } from '@/lib/offlineQueue';
import { useProducts, useStockBalances } from '@/lib/queries';
import { useFacilityId } from '@/lib/session';
import { requestSync, useSyncState } from '@/lib/sync';
import type { Product } from '@/lib/types';

interface Line {
  key: number;
  productId: number | null;
  batchNo: string;
  expiry: string;
  quantity: string;
  /** What OCR read, shown so staff can compare with the paper. */
  raw: string | null;
}

type Errors = Record<string, string | undefined>;

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime());

let nextKey = 1;

/**
 * Review a delivery note before signing for it. OCR output is only a
 * suggestion: staff check every line against the paper, fix or add lines,
 * then confirm — the human sign-off backend CLAUDE.md rule 4 requires.
 * Confirmed notes go through the offline outbox like any entry.
 */
export default function ReviewDelivery() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const facilityId = useFacilityId();
  const { online } = useSyncState();
  const products = useProducts();
  const stock = useStockBalances(facilityId);
  const [draft] = useState(getDeliveryDraft);

  const [noteNo, setNoteNo] = useState(draft?.parsed.deliveryNoteNo ?? '');
  const [source, setSource] = useState(draft?.parsed.source ?? '');
  const [date, setDate] = useState(draft?.parsed.receivedDate && draft.parsed.receivedDate <= todayInLagos() ? draft.parsed.receivedDate : todayInLagos());
  const [lines, setLines] = useState<Line[]>(() =>
    (draft?.parsed.lines.length ? draft.parsed.lines : [null]).map((l) => ({
      key: nextKey++,
      productId: l?.productId ?? null,
      batchNo: l?.batchNo ?? '',
      expiry: l?.expiryDate ?? '',
      quantity: l?.quantity ? String(l.quantity) : '',
      raw: l?.raw ?? null,
    })),
  );
  const [picking, setPicking] = useState<number | null>(null);
  const [showPhoto, setShowPhoto] = useState(false);
  const [errors, setErrors] = useState<Errors>({});

  const productById = new Map(products.data?.map((p) => [p.id, p]));
  const fromOcr = draft?.capture === 'ocr';

  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const remove = (key: number) => setLines((ls) => ls.filter((l) => l.key !== key));
  const add = () => setLines((ls) => [...ls, { key: nextKey++, productId: null, batchNo: '', expiry: '', quantity: '', raw: null }]);

  function knownBatch(productId: number, batchNo: string) {
    return stock.data?.find((s) => s.product.id === productId)?.batches.find((b) => b.batch_no === batchNo.trim().toUpperCase());
  }

  function validate(): Errors {
    const e: Errors = {};
    if (!source.trim()) e.source = 'Who delivered it? This becomes “Received from” on the Stock Card.';
    if (!isDate(date)) e.date = 'Enter the date as YYYY-MM-DD.';
    else if (date > todayInLagos()) e.date = 'The date can’t be in the future.';
    if (lines.length === 0) e.lines = 'Add at least one line.';
    for (const l of lines) {
      const p = l.productId ? productById.get(l.productId) : undefined;
      if (!p) e[`${l.key}.product`] = 'Choose the product.';
      const qty = Number(l.quantity);
      if (!l.quantity || !Number.isInteger(qty) || qty < 1) e[`${l.key}.quantity`] = 'Enter a whole number greater than 0.';
      if (p?.requires_batch_tracking) {
        if (!l.batchNo.trim()) e[`${l.key}.batch`] = 'Batch number is required for this product.';
        else if (!knownBatch(p.id, l.batchNo) && !isDate(l.expiry)) e[`${l.key}.expiry`] = 'New batch: enter its expiry as YYYY-MM-DD.';
      }
    }
    return e;
  }

  function confirm() {
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    enqueue({
      kind: 'delivery_note',
      facilityId,
      body: {
        delivery_note_no: noteNo.trim() || null,
        source: source.trim(),
        received_date: date,
        capture_method: fromOcr ? 'ocr' : 'manual',
        confirm: true,
        items: lines.map((l) => {
          const p = productById.get(l.productId!)!;
          const tracked = p.requires_batch_tracking;
          const known = tracked ? knownBatch(p.id, l.batchNo) : undefined;
          return {
            product_id: p.id,
            quantity: Number(l.quantity),
            batch_no: tracked ? l.batchNo.trim().toUpperCase() : null,
            expiry_date: tracked && !known && l.expiry ? l.expiry : null,
          };
        }),
      },
    });
    requestSync();
    toast({
      kind: online ? 'success' : 'queued',
      title: `Delivery of ${lines.length} line${lines.length === 1 ? '' : 's'} confirmed`,
      body: online ? 'Adding the receipts to the Stock Card now.' : 'You’re offline — it will sync automatically.',
    });
    router.replace('/');
  }

  if (!draft) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, justifyContent: 'center' }}>
        <EmptyState icon={FileText} title="Nothing to review" body="Scan a delivery note to start.">
          <Button label="Scan a delivery note" icon={ScanLine} onPress={() => router.replace('/deliveries/scan')} />
        </EmptyState>
      </View>
    );
  }

  const unmatched = lines.filter((l) => !l.productId).length;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.three, borderColor: c.border, backgroundColor: c.surface }]}>
        <View style={{ flex: 1 }}>
          <Text variant="eyebrow" tone="primary">
            Delivery note
          </Text>
          <Text variant="title">Review & confirm</Text>
        </View>
        <Pressable onPress={() => router.replace('/')} accessibilityRole="button" accessibilityLabel="Discard" hitSlop={10} style={[styles.close, { backgroundColor: c.surface2 }]}>
          <X size={20} color={c.text} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {fromOcr && (
          <Card style={[styles.notice, { backgroundColor: c.warningSoft, borderColor: c.warningSoft }]}>
            <AlertTriangle size={20} color={c.warning} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="label" tone="warning">
                Read from a photo — check every line
              </Text>
              <Text variant="caption" tone="secondary">
                Compare products, batches, expiry dates and quantities with the paper note before confirming.
              </Text>
            </View>
          </Card>
        )}

        {fromOcr && draft.parsed.lines.length === 0 && draft.readRows && draft.readRows.length > 0 && (
          <Card style={{ gap: Spacing.two }}>
            <Text variant="label">No item lines could be picked out</Text>
            <Text variant="caption" tone="muted">
              This is what the phone read. Add the lines below while looking at it and the paper.
            </Text>
            <ScrollView style={[styles.readBox, { backgroundColor: c.surface2 }]} nestedScrollEnabled>
              <Text variant="mono" tone="secondary" style={{ fontSize: 12 }}>
                {draft.readRows.join('\n')}
              </Text>
            </ScrollView>
          </Card>
        )}

        {draft.photoUri && (
          <Pressable onPress={() => setShowPhoto(true)} accessibilityRole="button" accessibilityLabel="View the photo">
            <Image source={{ uri: draft.photoUri }} style={[styles.thumb, { borderColor: c.border }]} contentFit="cover" />
            <View style={styles.thumbLabel}>
              <Text variant="caption" weight="semibold" tone="inverse">
                Tap to compare with the photo
              </Text>
            </View>
          </Pressable>
        )}

        <View style={styles.section}>
          <TextField label="Received from" value={source} onChangeText={setSource} placeholder="e.g. Kaduna State CMS" error={errors.source} />
          <TextField label="Delivery note no. (optional)" value={noteNo} onChangeText={setNoteNo} autoCapitalize="characters" hint="Saved as the voucher no. on each receipt" />
          <View style={{ gap: Spacing.two }}>
            <Text variant="caption" weight="semibold" tone="secondary">
              Date received
            </Text>
            <View style={styles.row}>
              <Chip label="Today" selected={date === todayInLagos()} onPress={() => setDate(todayInLagos())} />
              <Chip label="Yesterday" selected={date === todayInLagos(-1)} onPress={() => setDate(todayInLagos(-1))} />
            </View>
            <TextField value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" error={errors.date} />
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.linesHead}>
            <Text variant="heading">
              {lines.length} line{lines.length === 1 ? '' : 's'}
            </Text>
            {unmatched > 0 && <Badge label={`${unmatched} to match`} tone="warning" />}
          </View>
          {errors.lines && (
            <Text variant="caption" tone="critical">
              {errors.lines}
            </Text>
          )}

          {lines.map((l, i) => {
            const p = l.productId ? productById.get(l.productId) : undefined;
            const known = p?.requires_batch_tracking && l.batchNo ? knownBatch(p.id, l.batchNo) : undefined;
            return (
              <Card key={l.key} style={[styles.line, !p && { borderColor: c.statusWarning, borderWidth: 1.2 }]}>
                <View style={styles.lineTop}>
                  <View style={[styles.lineNo, { backgroundColor: c.primarySoft }]}>
                    <Text variant="caption" weight="bold" tone="primary">
                      {i + 1}
                    </Text>
                  </View>
                  <Pressable onPress={() => setPicking(l.key)} accessibilityRole="button" style={{ flex: 1 }}>
                    <Text variant="label" tone={p ? 'default' : 'warning'} numberOfLines={2}>
                      {p ? p.name : 'Choose the product'}
                    </Text>
                    <Text variant="caption" tone={errors[`${l.key}.product`] ? 'critical' : 'muted'}>
                      {errors[`${l.key}.product`] ?? (p ? `${p.sku} · tap to change` : 'Not recognised — tap to pick')}
                    </Text>
                  </Pressable>
                  <Pressable onPress={() => remove(l.key)} accessibilityRole="button" accessibilityLabel={`Remove line ${i + 1}`} hitSlop={8}>
                    <Trash2 size={18} color={c.muted} />
                  </Pressable>
                </View>

                {l.raw && (
                  <Text variant="mono" tone="muted" numberOfLines={2} style={[styles.raw, { backgroundColor: c.surface2 }]}>
                    Read as: {l.raw}
                  </Text>
                )}

                <View style={styles.row}>
                  {p?.requires_batch_tracking !== false && (
                    <View style={{ flex: 1.2 }}>
                      <TextField label="Batch" value={l.batchNo} onChangeText={(t) => update(l.key, { batchNo: t })} autoCapitalize="characters" autoCorrect={false} error={errors[`${l.key}.batch`]} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <TextField
                      label={p ? `Qty (${p.unit_of_measure})` : 'Qty'}
                      value={l.quantity}
                      onChangeText={(t) => update(l.key, { quantity: t.replace(/[^0-9]/g, '') })}
                      keyboardType="number-pad"
                      error={errors[`${l.key}.quantity`]}
                    />
                  </View>
                </View>
                {p?.requires_batch_tracking !== false &&
                  (known ? (
                    <Text variant="caption" tone="muted">
                      Known batch · expires {formatDate(known.expiry_date)} · {formatQty(known.quantity_on_hand)} on hand
                    </Text>
                  ) : (
                    <TextField label="Expiry" value={l.expiry} onChangeText={(t) => update(l.key, { expiry: t })} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" error={errors[`${l.key}.expiry`]} />
                  ))}
              </Card>
            );
          })}

          <Button label="Add a line" icon={Plus} variant="ghost" onPress={add} />
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.three, backgroundColor: c.surface, borderColor: c.border }]}>
        <View style={styles.footerInner}>
          <Text variant="caption" tone="muted" align="center">
            Confirming signs for this delivery: each line is added to the Stock Card as a receipt.
          </Text>
          <Button label={`Confirm receipt of ${lines.length} line${lines.length === 1 ? '' : 's'}`} icon={Check} size="lg" block onPress={confirm} />
        </View>
      </View>

      <Modal visible={picking !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPicking(null)}>
        <View style={[styles.sheet, { backgroundColor: c.bg, paddingTop: Platform.OS === 'ios' ? Spacing.five : insets.top + Spacing.four }]}>
          <View style={styles.linesHead}>
            <Text variant="title">Choose product</Text>
            <Pressable onPress={() => setPicking(null)} accessibilityRole="button" accessibilityLabel="Close" style={[styles.close, { backgroundColor: c.surface2 }]}>
              <X size={20} color={c.text} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            <ProductSearch
              autoFocus
              limit={20}
              products={products.data}
              stock={stock.data}
              loading={products.isPending}
              onPick={(prod: Product) => {
                if (picking !== null) update(picking, { productId: prod.id });
                setPicking(null);
              }}
            />
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={showPhoto} animationType="fade" onRequestClose={() => setShowPhoto(false)}>
        <Pressable style={{ flex: 1, backgroundColor: '#000' }} onPress={() => setShowPhoto(false)} accessibilityLabel="Close photo">
          {draft.photoUri && <Image source={{ uri: draft.photoUri }} style={{ flex: 1 }} contentFit="contain" />}
        </Pressable>
      </Modal>
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
    paddingBottom: Spacing.eight * 3,
  },
  notice: {
    flexDirection: 'row',
    gap: Spacing.three,
    alignItems: 'flex-start',
  },
  readBox: {
    maxHeight: 220,
    padding: Spacing.three,
    borderRadius: Radius.sm,
  },
  thumb: {
    height: 150,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  thumbLabel: {
    position: 'absolute',
    left: Spacing.three,
    bottom: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: 5,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(10,15,28,0.7)',
  },
  section: {
    gap: Spacing.four,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  linesHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  line: {
    gap: Spacing.three,
  },
  lineTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  lineNo: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  raw: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.sm,
    fontSize: 12,
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
  },
  sheet: {
    flex: 1,
    paddingHorizontal: Spacing.five,
    gap: Spacing.four,
  },
});
