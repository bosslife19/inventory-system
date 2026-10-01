import createClient, { type Middleware } from 'openapi-fetch';

import { API_URL } from './config';
import type { paths } from './types';

/** Typed client over the generated OpenAPI paths (same contract as the web app). */
export const api = createClient<paths>({ baseUrl: API_URL });

let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

/** Called by the session when it signs in, restores or clears a token. */
export function setAuthToken(next: string | null) {
  token = next;
}

export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

// Neither hook returns anything: openapi-fetch treats a returned value as a
// *replacement* and checks it with `instanceof Response` / `Request`, which
// fails in Expo because its fetch has its own Response class. Headers are
// edited in place; the response is only inspected.
const auth: Middleware = {
  onRequest({ request }) {
    request.headers.set('Accept', 'application/json');
    if (token) request.headers.set('Authorization', `Bearer ${token}`);
  },
  onResponse({ response }) {
    // Expired or revoked token: the session signs out and routes to sign-in.
    if (response.status === 401 && token) onUnauthorized?.();
  },
};

api.use(auth);

/** Error in the contract's shape: { message, errors: { field: [messages] } }. */
export class ApiError extends Error {
  readonly status: number;
  readonly errors: Record<string, string[]>;

  constructor(status: number, body: unknown) {
    const b = (body ?? {}) as { message?: string; errors?: Record<string, string[]> };
    super(b.message ?? `Request failed (${status})`);
    this.status = status;
    this.errors = b.errors ?? {};
  }
}

/** Resolve an openapi-fetch call to its data, or throw ApiError. Network failures throw TypeError. */
export async function unwrap<T>(call: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  const { data, error, response } = await call;
  if (!response.ok || data === undefined) throw new ApiError(response.status, error);
  return data;
}

/** No response at all (offline, server unreachable) rather than an HTTP error. */
export function isNetworkError(err: unknown): boolean {
  return !(err instanceof ApiError);
}
