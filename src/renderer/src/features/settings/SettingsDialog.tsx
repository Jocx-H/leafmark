import { useMemo, useState, type ReactNode } from 'react'
import type { Snapshot } from '@shared/ipc-contracts'
import type { CategoryNode, LeafmarkConfig } from '@shared/config/types'
import { cloneConfig } from '@shared/config/types'
import { validateConfig } from '@shared/config/validate'
import { insertChildCategory, reorderPrimaryCategories } from '@shared/config/categories'
import { TagEditor } from '../../components/TagEditor'
import { Modal } from '../../components/Modal'

interface SettingsDialogProps {
  snapshot: Snapshot
  onClose: () => void
  onSaved: (snapshot: Snapshot) => void
  notify: (kind: 'info' | 'success' | 'error', message: string) => void
}

const ALL_CODES = Array.from({ length: 100 }, (_, index) => String(index).padStart(2, '0'))

function freeCode(used: Iterable<string>): string | null {
  const taken = new Set(used)
  return ALL_CODES.find((code) => !taken.has(code)) ?? null
}

export function SettingsDialog({ snapshot, onClose, onSaved, notify }: SettingsDialogProps): ReactNode {
  const [config, setConfig] = useState<LeafmarkConfig>(() => cloneConfig(snapshot.config))
  const [busy, setBusy] = useState(false)
  const [resetConfirm, setResetConfirm] = useState(false)
  const [addingChildFor, setAddingChildFor] = useState<string | null>(null)
  const [newChildCode, setNewChildCode] = useState('00')
  const [newChildName, setNewChildName] = useState('')
  const [collapsedPrimaries, setCollapsedPrimaries] = useState<Set<string>>(
    () => new Set(Object.keys(snapshot.config.categories))
  )
  const [draggingPrimary, setDraggingPrimary] = useState<string | null>(null)
  const [dragOverPrimary, setDragOverPrimary] = useState<string | null>(null)
  const [primaryMapping, setPrimaryMapping] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.keys(snapshot.config.categories).map((code) => [code, code]))
  )
  const [confirmBatchSave, setConfirmBatchSave] = useState(false)

  const validation = useMemo(() => validateConfig(config), [config])
  const errors = validation.issues.filter((item) => item.severity === 'error')
  const workspacesIssues = snapshot.workspace?.configIssues ?? []

  const setCategories = (categories: Record<string, CategoryNode>): void => {
    setConfig((current) => ({ ...current, categories }))
  }

  const renamePrimary = (code: string, name: string): void => {
    const node = config.categories[code]
    if (!node) return
    setCategories({ ...config.categories, [code]: { ...node, name } })
  }

  const renameChild = (primary: string, child: string, name: string): void => {
    const node = config.categories[primary]
    if (!node) return
    setCategories({
      ...config.categories,
      [primary]: { ...node, children: { ...node.children, [child]: name } }
    })
  }

  const addPrimary = (): void => {
    const code = freeCode(Object.keys(config.categories))
    if (code === null) {
      notify('error', '一级分类编号已用尽')
      return
    }
    setCategories({ ...config.categories, [code]: { name: '新分类', children: { '00': '未分类' } } })
    setPrimaryMapping((current) => ({ ...current, [code]: code }))
    setCollapsedPrimaries((current) => {
      const next = new Set(current)
      next.delete(code)
      return next
    })
    window.setTimeout(() => {
      const card = document.querySelector<HTMLElement>(`[data-primary-code="${code}"]`)
      card?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      const input = card?.querySelector<HTMLInputElement>('input')
      input?.focus()
      input?.select()
    }, 60)
  }

  const handlePrimaryDrop = (targetCode: string): void => {
    const sourceCode = draggingPrimary
    setDraggingPrimary(null)
    setDragOverPrimary(null)
    if (!sourceCode || sourceCode === targetCode) return

    const result = reorderPrimaryCategories(config.categories, sourceCode, targetCode)
    if (!result) return

    setCategories(result.categories)
    setPrimaryMapping((current) => {
      const next = { ...current }
      for (const originalCode of Object.keys(next)) {
        const currentCode = next[originalCode]
        if (!currentCode) continue
        const target = result.mapping[currentCode]
        if (target) next[originalCode] = target
      }
      return next
    })
  }

  const removePrimary = (code: string): void => {
    const node = config.categories[code]
    if (!node) return
    const documents = snapshot.documents.filter((document) => {
      const parsed = document.parsed
      return parsed?.primaryCode === code && parsed.code !== null && parsed.code.length === 6
    })
    if (documents.length > 0) {
      notify('error', `分类 ${code} 下还有 ${documents.length} 个文档，请先移动这些文档再删除`)
      return
    }
    const pendingOrder = Object.entries(primaryMapping).some(([oldCode, newCode]) => oldCode !== newCode)
    if (pendingOrder) {
      notify('error', '请先保存当前分类排序，再删除分类')
      return
    }
    const next = { ...config.categories }
    delete next[code]
    setCategories(next)
    setPrimaryMapping((current) => {
      const mapping = { ...current }
      delete mapping[code]
      return mapping
    })
  }

  const togglePrimary = (code: string): void => {
    setCollapsedPrimaries((current) => {
      const next = new Set(current)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  const insertPreview = useMemo(() => {
    if (addingChildFor === null) return null
    const node = config.categories[addingChildFor]
    if (!node) return null
    return insertChildCategory(node.children, newChildCode, newChildName)
  }, [addingChildFor, config.categories, newChildCode, newChildName])

  const shiftedDocuments = useMemo(() => {
    if (!insertPreview || insertPreview.shiftedCodes.length === 0) return []
    const shifted = new Set(insertPreview.shiftedCodes)
    return snapshot.documents.filter((document) => {
      const parsed = document.parsed
      if (!parsed || !parsed.primaryCode || !parsed.secondaryCode) return false
      if (parsed.code === null || parsed.code.length !== 6) return false
      return parsed.primaryCode === addingChildFor && shifted.has(parsed.secondaryCode)
    })
  }, [insertPreview, addingChildFor, snapshot.documents])

  const startAddChild = (primary: string): void => {
    const node = config.categories[primary]
    if (!node) return
    const code = freeCode(Object.keys(node.children))
    if (code === null) {
      notify('error', '该一级分类下的二级编号已用尽')
      return
    }
    setAddingChildFor(primary)
    setNewChildCode(code)
    setNewChildName('')
  }

  const cancelAddChild = (): void => {
    setAddingChildFor(null)
    setNewChildName('')
  }

  const confirmAddChild = (): void => {
    if (addingChildFor === null) return
    const node = config.categories[addingChildFor]
    if (!node) return
    if (insertPreview?.error) {
      notify('error', insertPreview.error)
      return
    }
    if (!insertPreview?.children || shiftedDocuments.length > 0) return
    setCategories({
      ...config.categories,
      [addingChildFor]: { ...node, children: insertPreview.children }
    })
    setAddingChildFor(null)
    setNewChildName('')
  }

  const removeChild = (primary: string, child: string): void => {
    const node = config.categories[primary]
    if (!node) return
    const documents = snapshot.documents.filter((document) => {
      const parsed = document.parsed
      return (
        parsed?.primaryCode === primary &&
        parsed.secondaryCode === child &&
        parsed.code !== null &&
        parsed.code.length === 6
      )
    })
    if (documents.length > 0) {
      notify('error', `分类 ${primary}/${child} 下还有 ${documents.length} 个文档，请先移动这些文档再删除`)
      return
    }
    const children = { ...node.children }
    delete children[child]
    setCategories({ ...config.categories, [primary]: { ...node, children } })
  }

  const mappingChanges = useMemo(() => {
    const changes: Record<string, string> = {}
    for (const [oldCode, newCode] of Object.entries(primaryMapping)) {
      if (oldCode !== newCode && config.categories[newCode]) changes[oldCode] = newCode
    }
    return changes
  }, [primaryMapping, config.categories])

  const batchDocuments = useMemo(() => {
    const moved = new Set(Object.keys(mappingChanges))
    if (moved.size === 0) return []
    return snapshot.documents.filter((document) => {
      const parsed = document.parsed
      if (!parsed?.primaryCode || parsed.code === null || parsed.code.length !== 6) return false
      return moved.has(parsed.primaryCode)
    })
  }, [mappingChanges, snapshot.documents])

  const save = async (): Promise<void> => {
    if (errors.length > 0 || busy) return
    setBusy(true)
    const result = await window.leafmark.updateConfig(
      config,
      Object.keys(mappingChanges).length > 0 ? mappingChanges : undefined
    )
    setBusy(false)
    if (!result.ok) {
      notify('error', result.error.message)
      return
    }
    notify(
      'success',
      batchDocuments.length > 0
        ? `配置已保存，并重命名 ${batchDocuments.length} 个文档`
        : '工作区配置已保存'
    )
    onSaved(result.value)
    onClose()
  }

  const requestSave = (): void => {
    if (errors.length > 0 || busy) return
    if (batchDocuments.length > 0) {
      setConfirmBatchSave(true)
      return
    }
    void save()
  }

  const reset = async (): Promise<void> => {
    setBusy(true)
    const result = await window.leafmark.resetConfig()
    setBusy(false)
    setResetConfirm(false)
    if (!result.ok) {
      notify('error', result.error.message)
      return
    }
    notify('success', '已恢复默认配置')
    onSaved(result.value)
    onClose()
  }

  return (
    <Modal
      title="工作区设置"
      subtitle="配置保存在工作区根目录的 .leafmark.json 中，不包含任何文件索引"
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="button button-quiet danger-text" onClick={() => setResetConfirm(true)} disabled={busy}>
            恢复默认配置
          </button>
          <span className="modal-foot-spacer" />
          <button type="button" className="button button-quiet" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button type="button" className="button button-primary" onClick={requestSave} disabled={busy || errors.length > 0}>
            {busy ? '保存中…' : batchDocuments.length > 0 ? `保存并重命名 ${batchDocuments.length} 个文档` : '保存设置'}
          </button>
        </>
      }
    >
      {snapshot.workspace?.configStatus === 'invalid' || workspacesIssues.length > 0 ? (
        <div className="editor-alert tone-danger">
          <strong>当前配置文件存在问题</strong>
          <ul>
            {workspacesIssues.slice(0, 5).map((issue, index) => (
              <li key={index}>
                {issue.path ? <code>{issue.path}</code> : null} {issue.message}
              </li>
            ))}
          </ul>
          <p>修复或恢复默认配置之前，重命名和创建操作会被阻止。</p>
        </div>
      ) : null}

      {errors.length > 0 ? (
        <div className="editor-alert tone-danger">
          <strong>配置校验未通过</strong>
          <ul>
            {errors.slice(0, 5).map((issue, index) => (
              <li key={index}>
                {issue.path ? <code>{issue.path}</code> : null} {issue.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <section className="settings-section">
        <div className="settings-section-head">
          <div className="settings-section-title">
            <h3>分类</h3>
            {batchDocuments.length > 0 ? (
              <span className="rename-badge">保存时将重命名 {batchDocuments.length} 个文档</span>
            ) : null}
          </div>
          <button type="button" className="button button-quiet" onClick={addPrimary} disabled={busy}>
            添加一级分类
          </button>
        </div>
        <div className="category-list">
          {Object.entries(config.categories)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([code, node]) => {
              const isCollapsed = collapsedPrimaries.has(code)
              return (
              <div
                className={
                  draggingPrimary === code
                    ? 'category-card is-dragging'
                    : dragOverPrimary === code
                      ? 'category-card is-drop-target'
                      : 'category-card'
                }
                key={code}
                data-primary-code={code}
                onDragOver={(event) => {
                  if (!draggingPrimary) return
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'move'
                  if (dragOverPrimary !== code) setDragOverPrimary(code)
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  handlePrimaryDrop(code)
                }}
              >
                <div className="category-row">
                  <span
                    className="drag-handle"
                    draggable
                    aria-hidden="true"
                    title="拖拽调整一级分类顺序"
                    onDragStart={(event) => {
                      setDraggingPrimary(code)
                      event.dataTransfer.effectAllowed = 'move'
                      event.dataTransfer.setData('text/plain', code)
                    }}
                    onDragEnd={() => {
                      setDraggingPrimary(null)
                      setDragOverPrimary(null)
                    }}
                  >
                    ⠿
                  </span>
                  <button
                    type="button"
                    className="category-toggle"
                    aria-label={`${isCollapsed ? '展开' : '折叠'}一级分类 ${node.name}`}
                    aria-expanded={!isCollapsed}
                    onClick={() => togglePrimary(code)}
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
                  <span className="code-pill">{code}</span>
                  <input
                    className="text-input"
                    value={node.name}
                    onChange={(event) => renamePrimary(code, event.target.value)}
                    aria-label={`一级分类 ${code} 名称`}
                    disabled={busy}
                  />
                  {isCollapsed ? (
                    <span className="category-summary">{Object.keys(node.children).length} 个二级分类</span>
                  ) : null}
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => removePrimary(code)}
                    aria-label={`删除一级分类 ${code}`}
                    disabled={busy}
                  >
                    ×
                  </button>
                </div>
                {isCollapsed ? null : (
                <div className="category-children">
                  {Object.entries(node.children)
                    .sort(([left], [right]) => left.localeCompare(right))
                    .map(([childCode, childName]) => (
                      <div className="category-row is-child" key={childCode}>
                        <span className="code-pill is-child">
                          {code}/{childCode}
                        </span>
                        <input
                          className="text-input"
                          value={childName}
                          onChange={(event) => renameChild(code, childCode, event.target.value)}
                          aria-label={`二级分类 ${code}/${childCode} 名称`}
                          disabled={busy}
                        />
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => removeChild(code, childCode)}
                          aria-label={`删除二级分类 ${code}/${childCode}`}
                          disabled={busy}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  {addingChildFor === code ? (
                    <div className="insert-child">
                      <div className="insert-child-row">
                        <select
                          className="select-input insert-code"
                          value={newChildCode}
                          onChange={(event) => setNewChildCode(event.target.value)}
                          aria-label="新二级分类编号"
                          disabled={busy}
                        >
                          {ALL_CODES.map((option) => (
                            <option key={option} value={option}>
                              {option}
                              {node.children[option] ? ` · ${node.children[option]}` : ' · 空闲'}
                            </option>
                          ))}
                        </select>
                        <input
                          className="text-input"
                          value={newChildName}
                          onChange={(event) => setNewChildName(event.target.value)}
                          placeholder="二级分类名称"
                          aria-label="新二级分类名称"
                          disabled={busy}
                          autoFocus
                        />
                        <button
                          type="button"
                          className="button button-small button-primary"
                          onClick={confirmAddChild}
                          disabled={
                            busy ||
                            insertPreview === null ||
                            insertPreview.error !== null ||
                            shiftedDocuments.length > 0
                          }
                        >
                          添加
                        </button>
                        <button type="button" className="button button-small button-quiet" onClick={cancelAddChild}>
                          取消
                        </button>
                      </div>
                      <p
                        className={
                          insertPreview?.error || shiftedDocuments.length > 0
                            ? 'insert-hint is-warn'
                            : 'insert-hint'
                        }
                      >
                        {insertPreview?.error ?? (
                          shiftedDocuments.length > 0 ? (
                            <>
                              该范围已有 {shiftedDocuments.length} 个文档（如 {shiftedDocuments[0]?.filename}），后移会让它们落入其他分类；请先移动文档，或改用末尾编号。
                            </>
                          ) : insertPreview && insertPreview.shiftedCodes.length > 0 ? (
                            <>
                              将把 {insertPreview.shiftedCodes.map((childCode) => `${code}/${childCode}`).join('、')}{' '}
                              各后移一位，空出 {code}/{newChildCode}。添加后请点击“保存设置”。
                            </>
                          ) : (
                            <>该编号空闲，将直接添加。添加后请点击“保存设置”。</>
                          )
                        )}
                      </p>
                    </div>
                  ) : (
                    <button type="button" className="link-button" onClick={() => startAddChild(code)} disabled={busy}>
                      + 添加二级分类
                    </button>
                  )}
                </div>
                )}
              </div>
              )
            })}
          {Object.keys(config.categories).length === 0 ? (
            <p className="settings-empty">还没有分类，重命名时仍可使用未配置的编号。</p>
          ) : null}
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section-head">
          <h3>固定标签</h3>
          <p className="settings-hint">即使暂时没有文件使用，这些标签也会出现在候选列表中。</p>
        </div>
        <TagEditor
          tags={config.pinnedTags}
          onChange={(tags) => setConfig((current) => ({ ...current, pinnedTags: tags }))}
          suggestions={snapshot.tags.map((tag) => tag.display)}
          placeholder="添加固定标签"
          disabled={busy}
        />
      </section>

      <section className="settings-section">
        <div className="settings-section-head">
          <h3>扫描</h3>
        </div>
        <div className="settings-grid">
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={config.scan.recursive}
              onChange={(event) =>
                setConfig((current) => ({ ...current, scan: { ...current.scan, recursive: event.target.checked } }))
              }
              disabled={busy}
            />
            递归扫描子目录
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={config.scan.followSymlinks}
              onChange={(event) =>
                setConfig((current) => ({
                  ...current,
                  scan: { ...current.scan, followSymlinks: event.target.checked }
                }))
              }
              disabled={busy}
            />
            跟随符号链接
          </label>
        </div>
        <label className="field">
          <span className="field-label">扩展名（逗号分隔）</span>
          <input
            className="text-input"
            value={config.scan.extensions.join(', ')}
            onChange={(event) =>
              setConfig((current) => ({
                ...current,
                scan: {
                  ...current.scan,
                  extensions: event.target.value
                    .split(',')
                    .map((item) => item.trim())
                    .filter(Boolean)
                }
              }))
            }
            disabled={busy}
          />
        </label>
        <label className="field">
          <span className="field-label">忽略规则（每行一条，使用 / 作为分隔符）</span>
          <textarea
            className="text-area"
            rows={4}
            value={config.scan.ignoreGlobs.join('\n')}
            onChange={(event) =>
              setConfig((current) => ({
                ...current,
                scan: {
                  ...current.scan,
                  ignoreGlobs: event.target.value.split('\n').map((item) => item.trim()).filter(Boolean)
                }
              }))
            }
            disabled={busy}
          />
        </label>
      </section>

      <section className="settings-section">
        <div className="settings-section-head">
          <h3>行为</h3>
        </div>
        <div className="settings-grid">
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={config.behavior.confirmBeforeRename}
              onChange={(event) =>
                setConfig((current) => ({
                  ...current,
                  behavior: { ...current.behavior, confirmBeforeRename: event.target.checked }
                }))
              }
              disabled={busy}
            />
            重命名前要求确认
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={config.behavior.warnAboutLinks}
              onChange={(event) =>
                setConfig((current) => ({
                  ...current,
                  behavior: { ...current.behavior, warnAboutLinks: event.target.checked }
                }))
              }
              disabled={busy}
            />
            提示链接失效风险
          </label>
        </div>
      </section>

      {confirmBatchSave ? (
        <Modal
          title="保存并重命名文档"
          subtitle="分类编号会变化，相关文档需要一起改名"
          onClose={() => setConfirmBatchSave(false)}
          footer={
            <>
              <button type="button" className="button button-quiet" onClick={() => setConfirmBatchSave(false)}>
                取消
              </button>
              <button
                type="button"
                className="button button-primary"
                onClick={() => {
                  setConfirmBatchSave(false)
                  void save()
                }}
                disabled={busy}
              >
                确认保存并改名
              </button>
            </>
          }
        >
          <div className="rename-summary">
            <p>
              将移动 {Object.keys(mappingChanges).length} 个一级分类，并重命名{' '}
              <strong>{batchDocuments.length}</strong> 个文档。
            </p>
            <ul className="issue-list">
              {batchDocuments.slice(0, 5).map((document) => (
                <li key={document.relativePath} className="issue issue-warning">
                  <span className="issue-mark">·</span>
                  <code>{document.filename}</code>
                </li>
              ))}
              {batchDocuments.length > 5 ? (
                <li className="issue issue-warning">
                  <span className="issue-mark">·</span>还有 {batchDocuments.length - 5} 个文档
                </li>
              ) : null}
            </ul>
            <p className="issue issue-warning">
              <span className="issue-mark">·</span>
              重命名可能使其他文档或外部工具中的链接失效；文件内容不会改变。
            </p>
            <p className="plan-hint">保存后可以在主界面点击「撤销」整体恢复分类和文件名。</p>
          </div>
        </Modal>
      ) : null}

      {resetConfirm ? (
        <Modal
          title="恢复默认配置"
          onClose={() => setResetConfirm(false)}
          footer={
            <>
              <button type="button" className="button button-quiet" onClick={() => setResetConfirm(false)}>
                取消
              </button>
              <button type="button" className="button button-danger" onClick={() => void reset()} disabled={busy}>
                确认恢复
              </button>
            </>
          }
        >
          <p className="plan-hint">
            将用默认配置覆盖 .leafmark.json。Markdown 文件不会被修改，编号、标签和标题仍然从文件名恢复。
          </p>
        </Modal>
      ) : null}
    </Modal>
  )
}
