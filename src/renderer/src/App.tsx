import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Snapshot } from '@shared/ipc-contracts'
import { Sidebar } from './features/sidebar/Sidebar'
import { ListToolbar } from './features/list/ListToolbar'
import { DocumentList } from './features/list/DocumentList'
import { DocumentEditor } from './features/editor/DocumentEditor'
import { CreateDialog } from './features/create/CreateDialog'
import { SettingsDialog } from './features/settings/SettingsDialog'
import { EmptyWorkspace, LeafGlyph } from './features/workspace/EmptyWorkspace'
import { Toasts, type ToastItem } from './components/Toasts'
import { filterDocuments, viewCounts, viewLabel, type ViewKey } from './utils/documents'
import { invoke } from './services/client'

export function App(): ReactNode {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [view, setView] = useState<ViewKey>('all')
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [tagMode, setTagMode] = useState<'all' | 'any'>('all')
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [creating, setCreating] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [workspaceError, setWorkspaceError] = useState<string | null>(null)

  const notify = useCallback((kind: 'info' | 'success' | 'error', message: string): void => {
    const id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
    setToasts((items) => [...items, { id, kind, message }].slice(-4))
    window.setTimeout(() => {
      setToasts((items) => items.filter((item) => item.id !== id))
    }, 5200)
  }, [])

  const notifyFailure = useCallback(
    (message: string) => {
      setWorkspaceError(message)
      notify('error', message)
    },
    [notify]
  )

  useEffect(() => {
    let alive = true
    void (async () => {
      const result = await window.leafmark.getSnapshot()
      if (!alive) return
      if (result.ok) setSnapshot(result.value)
      else setLoadError(result.error.message)
    })()

    const offSnapshot = window.leafmark.onSnapshot((next) => setSnapshot(next))
    const offNotice = window.leafmark.onNotice((notice) => notify(notice.kind, notice.message))
    return () => {
      alive = false
      offSnapshot()
      offNotice()
    }
  }, [notify])

  useEffect(() => {
    void window.leafmark.getAppInfo().then((result) => {
      if (result.ok) document.body.dataset.platform = result.value.platform
    })
  }, [])

  const rootPath = snapshot?.workspace?.rootPath ?? null
  useEffect(() => {
    setView('all')
    setSelectedPath(null)
    setQuery('')
    setSelectedTags([])
    setTagMode('all')
  }, [rootPath])

  useEffect(() => {
    if (!snapshot || !selectedPath) return
    if (!snapshot.documents.some((document) => document.relativePath === selectedPath)) {
      setSelectedPath(null)
    }
  }, [snapshot, selectedPath])

  const selectedDocument = useMemo(
    () => snapshot?.documents.find((document) => document.relativePath === selectedPath) ?? null,
    [snapshot, selectedPath]
  )

  const filtered = useMemo(
    () =>
      snapshot
        ? filterDocuments(snapshot.documents, view, query, selectedTags, tagMode)
        : [],
    [snapshot, view, query, selectedTags, tagMode]
  )

  if (loadError) {
    return (
      <div className="fatal-screen">
        <h1>无法启动 LeafMark</h1>
        <p>{loadError}</p>
        <button type="button" className="button button-primary" onClick={() => window.location.reload()}>
          重新加载
        </button>
      </div>
    )
  }

  if (!snapshot) {
    return (
      <div className="loading-screen">
        <span className="brand-mark is-large">
          <LeafGlyph />
        </span>
        <p>正在读取工作区…</p>
      </div>
    )
  }

  const workspace = snapshot.workspace
  const readonly = workspace?.writable === false
  const configStatus = workspace?.configStatus ?? 'missing'
  const configIssue = workspace?.configIssues.find((item) => item.severity === 'error')

  const pickWorkspace = async (): Promise<void> => {
    setBusy(true)
    setWorkspaceError(null)
    const result = await invoke(() => window.leafmark.chooseWorkspace(), notifyFailure)
    setBusy(false)
    if (result?.snapshot) setSnapshot(result.snapshot)
  }

  const openRecent = async (workspacePath: string): Promise<void> => {
    setBusy(true)
    setWorkspaceError(null)
    const result = await invoke(() => window.leafmark.openRecentWorkspace(workspacePath), notifyFailure)
    setBusy(false)
    if (result?.snapshot) setSnapshot(result.snapshot)
  }

  const rescan = async (): Promise<void> => {
    const next = await invoke(() => window.leafmark.rescan(), notifyFailure)
    if (next) setSnapshot(next)
  }

  const undo = async (): Promise<void> => {
    const result = await invoke(() => window.leafmark.undoLastRename(), notifyFailure)
    if (!result) return
    setSnapshot(result.snapshot)
    notify(result.undone ? 'success' : 'info', result.message)
    if (result.undone && result.documentPath) {
      setView('all')
      setSelectedPath(result.documentPath)
    }
  }

  const createDefaultConfig = async (): Promise<void> => {
    const next = await invoke(() => window.leafmark.updateConfig(snapshot.config), notifyFailure)
    if (next) {
      setSnapshot(next)
      notify('success', '已创建 .leafmark.json')
    }
  }

  const resetConfig = async (): Promise<void> => {
    const next = await invoke(() => window.leafmark.resetConfig(), notifyFailure)
    if (next) {
      setSnapshot(next)
      notify('success', '已恢复默认配置')
    }
  }

  const counts = viewCounts(snapshot.documents)
  const toolbarTotal = filtered.length

  const emptyTitle =
    query.trim().length > 0 || selectedTags.length > 0
      ? '没有匹配的文件'
      : view === 'all'
        ? '这个工作区还没有 Markdown 文件'
        : `“${viewLabel(view, snapshot.config)}” 下暂无文件`
  const emptyHint =
    query.trim().length > 0 || selectedTags.length > 0
      ? '尝试清除筛选条件或更换关键词。'
      : '可以使用“新建文档”创建第一个文件，或把已有 Markdown 文件放入该目录。'

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <LeafGlyph />
          </span>
          <span className="brand-name">LeafMark</span>
          {workspace ? (
            <span className="workspace-chip" title={workspace.rootPath}>
              <span className="workspace-dot" />
              <span className="workspace-name">{workspace.name}</span>
            </span>
          ) : null}
        </div>
        <div className="topbar-actions">
          {snapshot.scanning ? (
            <span className="scan-pill">
              <span className="spinner" />
              扫描中
            </span>
          ) : null}
          {workspace ? (
            <>
              <button
                type="button"
                className="button button-ghost"
                onClick={() => setCreating(true)}
                disabled={readonly}
                data-testid="new-document"
              >
                新建文档
              </button>
              <button
                type="button"
                className="button button-ghost"
                onClick={() => void rescan()}
                disabled={snapshot.scanning}
                data-testid="rescan"
              >
                重新扫描
              </button>
              <button
                type="button"
                className="button button-ghost"
                onClick={() => void undo()}
                disabled={!snapshot.canUndo || readonly}
                title={snapshot.undoLabel ?? '没有可撤销的重命名'}
                data-testid="undo"
              >
                撤销
              </button>
              <button
                type="button"
                className="button button-ghost"
                onClick={() => setSettingsOpen(true)}
                data-testid="settings"
              >
                设置
              </button>
              <button type="button" className="button button-quiet" onClick={() => void pickWorkspace()} disabled={busy}>
                切换工作区
              </button>
            </>
          ) : (
            <button type="button" className="button button-primary" onClick={() => void pickWorkspace()} disabled={busy}>
              {busy ? '正在打开…' : '选择工作区'}
            </button>
          )}
        </div>
      </header>

      {workspace && configStatus !== 'ok' ? (
        <div className={configStatus === 'missing' ? 'banner' : 'banner is-error'}>
          <span className="banner-text">
            {configStatus === 'missing'
              ? '尚未创建工作区配置文件 .leafmark.json，当前使用内存中的默认配置。'
              : `工作区配置文件存在错误：${configIssue?.message ?? '无法读取配置'}。文件操作已切换为只读。`}
          </span>
          <span className="banner-actions">
            {configStatus === 'missing' ? (
              <button type="button" className="button button-small" onClick={() => void createDefaultConfig()}>
                创建配置文件
              </button>
            ) : (
              <button type="button" className="button button-small" onClick={() => void resetConfig()}>
                恢复默认配置
              </button>
            )}
            <button type="button" className="button button-small button-quiet" onClick={() => setSettingsOpen(true)}>
              查看设置
            </button>
          </span>
        </div>
      ) : null}

      {workspace ? (
        <main className="workspace">
          <Sidebar snapshot={snapshot} view={view} onSelectView={setView} />
          <section className="content" data-testid="content">
            <div className="content-head">
              <div>
                <h2 className="content-title">{viewLabel(view, snapshot.config)}</h2>
                <p className="content-subtitle">
                  {counts.all} 个 Markdown 文件 · {counts.unmanaged} 个未纳入管理 · {counts.invalid} 个异常 ·{' '}
                  {counts.conflict} 个冲突
                </p>
              </div>
            </div>
            <ListToolbar
              query={query}
              onQueryChange={setQuery}
              selectedTags={selectedTags}
              onTagsChange={setSelectedTags}
              tagMode={tagMode}
              onTagModeChange={setTagMode}
              tags={snapshot.tags}
              pinnedTags={snapshot.config.pinnedTags}
              resultCount={toolbarTotal}
              totalCount={snapshot.documents.length}
            />
            <DocumentList
              documents={filtered}
              selectedPath={selectedPath}
              onSelect={setSelectedPath}
              emptyTitle={emptyTitle}
              emptyHint={emptyHint}
            />
          </section>

          {selectedDocument ? (
            <DocumentEditor
              key={selectedDocument.relativePath}
              document={selectedDocument}
              snapshot={snapshot}
              onCommitted={(next, documentPath) => {
                setSnapshot(next)
                setSelectedPath(documentPath)
                setView('all')
              }}
              onRequestRescan={() => void rescan()}
              notify={notify}
            />
          ) : (
            <aside className="detail-empty">
              <div className="detail-empty-card">
                <h3>选择左侧文件开始命名</h3>
                <p>编辑面板会实时生成目标文件名，并在提交前检查编号占用、文件名长度和路径冲突。</p>
                <ul className="detail-tips">
                  <li>
                    <span className="tip-code">编号</span>
                    六位数字表示分类位置，移动分类会生成新编号。
                  </li>
                  <li>
                    <span className="tip-code">标签</span>
                    写在方括号里，可排序、可重复使用，但不写入正文。
                  </li>
                  <li>
                    <span className="tip-code">安全</span>
                    不会覆盖已有文件，也不会修改 Markdown 正文。
                  </li>
                </ul>
                <div className="detail-legend">
                  <span>
                    <span className="legend-dot tone-ok" />
                    已管理 {counts.all - counts.unmanaged - counts.invalid - counts.conflict}
                  </span>
                  <span>
                    <span className="legend-dot tone-muted" />
                    未纳入 {counts.unmanaged}
                  </span>
                  <span>
                    <span className="legend-dot tone-danger" />
                    异常 {counts.invalid}
                  </span>
                  <span>
                    <span className="legend-dot tone-warn" />
                    冲突 {counts.conflict}
                  </span>
                </div>
              </div>
            </aside>
          )}
        </main>
      ) : (
        <EmptyWorkspace
          snapshot={snapshot}
          busy={busy}
          error={workspaceError}
          onPick={() => void pickWorkspace()}
          onOpenRecent={(path) => void openRecent(path)}
        />
      )}

      <Toasts items={toasts} onDismiss={(id) => setToasts((items) => items.filter((item) => item.id !== id))} />

      {creating && workspace ? (
        <CreateDialog
          snapshot={snapshot}
          onClose={() => setCreating(false)}
          onCreated={(next, documentPath) => {
            setSnapshot(next)
            setSelectedPath(documentPath)
            setView('all')
          }}
          notify={notify}
        />
      ) : null}

      {settingsOpen && workspace ? (
        <SettingsDialog
          snapshot={snapshot}
          onClose={() => setSettingsOpen(false)}
          onSaved={(next) => setSnapshot(next)}
          notify={notify}
        />
      ) : null}
    </div>
  )
}
