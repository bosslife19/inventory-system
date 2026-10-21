import { CloudOff, FileText, Search } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { Chip, ChipRow, Segmented } from '@/components/ui/chip';
import { EmptyState, Loading } from '@/components/ui/misc';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { isNetworkError } from '@/lib/api';
import { formatDate, formatQty, todayInLagos } from '@/lib/format';
import { useReport, type ReportName } from '@/lib/queries';
import { useFacilityId, useUser } from '@/lib/session';
import type { ReportResult } from '@/lib/types';

const REPORTS: { value: ReportName; label: string; hint: string }[] = [
  { value: 'stock-status', label: 'Stock status', hint: 'Usable stock against min / EOP / max' },
  { value: 'stock-movement', label: 'Stock movement', hint: 'Month or quarter end: opening, received, used, closing' },
  { value: 'reorder', label: 'Reorder', hint: 'AMC, months of stock and quantity to order' },
  { value: 'expiry', label: 'Expiry', hint: 'Batches expired or expiring soon' },
];

const LEVELS = [
  { value: '', label: 'All' },
  { value: 'stock_out', label: 'Stock-out' },
  { value: 'low_stock', label: 'At EOP' },
  { value: 'reorder', label: 'Below min' },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The last three complete months and two complete quarters, most recent first: YYYY-MM / YYYY-Qn. */
function recentPeriods(): { value: string; label: string }[] {
  const [y, m] = todayInLagos().split('-').map(Number);
  const months = [1, 2, 3].map((back) => {
    const d = new Date(Date.UTC(y, m - 1 - back, 1));
    return { value: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`, label: `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` };
  });
  const thisQuarter = Math.floor((m - 1) / 3);
  const quarters = [1, 2].map((back) => {
    const q = thisQuarter - back;
    const year = y + Math.floor(q / 4);
    const n = ((q % 4) + 4) % 4 + 1;
    return { value: `${year}-Q${n}`, label: `Q${n} ${year}` };
  });
  return [...months, ...quarters];
}

type Row = ReportResult['rows'][number];
type Column = ReportResult['columns'][number];

/** Columns shown as the card's title and subtitle rather than in its grid. */
const HEADING_KEYS = ['product', 'sku', 'unit', 'state', 'lga', 'facility'];

/**
 * Read-only reports, for this facility / store or (officers) their whole area.
 * The same reports as the web; printing and CSV downloads stay on the web.
 */
export default function Reports() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const user = useUser();
  const facilityId = useFacilityId();
  const periods = recentPeriods();
  const [report, setReport] = useState<ReportName>('stock-status');
  const hasArea = user.node.level !== 'facility';
  const [scope, setScope] = useState<'own' | 'area'>('own');
  const [period, setPeriod] = useState(periods[0].value);
  const [level, setLevel] = useState('');
  const [withinDays, setWithinDays] = useState(90);
  const [search, setSearch] = useState('');

  const area =
    scope === 'area' && hasArea
      ? { area: user.node.level, id: user.node.level === 'national' ? undefined : (user.node.id ?? undefined) }
      : { area: 'facility', id: facilityId };
  const params = {
    ...area,
    ...(report === 'stock-movement' ? { period } : {}),
    ...(report === 'stock-status' ? { level: level || undefined } : {}),
    ...(report === 'reorder' ? { needs_order: true } : {}),
    ...(report === 'expiry' ? { within_days: withinDays } : {}),
  };
  const result = useReport(report, params);
  const data = result.data;
  const q = search.trim().toLowerCase();
  const rows = (data?.rows ?? []).filter(
    (r) => !q || [r.product, r.sku, r.facility].some((v) => typeof v === 'string' && v.toLowerCase().includes(q)),
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <FlatList
        data={result.isPending ? [] : rows}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + Spacing.eight }]}
        refreshControl={<RefreshControl refreshing={result.isRefetching} onRefresh={() => void result.refetch()} tintColor={c.primary} />}
        ListHeaderComponent={
          <View style={{ gap: Spacing.four, marginBottom: Spacing.four }}>
            <PageHeader back eyebrow="Reports" title={REPORTS.find((r) => r.value === report)!.label} subtitle={REPORTS.find((r) => r.value === report)!.hint} />
            <View style={[styles.pad, { gap: Spacing.three }]}>
              <ChipRow>
                {REPORTS.map((r) => (
                  <Chip key={r.value} label={r.label} selected={r.value === report} onPress={() => setReport(r.value)} />
                ))}
              </ChipRow>
              {hasArea && (
                <Segmented
                  options={[
                    { value: 'own', label: user.store?.name ?? 'My store' },
                    { value: 'area', label: user.node.level === 'national' ? 'All facilities' : `${user.node.name} facilities` },
                  ]}
                  value={scope}
                  onChange={setScope}
                />
              )}
              {report === 'stock-movement' && (
                <ChipRow>
                  {periods.map((p) => (
                    <Chip key={p.value} label={p.label} selected={p.value === period} onPress={() => setPeriod(p.value)} />
                  ))}
                </ChipRow>
              )}
              {report === 'stock-status' && (
                <ChipRow>
                  {LEVELS.map((l) => (
                    <Chip key={l.value} label={l.label} selected={l.value === level} onPress={() => setLevel(l.value)} />
                  ))}
                </ChipRow>
              )}
              {report === 'expiry' && (
                <ChipRow>
                  {[30, 90, 180].map((d) => (
                    <Chip key={d} label={`Within ${d} days`} selected={d === withinDays} onPress={() => setWithinDays(d)} />
                  ))}
                </ChipRow>
              )}
              <TextField icon={Search} value={search} onChangeText={setSearch} placeholder="Filter by product or facility…" />
              {data && (
                <Text variant="caption" tone="muted">
                  {data.scope.name} · {formatQty(rows.length)} row{rows.length === 1 ? '' : 's'}
                  {data.truncated ? ' (first 500 — download the CSV on the web for all)' : ''}
                </Text>
              )}
            </View>
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: Spacing.three }} />}
        renderItem={({ item }) => (
          <View style={styles.pad}>
            <RowCard row={item} columns={data?.columns ?? []} />
          </View>
        )}
        ListEmptyComponent={
          result.isPending ? (
            <Loading />
          ) : result.isError ? (
            isNetworkError(result.error) ? (
              <EmptyState icon={CloudOff} title="You're offline" body="Reports need a connection." />
            ) : (
              <EmptyState icon={FileText} title="Couldn’t run the report" body={result.error.message} />
            )
          ) : (
            <EmptyState icon={FileText} title="Nothing to show" body={q ? 'No rows match that filter.' : 'No rows for this report and area.'} />
          )
        }
      />
    </View>
  );
}

function show(value: Row[string], type: Column['type']): string {
  if (value === null || value === undefined || value === '') return '—';
  if (type === 'number' && typeof value === 'number') return formatQty(value);
  if (type === 'date' && typeof value === 'string') return formatDate(value);
  return String(value);
}

/** One report row as a card: product and place on top, figures in a grid, notes underneath. */
function RowCard({ row, columns }: { row: Row; columns: Column[] }) {
  const c = useTheme();
  const figures = columns.filter((col) => !HEADING_KEYS.includes(col.key) && col.type !== 'text');
  const notes = columns.filter((col) => !HEADING_KEYS.includes(col.key) && col.type === 'text' && row[col.key]);
  const place = [row.facility, row.lga].filter(Boolean).join(' · ');
  // A count that disagrees with the card, or nothing usable left.
  const flagged = (typeof row.difference === 'number' && row.difference !== 0) || row.level === 'Stock-out' || row.status === 'Expired';

  return (
    <Card style={[{ gap: Spacing.three }, flagged && { borderColor: c.critical, backgroundColor: c.criticalSoft }]}>
      <View style={{ gap: 2 }}>
        <Text variant="label">{show(row.product, 'text')}</Text>
        <Text variant="caption" tone="muted">
          {[row.sku, row.unit, place].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <View style={styles.grid}>
        {figures.map((col) => (
          <View key={col.key} style={styles.cell}>
            <Text variant="caption" tone="muted" numberOfLines={2}>
              {col.label}
            </Text>
            <Text variant="label" tone={col.key === 'difference' && flagged ? 'critical' : 'default'}>
              {show(row[col.key], col.type)}
            </Text>
          </View>
        ))}
      </View>
      {notes.map((col) => (
        <Text key={col.key} variant="caption" tone="secondary">
          {col.label}: {show(row[col.key], 'text')}
        </Text>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  list: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  pad: {
    paddingHorizontal: Spacing.five,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: Spacing.three,
  },
  cell: {
    width: '33.33%',
    paddingRight: Spacing.two,
    gap: 2,
  },
});
