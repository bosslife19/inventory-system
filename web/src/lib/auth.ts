import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from './api-client'
import { useAuthStore } from './auth-store'
import type { User, UserRole } from './types'

export function useMe() {
  const token = useAuthStore((s) => s.token)

  return useQuery({
    queryKey: ['me', token],
    queryFn: async () => (await unwrap(api.GET('/auth/me'))).data,
    enabled: token !== null,
    staleTime: 5 * 60_000,
    retry: false,
  })
}

export function useLogin() {
  const queryClient = useQueryClient()
  const setToken = useAuthStore((s) => s.setToken)

  return useMutation({
    mutationFn: async (credentials: { email: string; password: string }) =>
      (await unwrap(api.POST('/auth/login', { body: { ...credentials, device_name: 'web' } }))).data,
    onSuccess: ({ token, user }) => {
      queryClient.setQueryData(['me', token], user)
      setToken(token)
    },
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  const clear = useAuthStore((s) => s.clear)

  return useMutation({
    mutationFn: async () => {
      await api.POST('/auth/logout')
    },
    onSettled: () => {
      clear('signed_out')
      queryClient.clear()
    },
  })
}

/** Role-driven landing route (web/CLAUDE.md rule 1). */
export function homePath(user: User): string {
  switch (user.role) {
    case 'sdp_staff':
      return '/sdp'
    case 'lga_officer':
      return '/lga'
    case 'state_officer':
      return '/state'
    case 'owner':
      return '/owner'
    default:
      return '/federal'
  }
}

/** Roles whose accounts this user creates and manages — mirrors HierarchyScope::manageableRoles(). UX only. */
export function manageableRoles(user: User): UserRole[] {
  switch (user.role) {
    case 'admin':
      return ['sdp_staff', 'lga_officer', 'state_officer', 'federal_officer', 'admin']
    case 'federal_officer':
      return ['state_officer']
    case 'state_officer':
      return ['lga_officer']
    case 'lga_officer':
      return ['sdp_staff']
    default:
      return []
  }
}

/**
 * Staff record at their own facility, officers at their own store, admins
 * anywhere. UX only — the backend's StockTransactionPolicy is the real gate.
 */
export function canRecordAt(user: User, facilityId: number): boolean {
  return user.role === 'admin' || (user.role === 'sdp_staff' && user.facility_id === facilityId) || user.store?.id === facilityId
}
