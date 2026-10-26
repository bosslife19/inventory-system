import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from './api-client'
import type { Checkout } from './types'

// Paying for a plan tier through Paystack (docs/API_CONTRACT.md: Billing).
// Admins only; the API settles payments from Paystack's own record.

export function useBillingPlans() {
  return useQuery({
    queryKey: ['billing', 'plans'],
    queryFn: async () => (await unwrap(api.GET('/billing/plans'))).data,
  })
}

export function useBillingPayments() {
  return useQuery({
    queryKey: ['billing', 'payments'],
    queryFn: async () => (await unwrap(api.GET('/billing/payments'))).data,
  })
}

/** Start a checkout; the caller sends the browser to authorization_url. */
export function useCheckout() {
  return useMutation({
    mutationFn: async (body: Checkout) => unwrap(api.POST('/billing/checkout', { body })),
  })
}

/** On the way back from Paystack: settle the payment, then refresh the plan everyone sees. */
export function useVerifyPayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (reference: string) =>
      (await unwrap(api.POST('/billing/payments/{reference}/verify', { params: { path: { reference } } }))).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing', 'payments'] })
      queryClient.invalidateQueries({ queryKey: ['me'] })
    },
  })
}
