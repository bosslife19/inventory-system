import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, getJson, unwrap } from './api';
import type { AlertStatus, AuditCategory, DeliveryNoteStatus, NewUser, ReportResult, StockActivity, UpdateUser, UserRole } from './types';

// Server state only; cached to device storage (see _layout) so screens open
// offline with the last data seen. Balances always come from the API
// (root CLAUDE.md rule 2) — pending outbox entries are shown alongside,
// never folded into them.

export function useFacility(id: number) {
  return useQuery({
    queryKey: ['facility', id],
    queryFn: async () => (await unwrap(api.GET('/facilities/{facility}', { params: { path: { facility: id } } }))).data,
    staleTime: 10 * 60_000,
  });
}

export function useStockBalances(facilityId: number) {
  return useQuery({
    queryKey: ['stock-balances', facilityId],
    queryFn: async () =>
      (await unwrap(api.GET('/facilities/{facility}/stock-balances', { params: { path: { facility: facilityId } } }))).data,
  });
}

export function useProductHistory(facilityId: number, productId: number) {
  return useQuery({
    queryKey: ['stock-transactions', facilityId, productId],
    queryFn: async () =>
      (
        await unwrap(
          api.GET('/facilities/{facility}/stock-transactions', {
            params: { path: { facility: facilityId }, query: { product_id: productId, per_page: 30, order: 'desc' } },
          }),
        )
      ).data,
  });
}

export function useRecentTransactions(facilityId: number) {
  return useQuery({
    queryKey: ['stock-transactions', facilityId, 'recent'],
    queryFn: async () =>
      (
        await unwrap(
          api.GET('/facilities/{facility}/stock-transactions', {
            params: { path: { facility: facilityId }, query: { per_page: 8, order: 'desc' } },
          }),
        )
      ).data,
  });
}

export function useProducts() {
  return useQuery({
    queryKey: ['products'],
    queryFn: async () => (await unwrap(api.GET('/products', { params: { query: { is_active: true } } }))).data,
    staleTime: 60 * 60_000,
  });
}

/** Every product's levels here, with the starting AMC entered for it (entered_amc, null if none). */
export function useProductLevels(facilityId: number) {
  return useQuery({
    queryKey: ['product-levels', facilityId],
    queryFn: async () =>
      (await unwrap(api.GET('/facilities/{facility}/product-levels', { params: { path: { facility: facilityId } } }))).data,
  });
}

export function useActivity(facilityId: number) {
  return useQuery({
    queryKey: ['stock-activity', facilityId],
    queryFn: async () =>
      (await unwrap(api.GET('/facilities/{facility}/stock-activity', { params: { path: { facility: facilityId } } })))
        .data as StockActivity,
  });
}

export function useReorderSuggestions(facilityId: number) {
  return useQuery({
    queryKey: ['reorder-suggestions', facilityId],
    queryFn: async () =>
      (await unwrap(api.GET('/facilities/{facility}/reorder-suggestions', { params: { path: { facility: facilityId } } })))
        .data,
  });
}

export function useAlerts(status?: AlertStatus, facilityId?: number) {
  return useQuery({
    queryKey: ['alerts', status ?? 'active', facilityId],
    queryFn: () =>
      unwrap(api.GET('/alerts', { params: { query: { status, facility_id: facilityId, per_page: 50 } } })),
    refetchInterval: 60_000,
  });
}

export function useAlertAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, action }: { id: number; action: 'acknowledge' | 'resolve' }) =>
      (
        await unwrap(
          action === 'acknowledge'
            ? api.POST('/alerts/{alert}/acknowledge', { params: { path: { alert: id } } })
            : api.POST('/alerts/{alert}/resolve', { params: { path: { alert: id } } }),
        )
      ).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  });
}

/** The signed-in user's own notifications (per-alert notices and officer digests), newest first. */
export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: () => unwrap(api.GET('/notifications', { params: { query: { per_page: 50 } } })),
    refetchInterval: 60_000,
  });
}

