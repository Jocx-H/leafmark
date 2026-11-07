import type { ReactNode } from 'react'

export interface ToastItem {
  id: string
  kind: 'info' | 'success' | 'error'
  message: string
}

export function Toasts({ items, onDismiss }: { items: ToastItem[]; onDismiss: (id: string) => void }): ReactNode {
  if (items.length === 0) return null
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((item) => (
        <div key={item.id} className={`toast toast-${item.kind}`}>
          <span className="toast-dot" />
          <span className="toast-message">{item.message}</span>
          <button type="button" className="toast-close" onClick={() => onDismiss(item.id)} aria-label="关闭提示">
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
