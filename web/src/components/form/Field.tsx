import { cloneElement, useId, type ReactElement } from 'react'

interface Props {
  label: string
  error?: string
  hint?: React.ReactNode
  /** A single input/select/textarea; it gets id, aria-invalid and aria-describedby wired up. */
  children: ReactElement<React.InputHTMLAttributes<HTMLElement>>
}

/**
 * Label + control + hint + error, with the label tied to the control by id
 * (not by wrapping), so the control's accessible name is just the label.
 */
export function Field({ label, error, hint, children }: Props) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {cloneElement(children, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': [hintId, errorId].filter(Boolean).join(' ') || undefined,
      })}
      {hint && (
        <span className="field-hint" id={hintId}>
          {hint}
        </span>
      )}
      {error && (
        <span className="field-error" id={errorId}>
          {error}
        </span>
      )}
    </div>
  )
}
