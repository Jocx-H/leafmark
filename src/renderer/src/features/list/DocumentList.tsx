import type { ReactNode } from 'react'
import type { DocumentRecord } from '@shared/model'
import { StatusBadge } from '../../components/StatusBadge'
import { documentCode, documentTags, documentTitle } from '../../utils/documents'

interface DocumentListProps {
  documents: DocumentRecord[]
  selectedPath: string | null
  onSelect: (relativePath: string) => void
  emptyTitle: string
  emptyHint?: string
}

export function DocumentList({
  documents,
  selectedPath,
  onSelect,
  emptyTitle,
  emptyHint
}: DocumentListProps): ReactNode {
  if (documents.length === 0) {
    return (
      <div className="list-empty">
        <div className="list-empty-mark">⌕</div>
        <h3>{emptyTitle}</h3>
        {emptyHint ? <p>{emptyHint}</p> : null}
      </div>
    )
  }

  return (
    <div className="doc-list" role="listbox" aria-label="文档列表">
      {documents.map((document) => {
        const code = documentCode(document)
        const tags = documentTags(document)
        const selected = selectedPath === document.relativePath
        return (
          <button
            type="button"
            role="option"
            aria-selected={selected}
            key={document.relativePath}
            className={selected ? 'doc-row is-selected' : 'doc-row'}
            onClick={() => onSelect(document.relativePath)}
            data-testid="doc-row"
          >
            <span className={code ? 'doc-code' : 'doc-code is-empty'}>{code ?? '—'}</span>
            <span className="doc-main">
              <span className="doc-title">{documentTitle(document)}</span>
              <span className="doc-meta">
                <span className="doc-dir" title={document.relativePath}>
                  {document.relativeDir === '.' ? '根目录' : document.relativeDir}
                </span>
                {tags.length > 0 ? (
                  <span className="doc-tags">
                    {tags.slice(0, 4).map((tag) => (
                      <span className="mini-tag" key={tag}>
                        {tag}
                      </span>
                    ))}
                    {tags.length > 4 ? <span className="mini-tag is-more">+{tags.length - 4}</span> : null}
                  </span>
                ) : (
                  <span className="doc-no-tags">无标签</span>
                )}
              </span>
            </span>
            <span className="doc-status">
              <StatusBadge status={document.status} />
            </span>
          </button>
        )
      })}
    </div>
  )
}
