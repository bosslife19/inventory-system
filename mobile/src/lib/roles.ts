import type { User, UserRole } from './types';

// UX only — mirrors HierarchyScope on the backend, which is the real gate
// (root CLAUDE.md rule 3). Same rules as web/src/lib/auth.ts.

/** LGA / State / Federal officers and admins: they get the area dashboard, not a single facility's app. */
export function isAreaUser(user: User): boolean {
  return user.role !== 'sdp_staff' && user.facility_id == null;
}

/** Roles whose accounts this user creates and manages — mirrors HierarchyScope::manageableRoles(). */
export function manageableRoles(user: User): UserRole[] {
  switch (user.role) {
    case 'admin':
      return ['sdp_staff', 'lga_officer', 'state_officer', 'federal_officer', 'admin'];
    case 'federal_officer':
      return ['state_officer'];
    case 'state_officer':
      return ['lga_officer'];
    case 'lga_officer':
      return ['sdp_staff'];
    default:
      return [];
  }
}

/** Staff record at their own facility, officers at their own store. (Admins record from the web.) */
export function canRecordAt(user: User, facilityId: number): boolean {
  return user.facility_id === facilityId || user.store?.id === facilityId;
}
