import { router } from 'expo-router';
import { Check, Search, Truck } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { IssueLines, checkIssueLines, type IssueLine } from '@/components/issue-lines';
import { Sheet, SheetSection } from '@/components/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Loading } from '@/components/ui/misc';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { todayInLagos } from '@/lib/format';
import { enqueue } from '@/lib/offlineQueue';
import { useDispatchDestinations, useProducts, useStockBalances } from '@/lib/queries';
import { useFacilityId } from '@/lib/session';
import { requestSync, useSyncState } from '@/lib/sync';

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

/**
 * Issue stock from this store to a facility one level down (an LGA store to
 * its SDPs, a state store to its LGA stores…). It comes off this Stock Card
 * once synced and arrives at the receiver as a delivery to confirm. Saved to
 * the outbox first, so it works offline; its client_reference stops a
 * retried send from issuing twice.
 */
export default function Dispatch() {
  const c = useTheme();
  const toast = useToast();
  const facilityId = useFacilityId();
  const { online } = useSyncState();
  const destinations = useDispatchDestinations(facilityId);
  const products = useProducts();
  const stock = useStockBalances(facilityId);
  const [destinationId, setDestinationId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [lines, setLines] = useState<IssueLine[]>([]);
  const [date, setDate] = useState(todayInLagos());
  const [voucher, setVoucher] = useState('');
  const [comments, setComments] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (destinations.isPending) return <Loading />;

  const all = destinations.data ?? [];
  const destination = all.find((d) => d.id === destinationId);
  const q = search.trim().toLowerCase();
  const matches = all.filter((d) => !q || d.name.toLowerCase().includes(q) || (d.lga?.name ?? '').toLowerCase().includes(q)).slice(0, 8);

  function save() {
    const { errors: e, items } = checkIssueLines(lines, stock.data);
    if (!destination) e.destination = destinations.isError ? 'Connect once to load the facilities you supply.' : 'Choose who it goes to.';
    if (!isDate(date) || date > todayInLagos()) e.date = 'A date up to today, as YYYY-MM-DD.';
    setErrors(e);
    if (Object.keys(e).length || !destination) return;

    enqueue({
      kind: 'dispatch',
      facilityId,
      destinationName: destination.name,
      body: {
        destination_facility_id: destination.id,
        dispatched_date: date,
        voucher_no: voucher.trim() || null,
        comments: comments.trim() || null,
        items,
      },
    });
    requestSync();
    toast({
      kind: online ? 'success' : 'queued',
      title: `Dispatch to ${destination.name} saved`,
      body: online ? 'It comes off your Stock Card and they confirm it on arrival.' : 'You’re offline — it will send automatically.',
    });
    router.back();
  }

  return (
    <Sheet
      eyebrow="Dispatch"
      title="Send stock down"
      footer={
        <>
          {!online && <Badge label="Offline — sends when you’re back online" tone="warning" />}
          <Button label="Dispatch" icon={Truck} size="lg" block onPress={save} />
        </>
      }>
      <SheetSection label="To">
        {destination ? (
          <Card style={[styles.picked, { borderColor: c.primary }]} onPress={() => setDestinationId(null)}>
            <Check size={18} color={c.primary} />
            <View style={{ flex: 1 }}>
              <Text variant="label">{destination.name}</Text>
              <Text variant="caption" tone="muted">
                {destination.lga?.name ?? destination.state?.name ?? ''} · tap to change
              </Text>
            </View>
          </Card>
        ) : (
          <>
            <TextField icon={Search} value={search} onChangeText={setSearch} placeholder="Search facilities you supply…" />
            {matches.map((d) => (
              <Card key={d.id} onPress={() => setDestinationId(d.id)} style={styles.picked}>
                <View style={{ flex: 1 }}>
                  <Text variant="label">{d.name}</Text>
                  {d.lga && (
                    <Text variant="caption" tone="muted">
                      {d.lga.name}
                    </Text>
                  )}
                </View>
              </Card>
            ))}
            {all.length === 0 && (
              <Text variant="small" tone="muted">
                {destinations.isError ? 'Connect once to load the facilities you supply.' : 'There is no facility below this store to dispatch to.'}
              </Text>
            )}
          </>
        )}
        {errors.destination && (
          <Text variant="caption" tone="critical">
            {errors.destination}
          </Text>
        )}
      </SheetSection>

      <SheetSection label="Products">
        <IssueLines lines={lines} onChange={setLines} stock={stock.data} products={products.data} errors={errors} />
      </SheetSection>

      <SheetSection>
        <TextField label="Dispatch date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" error={errors.date} />
        <TextField label="Voucher / waybill no. (optional)" value={voucher} onChangeText={setVoucher} placeholder="A DSP number is made if empty" autoCapitalize="characters" />
        <TextField label="Comments (optional)" value={comments} onChangeText={setComments} />
      </SheetSection>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  picked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
});
