import { AreaDashboard } from '@/components/area-dashboard';
import { Spacing, TabBarInset } from '@/constants/theme';
import { useUser } from '@/lib/session';

/** Officers' and admins' landing tab: the rollup for their own LGA, state or the nation. */
export default function Overview() {
  const { node } = useUser();
  const level = node.level === 'lga' || node.level === 'state' ? node.level : 'national';
  return <AreaDashboard level={level} id={level === 'national' ? null : node.id} bottomInset={TabBarInset + Spacing.four} />;
}
