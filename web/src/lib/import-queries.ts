import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import type { paths } from '@shared/api'
import { ApiError, api, unwrap } from './api-client'
import { useAuthStore } from './auth-store'

// Bulk CSV imports (docs/API_CONTRACT.md: Bulk imports). Check a file with
// dry_run, then import it: the API writes every row or none.

export type ImportKind = 'products' | 'facilities' | 'users' | 'product-levels' | 'stock-entries'

export type ImportGuide = paths['/imports/{kind}']['get']['responses'][200]['content']['application/json']['data']
export type ImportResult = paths['/imports/{kind}']['post']['responses'][200]['content']['application/json']['data']
export type ImportRow = ImportResult['rows'][number]

/** The columns of an import, for its guide and template. */
export function useImportGuide(kind: ImportKind) {
  return useQuery({
    queryKey: ['import-guide', kind],
    queryFn: async () => (await unwrap(api.GET('/imports/{kind}', { params: { path: { kind } } }))).data,
    staleTime: Infinity,
  })
}

/**
 * POST the file as multipart. Plain fetch: the generated client would
 * serialize the body as JSON. The response is still typed from the spec.
 */
async function postImport(kind: ImportKind, facilityId: number | undefined, file: File, dryRun: boolean): Promise<ImportResult> {
  const base = import.meta.env.VITE_API_URL ?? '/api/v1'
  const path = facilityId === undefined ? `/imports/${kind}` : `/facilities/${facilityId}/imports/${kind}`
  const body = new FormData()
  body.append('file', file)
  body.append('dry_run', String(dryRun))
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { Accept: 'application/json', Authorization: `Bearer ${useAuthStore.getState().token}` },
    body,
  })
  if (res.status === 401) useAuthStore.getState().clear('expired')
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, json)
  return (json as { data: ImportResult }).data
}

/** Check (dryRun) or import a file; a committed import refreshes `invalidates`. */
export function useRunImport(kind: ImportKind, facilityId: number | undefined, invalidates: QueryKey[]) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ file, dryRun }: { file: File; dryRun: boolean }) => postImport(kind, facilityId, file, dryRun),
    onSuccess: (result) => {
      if (result.committed) for (const queryKey of invalidates) queryClient.invalidateQueries({ queryKey })
    },
  })
}

/** Rows to a CSV the browser downloads (the template, or the accounts and their passwords). */
export function downloadCsv(name: string, rows: (string | number | null | undefined)[][]): void {
  const cell = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  // BOM so Excel opens it as UTF-8.
  const text = '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}
