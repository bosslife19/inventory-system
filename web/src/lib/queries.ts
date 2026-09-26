import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from './api-client'
import type { NewStockTransaction, TransactionType } from './types'

// Rollups poll instead of live push: no WebSocket server on shared hosting (docs/ARCHITECTURE.md).
const ROLLUP_POLL_MS = 60_000

export function useFacility(id: number) {
  return useQuery({
    queryKey: ['facility', id],
    queryFn: async () => (await unwrap(api.GET('/facilities/{facility}', { params: { path: { facility: id } } }))).data,
  })
}

export function useStockBalances(facilityId: number) {
  return useQuery({
    queryKey: ['stock-balances', facilityId],
    queryFn: async () =>
      (await unwrap(api.GET('/facilities/{facility}/stock-balances', { params: { path: { facility: facilityId } } })))
        .data,
  })
}

export interface HistoryFilters {
  product_id?: number
  transaction_type?: TransactionType
  from?: string
  to?: string
  order: 'asc' | 'desc'
  page: number
  per_page: number
}

export function useStockTransactions(facilityId: number, filters: HistoryFilters) {
  return useQuery({
    queryKey: ['stock-transactions', facilityId, filters],
    queryFn: () =>
      unwrap(
        api.GET('/facilities/{facility}/stock-transactions', {
          params: { path: { facility: facilityId }, query: filters },
        }),
      ),
    placeholderData: keepPreviousData,
  })
}

export function useProducts() {
  return useQuery({
    queryKey: ['products'],
    queryFn: async () => (await unwrap(api.GET('/products', { params: { query: { is_active: true } } }))).data,
    staleTime: 10 * 60_000,
  })
}

export function useRecordTransaction(facilityId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (body: NewStockTransaction) =>
      (
        await unwrap(
          api.POST('/facilities/{facility}/stock-transactions', { params: { path: { facility: facilityId } }, body }),
        )
      ).data,
    onSuccess: () => {
      // Show the server's new balances; never patch them client-side (web/CLAUDE.md rule 4).
      queryClient.invalidateQueries({ queryKey: ['stock-balances', facilityId] })
      queryClient.invalidateQueries({ queryKey: ['stock-transactions', facilityId] })
      queryClient.invalidateQueries({ queryKey: ['lga-summary'] })
    },
  })
}

export function useLgaSummary(lgaId: number) {
  return useQuery({
    queryKey: ['lga-summary', lgaId],
    queryFn: async () => (await unwrap(api.GET('/lgas/{lga}/stock-summary', { params: { path: { lga: lgaId } } }))).data,
    refetchInterval: ROLLUP_POLL_MS,
  })
}

export function useStates() {
  return useQuery({
    queryKey: ['states'],
    queryFn: async () => (await unwrap(api.GET('/states'))).data,
    staleTime: 60 * 60_000,
  })
}

export function useStateLgas(stateId: number) {
  return useQuery({
    queryKey: ['state-lgas', stateId],
    queryFn: async () => (await unwrap(api.GET('/states/{state}/lgas', { params: { path: { state: stateId } } }))).data,
    staleTime: 60 * 60_000,
  })
}
