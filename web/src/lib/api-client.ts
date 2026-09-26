import createClient, { type Middleware } from 'openapi-fetch'
import type { paths } from '@shared/api'
import { useAuthStore } from './auth-store'

/** Typed client over the generated OpenAPI paths. Base URL /api/v1 per docs/API_CONTRACT.md. */
export const api = createClient<paths>({
  baseUrl: import.meta.env.VITE_API_URL ?? '/api/v1',
})

const auth: Middleware = {
  onRequest({ request }) {
    request.headers.set('Accept', 'application/json')
    const token = useAuthStore.getState().token
    if (token) request.headers.set('Authorization', `Bearer ${token}`)
    return request
  },
  onResponse({ response }) {
    // Expired or revoked token: drop it; RequireAuth sends the user to /login.
    if (response.status === 401 && useAuthStore.getState().token) {
      useAuthStore.getState().clear('expired')
    }
    return response
  },
}

api.use(auth)

/** Error in the contract's shape: { message, errors: { field: [messages] } }. */
export class ApiError extends Error {
  readonly status: number
  readonly errors: Record<string, string[]>

  constructor(status: number, body: unknown) {
    const b = (body ?? {}) as { message?: string; errors?: Record<string, string[]> }
    super(b.message ?? `Request failed (${status})`)
    this.status = status
    this.errors = b.errors ?? {}
  }
}

/** Resolve an openapi-fetch call to its data, or throw ApiError. */
export async function unwrap<T>(
  call: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  const { data, error, response } = await call
  if (!response.ok || data === undefined) throw new ApiError(response.status, error)
  return data
}
