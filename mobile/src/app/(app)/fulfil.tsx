import { router, useLocalSearchParams } from 'expo-router';
import { ClipboardList, Truck } from 'lucide-react-native';
import { useState } from 'react';

import { IssueLines, checkIssueLines, newIssueLine, type IssueLine } from '@/components/issue-lines';
import { Sheet, SheetSection } from '@/components/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, Loading } from '@/components/ui/misc';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import { formatQty, todayInLagos } from '@/lib/format';
import { enqueue } from '@/lib/offlineQueue';
import { useIncomingRequests, useProducts, useStockBalances } from '@/lib/queries';
import { useFacilityId } from '@/lib/session';
import { requestSync, useSyncState } from '@/lib/sync';

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

/**
 * Answer a reorder request by issuing the stock: a dispatch to the requester,
 * starting from what they asked for (capped at what's usable here, earliest
 * expiry first). Saved to the outbox, so it can be done offline; the server
 * refuses a second fulfil of the same request, so a retry can't issue twice.
 */
export default function Fulfil() {
  const toast = useToast();
  const facilityId = useFacilityId();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { online } = useSyncState();
  const requests = useIncomingRequests(facilityId);
  const products = useProducts();
  const stock = useStockBalances(facilityId);
  const [lines, setLines] = useState<IssueLine[] | null>(null);
  const [date, setDate] = useState(todayInLagos());
  const [voucher, setVoucher] = useState('');
  const [comments, setComments] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const request = requests.data?.data.find((r) => r.id === Number(id));
  if (requests.isPending || products.isPending || stock.isPending) return <Loading />;
  if (!request) return <EmptyState icon={ClipboardList} title="Request not found" body="It may have been answered already. Pull to refresh the list." />;

  const current =
    lines ??
    request.items.flatMap((item) => {
      const product = products.data?.find((p) => p.id === item.product.id) ?? stock.data?.find((s) => s.product.id === item.product.id)?.product;
      if (!product) return [];
      const usable = stock.data?.find((s) => s.product.id === product.id)?.usable_quantity ?? 0;
      return [newIssueLine(product, stock.data, String(Math.min(item.quantity_requested, usable) || ''), item.quantity_requested)];
    });

  function save() {
    const { errors: e, items } = checkIssueLines(current, stock.data);
    if (!isDate(date) || date > todayInLagos()) e.date = 'A date up to today, as YYYY-MM-DD.';
    setErrors(e);
    if (Object.keys(e).length || !request) return;

    enqueue({
      kind: 'fulfil',
      facilityId,
      requestId: request.id,
      requestNumber: request.number,
      requesterName: request.facility.name,
      body: { dispatched_date: date, voucher_no: voucher.trim() || null, comments: comments.trim() || null, items },
    });
    requestSync();
    toast({
      kind: online ? 'success' : 'queued',
      title: `${request.number} issued to ${request.facility.name}`,
      body: online ? 'They’re notified, and confirm the delivery when it arrives.' : 'You’re offline — it will send automatically.',
    });
    router.back();
  }

  return (
    <Sheet
      eyebrow={`Reorder request ${request.number}`}
      title={`Issue to ${request.facility.name}`}
      footer={
        <>
          {!online && <Badge label="Offline — sends when you’re back online" tone="warning" />}
          <Button label="Issue stock" icon={Truck} size="lg" block onPress={save} />
        </>
      }>
      <Card style={{ gap: 4 }}>
        <Text variant="label">What they asked for</Text>
        {request.items.map((i) => (
          <Text key={i.id} variant="small" tone="secondary">
            {i.product.name}: {formatQty(i.quantity_requested)} {i.product.unit_of_measure}
          </Text>
        ))}
        {request.comments && (
          <Text variant="caption" tone="muted">
            “{request.comments}”{request.requested_by_name ? ` — ${request.requested_by_name}` : ''}
          </Text>
        )}
      </Card>

      <SheetSection label="What you’re sending">
        <IssueLines lines={current} onChange={setLines} stock={stock.data} products={products.data} errors={errors} />
      </SheetSection>

      <SheetSection>
        <TextField label="Dispatch date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" error={errors.date} />
        <TextField label="Voucher / waybill no. (optional)" value={voucher} onChangeText={setVoucher} placeholder="A DSP number is made if empty" autoCapitalize="characters" />
        <TextField label="Note to them (optional)" value={comments} onChangeText={setComments} placeholder="e.g. Rest follows next week" />
      </SheetSection>
    </Sheet>
  );
}