export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    /** One notification, or all of them with no id. */
    mutationFn: async (id?: number) => {
      if (id !== undefined) await unwrap(api.POST('/notifications/{notification}/read', { params: { path: { notification: id } } }));
      else await api.POST('/notifications/read-all');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

/** The stores above this facility it may ask, nearest first — cached for offline requests. */
export function useReorderSuppliers(facilityId: number) {
  return useQuery({
    queryKey: ['reorder-suppliers', facilityId],
    queryFn: async () =>
      (await unwrap(api.GET('/facilities/{facility}/reorder-suppliers', { params: { path: { facility: facilityId } } }))).data,
    staleTime: 60 * 60_000,
  });
}

/** What this facility has asked the stores above for, pending first. */
export function useMyReorderRequests(facilityId: number) {
  return useQuery({
    queryKey: ['reorder-requests', facilityId, 'outgoing'],
    queryFn: () =>
      unwrap(
        api.GET('/facilities/{facility}/reorder-requests', {
          params: { path: { facility: facilityId }, query: { direction: 'outgoing', per_page: 30 } },
        }),
      ),
  });
}

/** Requests from the facilities below waiting on this store (pending first), for its officers to answer. */
export function useIncomingRequests(facilityId: number, enabled = true) {
  return useQuery({
    queryKey: ['reorder-requests', facilityId, 'incoming'],
    queryFn: () =>
      unwrap(
        api.GET('/facilities/{facility}/reorder-requests', {
          params: { path: { facility: facilityId }, query: { direction: 'incoming', per_page: 50 } },
        }),
      ),
    enabled,
    refetchInterval: 60_000,
  });
}

/** Decline a request to this store, with an optional reason. Needs a connection. */
export function useDeclineReorderRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason: string | null }) =>
      (
        await unwrap(
          api.POST('/reorder-requests/{reorderRequest}/reject', { params: { path: { reorderRequest: id } }, body: { reason } }),
        )
      ).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reorder-requests'] }),
  });
}

/** The facilities one level down this store may dispatch to — cached for offline dispatches. */
export function useDispatchDestinations(facilityId: number) {
  return useQuery({
    queryKey: ['dispatch-destinations', facilityId],
    queryFn: async () =>
      (await unwrap(api.GET('/facilities/{facility}/dispatch-destinations', { params: { path: { facility: facilityId } } })))
        .data,
    staleTime: 60 * 60_000,
  });
}

/** This facility's delivery notes, newest first: drafts are deliveries waiting to be signed for. */
export function useDeliveryNotes(facilityId: number, status?: DeliveryNoteStatus) {
  return useQuery({
    queryKey: ['delivery-notes', facilityId, status ?? 'all'],
    queryFn: () =>
      unwrap(
        api.GET('/facilities/{facility}/delivery-notes', {
          params: { path: { facility: facilityId }, query: { status, per_page: 50 } },
        }),
      ),
  });
}

/** Refuse a delivery sent from a store: nothing is added here and the stock goes back on the sender's card. */
export function useRejectDelivery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason: string | null }) =>
      (
        await unwrap(
          api.POST('/delivery-notes/{deliveryNote}/reject', { params: { path: { deliveryNote: id } }, body: { reason } }),
        )
      ).data,
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

export type ReportName = 'stock-status' | 'stock-movement' | 'reorder' | 'expiry';

/** A report as JSON (GET /reports/{report}); `params` carries area / id and the report's own filters. */
export function useReport(report: ReportName, params: Record<string, string | number | boolean | undefined>) {
  return useQuery({
    queryKey: ['report', report, params],
    queryFn: async () => (await getJson<{ data: ReportResult }>(`/reports/${report}`, { ...params, limit: 500 })).data,
  });
}

export function useCancelReorderRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) =>
      (await unwrap(api.POST('/reorder-requests/{reorderRequest}/cancel', { params: { path: { reorderRequest: id } } }))).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reorder-requests'] }),
  });
}

/** Sign for a delivery sent from a store (e.g. a fulfilled reorder request): posts the receipts. Needs a connection. */
export function useConfirmDelivery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) =>
      (await unwrap(api.POST('/delivery-notes/{deliveryNote}/confirm', { params: { path: { deliveryNote: id } }, body: {} }))).data,
    // Balances, history, alerts and the request's delivery status all change.
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

/** The platform owner's name, tagline and logo (public): on sign-in and beside the organization's logo. */
export function usePlatform() {
  return useQuery({
    queryKey: ['platform'],
    queryFn: async () => (await unwrap(api.GET('/platform'))).data,
    staleTime: 60 * 60_000,
  });
}

