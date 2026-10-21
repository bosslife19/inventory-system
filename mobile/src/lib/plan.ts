import { useCallback } from 'react';
import { Alert, Platform } from 'react-native';

import { useUser } from './session';
import type { Feature, User } from './types';

// What the organization's plan unlocks (docs/ROLES_AND_PERMISSIONS.md, "Plans").
// UX only: the API answers 402 feature_unavailable whatever the app shows,
// and a queued entry that meets one is marked failed with that reason.

export const FEATURE_LABEL: Record<Feature, string> = {
  rollups: 'LGA, State and Federal dashboards',
  supply_chain: 'Dispatches and reorder requests',
  delivery_scanning: 'Delivery note scanning',
  push_notifications: 'Push notifications',
  bulk_imports: 'Bulk CSV imports',
};

export function hasFeature(user: User, feature: Feature): boolean {
  return user.organization?.features.includes(feature) ?? false;
}

export function useFeature(feature: Feature): boolean {
  return hasFeature(useUser(), feature);
}

export function upgradeMessage(feature: Feature): string {
  const label = FEATURE_LABEL[feature];
  return `${label} ${label.endsWith('s') ? 'are' : 'is'} part of the paid plan. Your Stock Card, alerts and reports keep working — ask your organization’s admin about upgrading.`;
}

function explain(feature: Feature) {
  if (Platform.OS === 'web') window.alert(upgradeMessage(feature));
  else Alert.alert('Paid plan', upgradeMessage(feature));
}

/** Wraps an action the plan may not include: runs it, or explains why not. */
export function usePaidAction(feature: Feature) {
  const allowed = useFeature(feature);
  return useCallback((action: () => void) => () => (allowed ? action() : explain(feature)), [allowed, feature]);
}
