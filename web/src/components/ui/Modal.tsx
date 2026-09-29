import { X } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  icon?: React.ReactNode
  /** lg for wide content such as tables and line editors. */
  size?: 'md' | 'lg'
  children: React.ReactNode
}

/**
 * Native <dialog> shown with showModal(): the browser supplies the focus trap,
 * Esc-to-close and the inert background. Children unmount when closed so a
 * form starts fresh each time it opens.
 */
export function Modal({ open, onClose, title, description, icon, size = 'md', children }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className={`modal${size === 'lg' ? ' modal-lg' : ''}`}
      aria-labelledby={titleId}
      onClose={onClose}
      // Click on the backdrop (the dialog element itself, outside its content) closes it.
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {open && (
        <>
          <header className="modal-head">
            {icon && <span className="modal-head-icon">{icon}</span>}
            <div>
              <h2 id={titleId}>{title}</h2>
              {description && <p>{description}</p>}
            </div>
            <button type="button" className="btn btn-icon" aria-label="Close" onClick={onClose}>
              <X size={18} />
            </button>
          </header>
          <div className="modal-body">{children}</div>
        </>
      )}
    </dialog>
  )
}