// ---------------------------------------------------------------- area dashboards (officers and admins)

/** Rollups refresh every minute, like the web dashboards. */
const ROLLUP_REFRESH = 60_000;

export function useLgaSummary(lgaId: number) {
  return useQuery({
    queryKey: ['stock-summary', 'lga', lgaId],
    queryFn: async () => (await unwrap(api.GET('/lgas/{lga}/stock-summary', { params: { path: { lga: lgaId } } }))).data,
    refetchInterval: ROLLUP_REFRESH,
  });
}

export function useStateSummary(stateId: number) {
  return useQuery({
    queryKey: ['stock-summary', 'state', stateId],
    queryFn: async () => (await unwrap(api.GET('/states/{state}/stock-summary', { params: { path: { state: stateId } } }))).data,
    refetchInterval: ROLLUP_REFRESH,
  });
}

export function useFederalSummary() {
  return useQuery({
    queryKey: ['stock-summary', 'federal'],
    queryFn: async () => (await unwrap(api.GET('/federal/stock-summary'))).data,
    refetchInterval: ROLLUP_REFRESH,
  });
}

/** Stock Card entries per week across an area's SDPs. */
export function useAreaActivity(level: 'lga' | 'state' | 'national', id: number | null) {
  return useQuery({
    queryKey: ['stock-activity', level, id],
    queryFn: async () => {
      const res =
        level === 'lga'
          ? api.GET('/lgas/{lga}/stock-activity', { params: { path: { lga: id! } } })
          : level === 'state'
            ? api.GET('/states/{state}/stock-activity', { params: { path: { state: id! } } })
            : api.GET('/federal/stock-activity');
      return (await unwrap(res)).data as StockActivity;
    },
  });
}

// ---------------------------------------------------------------- activity log

/** The audit log, newest first, a page at a time (scoped by the API). */
export function useAuditEvents(filters: { category?: AuditCategory; q?: string }) {
  return useInfiniteQuery({
    queryKey: ['audit-events', filters],
    queryFn: ({ pageParam }) =>
      unwrap(api.GET('/audit-events', { params: { query: { ...filters, q: filters.q || undefined, per_page: 30, page: pageParam } } })),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.meta.pagination.current_page < last.meta.pagination.last_page ? last.meta.pagination.current_page + 1 : undefined,
    placeholderData: keepPreviousData,
  });
}

// ---------------------------------------------------------------- accounts (needs a connection)

export function useUsers(filters: { q?: string; role?: UserRole; is_active?: boolean }) {
  return useQuery({
    queryKey: ['users', filters],
    queryFn: () =>
      unwrap(api.GET('/users', { params: { query: { ...filters, q: filters.q || undefined, per_page: 100 } } })),
    placeholderData: keepPreviousData,
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: NewUser) => unwrap(api.POST('/users', { body })),
    // The organization's limits (on /auth/me) change too.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: number; body: UpdateUser }) =>
      (await unwrap(api.PUT('/users/{user}', { params: { path: { user: id } }, body }))).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
}

/** A new temporary password; the account is signed out everywhere. */
export function useResetPassword() {
  return useMutation({
    mutationFn: async (id: number) => unwrap(api.POST('/users/{user}/reset-password', { params: { path: { user: id } } })),
  });
}

export function useStates() {
  return useQuery({
    queryKey: ['states'],
    queryFn: async () => (await unwrap(api.GET('/states'))).data,
    staleTime: 60 * 60_000,
  });
}

export function useLgas(stateId: number | null) {
  return useQuery({
    queryKey: ['lgas', stateId],
    queryFn: async () => (await unwrap(api.GET('/states/{state}/lgas', { params: { path: { state: stateId! } } }))).data,
    enabled: stateId !== null,
    staleTime: 60 * 60_000,
  });
}

/** SDPs in an LGA (the LGA's store is not listed). */
export function useLgaFacilities(lgaId: number | null) {
  return useQuery({
    queryKey: ['lga-facilities', lgaId],
    queryFn: async () => (await unwrap(api.GET('/lgas/{lga}/facilities', { params: { path: { lga: lgaId! } } }))).data,
    enabled: lgaId !== null,
  });
}
