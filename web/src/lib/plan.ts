import type { Feature, User, UserRole } from './types'

// What the organization's plan unlocks (docs/ROLES_AND_PERMISSIONS.md, "Plans").
// UX only: the API answers 402 feature_unavailable whatever the screen shows.

export const FEATURE_LABEL: Record<Feature, string> = {
  multiple_accounts: 'More than one account per role',
  multiple_facilities: 'More than one facility',
  supply_chain: 'Dispatches and reorder requests',
  delivery_scanning: 'Delivery note capture',
  push_notifications: 'Push notifications',
  bulk_imports: 'Bulk CSV imports',
}

export function hasFeature(user: User, feature: Feature): boolean {
  return user.organization?.features.includes(feature) ?? false
}

/** Free plan: the role already has its one active account (other than `except`, the account being changed). */
export function roleInUse(user: User, role: UserRole, except?: User): boolean {
  const inUse = (user.organization?.limits?.roles_in_use as UserRole[] | undefined)?.includes(role) ?? false
  return inUse && !(except && except.is_active && except.role === role)
}

/** Free plan: the one open facility already exists. */
export function facilityInUse(user: User): boolean {
  return user.organization?.limits?.facility_in_use ?? false
}

/** Paid tier: every active account it allows is in use (any role). */
export function accountsFull(user: User): boolean {
  const l = user.organization?.limits
  return l?.max_accounts != null && l.accounts_in_use >= l.max_accounts
}

/** Free plan or paid tier: every open facility it allows is in use. */
export function facilitiesFull(user: User): boolean {
  const l = user.organization?.limits
  return l?.max_facilities != null && l.facilities_in_use >= l.max_facilities
}

/** On the paid plan: limits come from its tier, and upgrading means a bigger tier. */
export function onPaidPlan(user: User): boolean {
  return user.organization?.plan === 'paid'
}

export function isOwner(user: User): boolean {
  return user.role === 'owner'
}
