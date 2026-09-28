import { CloudCheck, CloudOff, RefreshCw, TriangleAlert } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useOutbox } from '@/lib/offlineQueue';
import { useSyncState } from '@/lib/sync';

import { Text } from './ui/text';

/** Online / offline and outbox state, for the dark hero header. */
export function SyncPill() {
  const outbox = useOutbox();
  const { online, running } = useSyncState();
  const pending = outbox.filter((i) => i.status !== 'failed').length;
  const failed = outbox.filter((i) => i.status === 'failed').length;

  const { Icon, label, dot } = failed
    ? { Icon: TriangleAlert, label: `${failed} need${failed === 1 ? 's' : ''} attention`, dot: '#f0a616' }
    : running
      ? { Icon: RefreshCw, label: 'Syncing…', dot: '#6ea0ff' }
      : !online
        ? { Icon: CloudOff, label: pending ? `Offline · ${pending} waiting` : 'Offline', dot: '#f0a616' }
        : pending
          ? { Icon: RefreshCw, label: `${pending} waiting to sync`, dot: '#6ea0ff' }
          : { Icon: CloudCheck, label: 'All synced', dot: '#1f9d4c' };

  return (
    <View style={styles.pill} accessibilityLabel={`Sync status: ${label}`}>
      <View style={[styles.dot, { backgroundColor: dot }]} />
      <Icon size={14} color="#ffffff" />
      <Text variant="caption" weight="semibold" tone="inverse">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: Spacing.three,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
});
