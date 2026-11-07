import type { ReactNode } from 'react'

interface ModalProps {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}

export function Modal({ title, subtitle, onClose, children, footer, wide }: ModalProps): ReactNode {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className={wide ? 'modal modal-wide' : 'modal'} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer ? <footer className="modal-foot">{footer}</footer> : null}
      </div>
    </div>
  )
}
