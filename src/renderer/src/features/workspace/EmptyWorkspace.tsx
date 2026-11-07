import type { ReactNode } from 'react'
import type { Snapshot } from '@shared/ipc-contracts'

interface EmptyWorkspaceProps {
  snapshot: Snapshot
  busy: boolean
  error: string | null
  onPick: () => void
  onOpenRecent: (path: string) => void
}

export function EmptyWorkspace({ snapshot, busy, error, onPick, onOpenRecent }: EmptyWorkspaceProps): ReactNode {
  return (
    <div className="empty-workspace">
      <div className="empty-card">
        <div className="empty-brand">
          <span className="brand-mark is-large">
            <LeafGlyph />
          </span>
          <div>
            <h1>LeafMark</h1>
            <p className="empty-tagline">让 Markdown 文件名自己说明一切。</p>
          </div>
        </div>

        <p className="empty-lead">
          选择一个工作区目录，LeafMark 会扫描其中的 Markdown 文件，解析编号、标签和标题，并在你确认后安全地重命名。
          它不读取正文、不联网、也不维护数据库。
        </p>

        <div className="naming-demo" aria-label="命名格式示例">
          <code>
            <span className="demo-code">010203</span>
            <span className="demo-sep">_</span>
            <span className="demo-tag">[CUDA]</span>
            <span className="demo-tag">[SpMM]</span>
            <span className="demo-sep">_</span>
            <span className="demo-title">稀疏矩阵乘优化</span>
            <span className="demo-ext">.md</span>
          </code>
          <div className="demo-legend">
            <span><i className="dot dot-code" />两级分类 + 序号</span>
            <span><i className="dot dot-tag" />标签</span>
            <span><i className="dot dot-title" />标题</span>
          </div>
        </div>

        <div className="empty-actions">
          <button type="button" className="button button-primary is-large" onClick={onPick} disabled={busy}>
            {busy ? '正在打开…' : '选择工作区'}
          </button>
        </div>

        {error ? <p className="empty-error">{error}</p> : null}

        {snapshot.recentWorkspaces.length > 0 ? (
          <div className="recent-block">
            <div className="recent-heading">最近打开</div>
            <ul className="recent-list">
              {snapshot.recentWorkspaces.map((workspacePath) => {
                const name = workspacePath.split(/[\\/]/).filter(Boolean).pop() ?? workspacePath
                return (
                  <li key={workspacePath}>
                    <button type="button" className="recent-item" onClick={() => onOpenRecent(workspacePath)} disabled={busy}>
                      <span className="recent-name">{name}</span>
                      <span className="recent-path">{workspacePath}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : null}

        <div className="empty-foot">
          <span>不读取正文</span>
          <span>默认不联网</span>
          <span>无数据库</span>
          <span>Windows / macOS</span>
        </div>
      </div>
    </div>
  )
}

export function LeafGlyph(): ReactNode {
  return (
    <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M19.5 4.5c-7.7 0-13.6 3.4-13.6 9.4 0 3 2 5.1 5 5.1 6.1 0 8.6-6.6 8.6-14.5Z"
        fill="currentColor"
      />
      <path d="M5.2 20.3c2.4-4.6 6-7.6 10.2-9.6" stroke="var(--panel)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
