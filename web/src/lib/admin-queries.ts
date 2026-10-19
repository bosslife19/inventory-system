import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, api, unwrap } from './api-client'
import { useAuthStore } from './auth-store'
import type { Facility, NewFacility, NewProduct, NewUser, SaveProductLevels, UpdateUser, UserRole } from './types'

// Account, catalog and facility management (docs/API_CONTRACT.md: Users,
// Products, Hierarchy). The API decides who may do what; these just call it.

export interface UserFilters {
  role?: UserRole
  is_active?: boolean
  q?: string
  page: number
  per_page: number
}

export function useUsers(filters: UserFilters) {
  return useQuery({
    queryKey: ['users', filters],
    queryFn: () => unwrap(api.GET('/users', { params: { query: filters } })),
    placeholderData: keepPreviousData,
  })
}

export function useCreateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: NewUser) => unwrap(api.POST('/users', { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  })
}

export function useUpdateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, body }: { id: number; body: UpdateUser }) =>
      (await unwrap(api.PUT('/users/{user}', { params: { path: { user: id } }, body }))).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  })
}

export function useResetPassword() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => unwrap(api.POST('/users/{user}/reset-password', { params: { path: { user: id } } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  })
}

/** Your own password; clears a temporary one. */
export function useChangePassword() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { current_password: string; password: string; password_confirmation: string }) =>
      (await unwrap(api.POST('/auth/password', { body }))).data,
    onSuccess: (user) => queryClient.setQueryData(['me', useAuthStore.getState().token], user),
  })
}

/** The whole catalog, retired products included. */
export function useCatalog() {
  return useQuery({
    queryKey: ['products', 'all'],
    queryFn: async () => (await unwrap(api.GET('/products'))).data,
  })
}

export function useSaveProduct() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, body }: { id?: number; body: Partial<NewProduct> }) =>
      (
        await unwrap(
          id
            ? api.PUT('/products/{product}', { params: { path: { product: id } }, body: body as NewProduct })
            : api.POST('/products', { body: body as NewProduct }),
        )
      ).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  })
}

export function useLgas(stateId: number | null) {
  return useQuery({
    queryKey: ['lgas', stateId],
    queryFn: async () => (await unwrap(api.GET('/states/{state}/lgas', { params: { path: { state: stateId! } } }))).data,
    enabled: stateId !== null,
    staleTime: 60 * 60_000,
  })
}

/** SDPs in an LGA (the LGA's store is not listed). */
export function useLgaFacilities(lgaId: number | null) {
  return useQuery({
    queryKey: ['lga-facilities', lgaId],
    queryFn: async () =>
      (await unwrap(api.GET('/lgas/{lga}/facilities', { params: { path: { lga: lgaId! } } }))).data,
    enabled: lgaId !== null,
  })
}

export function useSaveFacility() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, body }: { id?: number; body: Partial<NewFacility> }): Promise<Facility> =>
      (
        await unwrap(
          id
            ? api.PUT('/facilities/{facility}', { params: { path: { facility: id } }, body: body as NewFacility })
            : api.POST('/facilities', { body: body as NewFacility }),
        )
      ).data,
    onSuccess: (f) => {
      queryClient.invalidateQueries({ queryKey: ['lga-facilities'] })
      queryClient.invalidateQueries({ queryKey: ['facility', f.id] })
      queryClient.invalidateQueries({ queryKey: ['lga-summary'] })
    },
  })
}

/** A facility's min / EOP / max per product: its own where set, else the catalog's. */
export function useProductLevels(facilityId: number) {
  return useQuery({
    queryKey: ['product-levels', facilityId],
    queryFn: async () =>
      (await unwrap(api.GET('/facilities/{facility}/product-levels', { params: { path: { facility: facilityId } } }))).data,
  })
}

/** Enter (a number) or clear (null) the AMC a facility uses while its own history is short. */
export function useSaveEnteredAmc(facilityId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ productId, amc }: { productId: number; amc: number | null }) => {
      const params = { path: { facility: facilityId, product: productId } }
      if (amc !== null) await unwrap(api.PUT('/facilities/{facility}/product-amcs/{product}', { params, body: { amc_quantity: amc } }))
      else {
        const { response, error } = await api.DELETE('/facilities/{facility}/product-amcs/{product}', { params })
        if (!response.ok) throw new ApiError(response.status, error)
      }
    },
    onSuccess: () => {
      for (const key of [['product-levels', facilityId], ['reorder-suggestions', facilityId]]) {
        queryClient.invalidateQueries({ queryKey: key })
      }
    },
  })
}

/** Set (levels given) or clear (null: back to the catalog's) one product's levels at a facility. */
export function useSaveProductLevels(facilityId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ productId, levels }: { productId: number; levels: SaveProductLevels | null }) => {
      const params = { path: { facility: facilityId, product: productId } }
      if (levels) await unwrap(api.PUT('/facilities/{facility}/product-levels/{product}', { params, body: levels }))
      else {
        // 204: no body for unwrap() to return.
        const { response, error } = await api.DELETE('/facilities/{facility}/product-levels/{product}', { params })
        if (!response.ok) throw new ApiError(response.status, error)
      }
    },
    onSuccess: () => {
      // Thresholds moved: the facility's status, alerts and the rollups above may have too.
      for (const key of [['product-levels', facilityId], ['stock-balances', facilityId], ['reorder-suggestions', facilityId], ['alerts'], ['lga-summary'], ['state-summary'], ['federal-summary']]) {
        queryClient.invalidateQueries({ queryKey: key })
      }
    },
  })
}
