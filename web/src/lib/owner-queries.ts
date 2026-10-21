import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, api, unwrap } from './api-client'
import { useAuthStore } from './auth-store'
import type { NewOrganization, Organization, Platform } from './types'

// The platform's branding (public) and the owner's console
// (docs/API_CONTRACT.md: Platform, Owner console).

/** The platform owner's name, tagline and logo: on the sign-in page and beside every organization's logo. */
export function usePlatform() {
  return useQuery({
    queryKey: ['platform'],
    queryFn: async () => (await unwrap(api.GET('/platform'))).data,
    staleTime: 30 * 60_000,
  })
}

export function useOrganizations() {
  return useQuery({
    queryKey: ['organizations'],
    queryFn: async () => (await unwrap(api.GET('/owner/organizations'))).data,
  })
}

export function useOrganization(id: number) {
  return useQuery({
    queryKey: ['organizations', id],
    queryFn: async () =>
      (await unwrap(api.GET('/owner/organizations/{organization}', { params: { path: { organization: id } } }))).data,
  })
}

export function useCreateOrganization() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: NewOrganization) => unwrap(api.POST('/owner/organizations', { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['organizations'] }),
  })
}

export function useUpdateOrganization(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: Partial<NewOrganization>) =>
      (await unwrap(api.PUT('/owner/organizations/{organization}', { params: { path: { organization: id } }, body: body as NewOrganization })))
        .data,
    onSuccess: (org) => {
      queryClient.setQueryData(['organizations', id], org)
      queryClient.invalidateQueries({ queryKey: ['organizations'], exact: true })
    },
  })
}

export function useOrganizationAdmins(id: number) {
  return useQuery({
    queryKey: ['organizations', id, 'admins'],
    queryFn: async () =>
      (await unwrap(api.GET('/owner/organizations/{organization}/admins', { params: { path: { organization: id } } }))).data,
  })
}

export function useAddOrganizationAdmin(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { name: string; email: string }) =>
      unwrap(api.POST('/owner/organizations/{organization}/admins', { params: { path: { organization: id } }, body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['organizations'] }),
  })
}

export function useSetAdminActive(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, is_active }: { userId: number; is_active: boolean }) =>
      unwrap(
        api.PUT('/owner/organizations/{organization}/admins/{user}', {
          params: { path: { organization: id, user: userId } },
          body: { is_active },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['organizations', id, 'admins'] }),
  })
}

export function useResetAdminPassword(id: number) {
  return useMutation({
    mutationFn: async (userId: number) =>
      unwrap(
        api.POST('/owner/organizations/{organization}/admins/{user}/reset-password', {
          params: { path: { organization: id, user: userId } },
        }),
      ),
  })
}

export function useSavePlatform() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { name: string; tagline?: string | null }) => (await unwrap(api.PUT('/owner/platform', { body }))).data,
    onSuccess: (platform) => queryClient.setQueryData(['platform'], platform),
  })
}

/**
 * Upload (file) or remove (null) a logo: the platform's, or an organization's.
 * Plain fetch for the multipart body; the generated client would send JSON.
 */
export function useLogo(target: 'platform' | number) {
  const queryClient = useQueryClient()
  const path = target === 'platform' ? '/owner/platform/logo' : `/owner/organizations/${target}/logo`

  return useMutation({
    mutationFn: async (file: File | null) => {
      const base = import.meta.env.VITE_API_URL ?? '/api/v1'
      const body = new FormData()
      if (file) body.append('logo', file)
      const res = await fetch(`${base}${path}`, {
        method: file ? 'POST' : 'DELETE',
        headers: { Accept: 'application/json', Authorization: `Bearer ${useAuthStore.getState().token}` },
        body: file ? body : undefined,
      })
      if (res.status === 401) useAuthStore.getState().clear('expired')
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new ApiError(res.status, json)
      return (json as { data: Platform | Organization }).data
    },
    onSuccess: (data) => {
      if (target === 'platform') {
        queryClient.setQueryData(['platform'], data)
      } else {
        queryClient.setQueryData(['organizations', target], data)
        queryClient.invalidateQueries({ queryKey: ['organizations'], exact: true })
      }
    },
  })
}
