import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { paths } from '@shared/api'
import { ApiError } from './api-client'
import { useAuthStore } from './auth-store'

/** The JSON report body, from the generated types. */
export type ReportResult = NonNullable<
  paths['/reports/{report}']['get']['responses'][200]['content']['application/json']
>['data']

export type ReportName = 'stock-card' | 'stock-status' | 'reorder' | 'expiry' | 'stock-movement'
export type ReportArea = 'facility' | 'lga' | 'state' | 'national'

export interface ReportParams {
  area: ReportArea
  id?: number
  product_id?: number
  category?: string
  // stock-card
  from?: string
  to?: string
  // stock-status
  level?: 'stock_out' | 'low_stock' | 'reorder' | 'ok'
  // reorder
  needs_order?: boolean
  // expiry
  within_days?: number
  // stock-movement: YYYY-MM or YYYY-Q1…Q4
  period?: string
}

/** Drop unset filters so the URL (and the query key) only carries what was chosen. */
function query(params: ReportParams): Record<string, string | number | boolean> {
  return Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== false)) as Record<
    string,
    string | number | boolean
  >
}

/**
 * GET /reports/{report}. Plain fetch: which filters apply depends on the
 * report, so the generated client has no query type for it — the response
 * is still typed from the spec.
 */
async function fetchReport(report: ReportName, params: Record<string, string | number | boolean>): Promise<Response> {
  const base = import.meta.env.VITE_API_URL ?? '/api/v1'
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))
  const res = await fetch(`${base}/reports/${report}?${qs}`, {
    headers: { Accept: params.format === 'csv' ? 'text/csv' : 'application/json', Authorization: `Bearer ${useAuthStore.getState().token}` },
  })
  if (res.status === 401) useAuthStore.getState().clear('expired')
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => null))
  return res
}

/** On-screen / print rows (capped by the API; `truncated` says when the CSV has more). */
export function useReport(report: ReportName, params: ReportParams | null) {
  return useQuery({
    queryKey: ['report', report, params],
    queryFn: async () => ((await (await fetchReport(report, query(params!))).json()) as { data: ReportResult }).data,
    enabled: params !== null,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })
}

/**
 * Every row as a CSV file. Fetched with the bearer token (a plain link can't
 * send it), then handed to the browser as a download.
 */
export async function downloadReportCsv(report: ReportName, params: ReportParams): Promise<void> {
  const res = await fetchReport(report, { ...query(params), format: 'csv' })

  const name = /filename="?([^";]+)"?/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? `${report}.csv`
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}
