import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Snapshot } from '@shared/ipc-contracts'
import type { ViewKey } from '../../utils/documents'
import { buildCategoryTree, formatTimestamp, viewCounts } from '../../utils/documents'

interface SidebarProps {
  snapshot: Snapshot
  view: ViewKey
  onSelectView: (view: ViewKey) => void
}

export function Sidebar({ snapshot, view, onSelectView }: SidebarProps): ReactNode {
  const tree = useMemo(() => buildCategoryTree(snapshot.config, snapshot.documents), [snapshot.config, snapshot.documents])
  const counts = viewCounts(snapshot.documents)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  useEffect(() => {
    setCollapsed(new Set())
  }, [snapshot.workspace?.rootPath])

  const itemClass = (key: ViewKey): string => (view === key ? 'side-item is-active' : 'side-item')

  const togglePrimary = (code: string): void => {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-scroll">
        <nav className="side-section" aria-label="文件范围">
          <button type="button" className={itemClass('all')} onClick={() => onSelectView('all')}>
            <span className="side-name">全部文件</span>
            <span className="side-count">{counts.all}</span>
          </button>
          <button type="button" className={itemClass('unmanaged')} onClick={() => onSelectView('unmanaged')}>
            <span className="side-name">未纳入管理</span>
            <span className={counts.unmanaged ? 'side-count is-warn' : 'side-count'}>{counts.unmanaged}</span>
          </button>
          <button type="button" className={itemClass('invalid')} onClick={() => onSelectView('invalid')}>
            <span className="side-name">命名异常</span>
            <span className={counts.invalid ? 'side-count is-danger' : 'side-count'}>{counts.invalid}</span>
          </button>
          <button type="button" className={itemClass('conflict')} onClick={() => onSelectView('conflict')}>
            <span className="side-name">编号冲突</span>
            <span className={counts.conflict ? 'side-count is-danger' : 'side-count'}>{counts.conflict}</span>
          </button>
        </nav>

        <div className="side-heading">分类</div>
        <nav className="tree" aria-label="分类树">
          {tree.length === 0 ? <p className="side-empty">尚未配置分类</p> : null}
          {tree.map((primary) => {
            const isCollapsed = collapsed.has(primary.code)
            return (
              <div className="tree-group" key={primary.code}>
                <div className="tree-primary-row">
                  <button
                    type="button"
                    className="tree-toggle"
                    aria-label={`${isCollapsed ? '展开' : '折叠'}一级分类 ${primary.name}`}
                    aria-expanded={!isCollapsed}
                    onClick={() => togglePrimary(primary.code)}
                  >
                    <svg
                      className={isCollapsed ? 'tree-caret is-collapsed' : 'tree-caret'}
                      width="10"
                      height="10"
                      viewBox="0 0 10 10"
                      aria-hidden="true"
                    >
                      <path
                        d="M2 3.5 5 6.5 8 3.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className={`${itemClass(`cat:${primary.code}`)} tree-primary`}
                    onClick={() => onSelectView(`cat:${primary.code}`)}
                  >
                    <span className="tree-name">{primary.name}</span>
                    <span className="tree-code">{primary.code}</span>
                    <span className="side-count">{primary.count}</span>
                  </button>
                </div>
                {isCollapsed ? null : (
                  <div className="tree-children">
                    {primary.children.map((child) => (
                      <button
                        type="button"
                        key={child.code}
                        className={`${itemClass(`cat:${primary.code}:${child.code}`)} tree-child`}
                        onClick={() => onSelectView(`cat:${primary.code}:${child.code}`)}
                      >
                        <span className="tree-name">{child.name}</span>
                        <span className="tree-code">{child.code}</span>
                        <span className="side-count">{child.count}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </nav>
      </div>

      <footer className="sidebar-foot">
        <div className="foot-line">
          <span className={snapshot.watcherActive ? 'foot-dot is-live' : 'foot-dot'} />
          {snapshot.watcherActive ? '文件监听中' : '监听不可用，请手动重新扫描'}
        </div>
        {snapshot.lastScanAt ? <div className="foot-line">上次扫描 {formatTimestamp(snapshot.lastScanAt)}</div> : null}
        {snapshot.scanProblems.length > 0 ? (
          <div
            className="foot-line is-warn"
            title={snapshot.scanProblems.map((problem) => `${problem.path}: ${problem.message}`).join('\n')}
          >
            {snapshot.scanProblems.length} 个路径无法读取
          </div>
        ) : null}
      </footer>
    </aside>
  )
}
