import { ApiError } from '../../lib/api-client'

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="page-state" role="status">
      {label}
    </div>
  )
}

export function ErrorState({ error }: { error: unknown }) {
  const status = error instanceof ApiError ? error.status : undefined
  const message =
    status === 403
      ? "You don't have access to this part of the hierarchy."
      : status === 404
        ? 'Not found.'
        : error instanceof Error
          ? error.message
          : 'Something went wrong.'

  return (
    <div className="page-state page-state-error" role="alert">
      {message}
    </div>
  )
}
