import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AreaDashboard } from '@/components/area-dashboard';
import { Spacing } from '@/constants/theme';

/** Drill-down from a rollup: one state's or LGA's dashboard. The API limits it to the caller's area. */
export default function AreaScreen() {
  const insets = useSafeAreaInsets();
  const { level, id } = useLocalSearchParams<{ level: string; id: string }>();
  return <AreaDashboard key={`${level}-${id}`} level={level === 'state' ? 'state' : 'lga'} id={Number(id)} back bottomInset={insets.bottom + Spacing.eight} />;
}
