import type { UseQueryResult } from '@tanstack/react-query';
import { router } from 'expo-router';
import { CloudOff, ShieldAlert } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { PageHeader } from '@/components/page-header';
import { RollupView } from '@/components/rollup';
import { EmptyState, Loading } from '@/components/ui/misc';
import { useTheme } from '@/hooks/use-theme';
import { isNetworkError } from '@/lib/api';
import { useAreaActivity, useFederalSummary, useLgaSummary, useStateSummary } from '@/lib/queries';
import { useUser } from '@/lib/session';
import type { RollupSummary, StockActivity } from '@/lib/types';

export type AreaLevel = 'lga' | 'state' | 'national';

interface Props {
  level: AreaLevel;
  /** Null for the nation. */
  id: number | null;
  /** A drill-down screen (back button) rather than the overview tab. */
  back?: boolean;
  bottomInset: number;
}

/** An LGA, state or the nation's rollup dashboard, loaded by level. */
export function AreaDashboard(props: Props) {
  if (props.level === 'lga') return <Lga {...props} id={props.id!} />;
  if (props.level === 'state') return <State {...props} id={props.id!} />;
  return <Federal {...props} />;
}

function Lga({ id, back, bottomInset }: Props & { id: number }) {
  const summary = useLgaSummary(id);
  const activity = useAreaActivity('lga', id);
  const s = summary.data;
  return (
    <Dashboard
      query={summary}
      activity={activity}
      back={back}
      bottomInset={bottomInset}
      eyebrow="LGA overview"
      title={s ? `${s.node.name} LGA` : 'LGA'}
      subtitle={s ? `${s.node.parent.name} State · live rollup` : ''}
      store={s?.node.store}
      childNoun="Facilities"
    />
  );
}

function State({ id, back, bottomInset }: Props & { id: number }) {
  const summary = useStateSummary(id);
  const activity = useAreaActivity('state', id);
  const s = summary.data;
  return (
    <Dashboard
      query={summary}
      activity={activity}
      back={back}
      bottomInset={bottomInset}
      eyebrow="State overview"
      title={s ? `${s.node.name} State` : 'State'}
      subtitle="Every LGA in the state · live rollup"
      store={s?.node.store}
      childNoun="LGAs"
    />
  );
}

function Federal({ back, bottomInset }: Props) {
  const summary = useFederalSummary();
  const activity = useAreaActivity('national', null);
  return (
    <Dashboard
      query={summary}
      activity={activity}
      back={back}
      bottomInset={bottomInset}
      eyebrow="National overview"
      title="Nigeria"
      subtitle="All states and the FCT · live rollup"
      store={summary.data?.node.store}
      childNoun="States"
    />
  );
}

interface DashboardProps {
  query: UseQueryResult<RollupSummary>;
  activity: UseQueryResult<StockActivity>;
  back?: boolean;
  bottomInset: number;
  eyebrow: string;
  title: string;
  subtitle: string;
  store: { id: number; name: string } | null | undefined;
  childNoun: string;
}

function Dashboard({ query, activity, back, bottomInset, eyebrow, title, subtitle, store, childNoun }: DashboardProps) {
  const c = useTheme();
  const user = useUser();
  const [refreshing, setRefreshing] = useState(false);

  if (!query.data) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <PageHeader back={back} eyebrow={eyebrow} title={title} />
        {query.isPending ? (
          <Loading />
        ) : isNetworkError(query.error) ? (
          <EmptyState icon={CloudOff} title="You're offline" body="The dashboard loads when you're back online." />
        ) : (
          <EmptyState icon={ShieldAlert} title="Can't open this dashboard" body={query.error?.message} />
        )}
      </View>
    );
  }

  async function refresh() {
    setRefreshing(true);
    await Promise.all([query.refetch(), activity.refetch()]);
    setRefreshing(false);
  }

  // Your own store is the Store tab; anyone else's opens read-only like a facility.
  const own = store != null && user.store?.id === store.id;

  return (
    <RollupView
      back={back}
      eyebrow={eyebrow}
      title={title}
      subtitle={`${subtitle}${query.isFetching && !refreshing ? ' · updating…' : ''}`}
      summary={query.data}
      activity={activity}
      store={
        store
          ? {
              name: store.name,
              hint: own ? 'Your store — record, dispatch and answer requests' : 'This area’s store: its stock and Stock Card',
              onPress: () => (own ? router.navigate('/') : router.push({ pathname: '/facility/[id]', params: { id: String(store.id) } })),
            }
          : null
      }
      childNoun={childNoun}
      onOpen={(row) =>
        row.level === 'facility'
          ? router.push({ pathname: '/facility/[id]', params: { id: String(row.id) } })
          : router.push({ pathname: '/area/[level]/[id]', params: { level: row.level, id: String(row.id) } })
      }
      refreshing={refreshing}
      onRefresh={() => void refresh()}
      bottomInset={bottomInset}
    />
  );
}
