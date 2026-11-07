import { useMemo, useState, type ReactNode } from 'react'
import type { Snapshot } from '@shared/ipc-contracts'
import type { CategoryNode, LeafmarkConfig } from '@shared/config/types'
import { cloneConfig } from '@shared/config/types'
import { validateConfig } from '@shared/config/validate'
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
  }

  const removePrimary = (code: string): void => {
    const next = { ...config.categories }
    delete next[code]
    setCategories(next)
  }

  const addChild = (primary: string): void => {
    const node = config.categories[primary]
    if (!node) return
    const code = freeCode(Object.keys(node.children))
    if (code === null) {
      notify('error', '该一级分类下的二级编号已用尽')
      return
    }
    setCategories({
      ...config.categories,
      [primary]: { ...node, children: { ...node.children, [code]: '新二级分类' } }
    })
  }

  const removeChild = (primary: string, child: string): void => {
    const node = config.categories[primary]
    if (!node) return
    const children = { ...node.children }
    delete children[child]
    setCategories({ ...config.categories, [primary]: { ...node, children } })
  }

  const save = async (): Promise<void> => {
    if (errors.length > 0 || busy) return
    setBusy(true)
    const result = await window.leafmark.updateConfig(config)
    setBusy(false)
    if (!result.ok) {
      notify('error', result.error.message)
      return
    }
    notify('success', '工作区配置已保存')
    onSaved(result.value)
    onClose()
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
          <button type="button" className="button button-primary" onClick={() => void save()} disabled={busy || errors.length > 0}>
            {busy ? '保存中…' : '保存设置'}
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
          <h3>分类</h3>
          <button type="button" className="button button-quiet" onClick={addPrimary} disabled={busy}>
            添加一级分类
          </button>
        </div>
        <div className="category-list">
          {Object.entries(config.categories)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([code, node]) => (
              <div className="category-card" key={code}>
                <div className="category-row">
                  <span className="code-pill">{code}</span>
                  <input
                    className="text-input"
                    value={node.name}
                    onChange={(event) => renamePrimary(code, event.target.value)}
                    aria-label={`一级分类 ${code} 名称`}
                    disabled={busy}
                  />
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
                  <button type="button" className="link-button" onClick={() => addChild(code)} disabled={busy}>
                    + 添加二级分类
                  </button>
                </div>
              </div>
            ))}
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
