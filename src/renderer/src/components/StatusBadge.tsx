import type { ReactNode } from 'react'
import type { DocumentStatus } from '@shared/model'
import { statusLabel, statusTone } from '../utils/documents'

export function StatusBadge({ status }: { status: DocumentStatus }): ReactNode {
  return (
    <span className={`status-badge tone-${statusTone(status)}`}>
      <span className="status-dot" />
      {statusLabel(status)}
    </span>
  )
}
