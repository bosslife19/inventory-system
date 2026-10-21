import type { Feature, User } from './types'

// What the organization's plan unlocks (docs/ROLES_AND_PERMISSIONS.md, "Plans").
// UX only: the API answers 402 feature_unavailable whatever the screen shows.

export const FEATURE_LABEL: Record<Feature, string> = {
  rollups: 'LGA, State and Federal dashboards',
  supply_chain: 'Dispatches and reorder requests',
  delivery_scanning: 'Delivery note capture',
  push_notifications: 'Push notifications',
  bulk_imports: 'Bulk CSV imports',
}

export function hasFeature(user: User, feature: Feature): boolean {
  return user.organization?.features.includes(feature) ?? false
}

export function isOwner(user: User): boolean {
  return user.role === 'owner'
}
