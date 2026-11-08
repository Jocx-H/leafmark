import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { DocumentRecord } from '@shared/model'
import type { RenamePlanView, Snapshot } from '@shared/ipc-contracts'
import { recommendSequence } from '@shared/naming/allocate'
import { prepareMetadata } from '@shared/naming/prepare'
import { extractLeadingTags } from '@shared/naming/tag-extract'
import { Modal } from '../../components/Modal'
import { NamingFields, type NamingDraft } from '../../components/NamingFields'
import { StatusBadge } from '../../components/StatusBadge'
import {
  buildCategoryOptions,
  documentCode,
  documentTitle,
  formatBytes,
  formatTimestamp,
  usedSequences
} from '../../utils/documents'

interface DocumentEditorProps {
  document: DocumentRecord
  snapshot: Snapshot
  onCommitted: (snapshot: Snapshot, documentPath: string) => void
  onRequestRescan: () => void
  notify: (kind: 'info' | 'success' | 'error', message: string) => void
}

function initialDraft(document: DocumentRecord, snapshot: Snapshot): NamingDraft {
  const parsed = document.parsed
  if (parsed && parsed.code && parsed.code.length === 6 && parsed.primaryCode && parsed.secondaryCode) {
    return {
      primaryCode: parsed.primaryCode,
      secondaryCode: parsed.secondaryCode,
      sequenceCode: parsed.sequenceCode ?? '',
      tags: [...parsed.tags],
      title: parsed.title ?? ''
    }
  }

  const options = buildCategoryOptions(snapshot.config, snapshot.documents)
  const primaryCode = options.primaries[0]?.code ?? '00'
  const secondaryCode = (options.secondaries.get(primaryCode) ?? [])[0]?.code ?? '00'
  const allocation = recommendSequence(usedSequences(snapshot.documents, primaryCode, secondaryCode))
  const extracted = extractLeadingTags(documentTitle(document))
  return {
    primaryCode,
    secondaryCode,
    sequenceCode: allocation.kind === 'assigned' ? allocation.sequence : '',
    tags: extracted.tags,
    title: extracted.title
  }
}

function sameDraft(left: NamingDraft, right: NamingDraft): boolean {
  return (
    left.primaryCode === right.primaryCode &&
    left.secondaryCode === right.secondaryCode &&
    left.sequenceCode === right.sequenceCode &&
    left.title === right.title &&
    left.tags.length === right.tags.length &&
    left.tags.every((tag, index) => tag === right.tags[index])
  )
}

export function DocumentEditor({
  document,
  snapshot,
  onCommitted,
  onRequestRescan,
  notify
}: DocumentEditorProps): ReactNode {
  const initial = useRef<NamingDraft>(initialDraft(document, snapshot)).current
  const [draft, setDraft] = useState<NamingDraft>(initial)
  const [plan, setPlan] = useState<RenamePlanView | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [committing, setCommitting] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const requestSequence = useRef(0)
  const planIdRef = useRef<string | null>(null)

  const isUnmanaged = document.status === 'unmanaged'
  const needsRepair = document.status !== 'valid'
  const dirty = needsRepair || !sameDraft(draft, initial)
  const writable = snapshot.workspace?.writable !== false
  const draftSignature = JSON.stringify(draft)

  useEffect(() => {
    return () => {
      const planId = planIdRef.current
      if (planId) void window.leafmark.cancelPlan(planId)
    }
  }, [])

  useEffect(() => {
    if (!dirty || !writable) {
      setPlan(null)
      setPreviewing(false)
      return
    }
    let cancelled = false
    const sequence = requestSequence.current + 1
    requestSequence.current = sequence
    setPreviewing(true)
    const timer = setTimeout(() => {
      void (async () => {
        const result = await window.leafmark.previewRename({
          sourceRelativePath: document.relativePath,
          primaryCode: draft.primaryCode,
          secondaryCode: draft.secondaryCode,
          sequenceCode: draft.sequenceCode,
          tags: draft.tags,
          title: draft.title
        })
        if (cancelled || requestSequence.current !== sequence) return
        setPreviewing(false)
        if (result.ok) {
          if (planIdRef.current && planIdRef.current !== result.value.id) {
            void window.leafmark.cancelPlan(planIdRef.current)
          }
          planIdRef.current = result.value.id
          setPlan(result.value)
          setPreviewError(null)
        } else {
          setPlan(null)
          setPreviewError(result.error.message)
        }
      })()
    }, 180)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [draftSignature, dirty, writable, document.relativePath, snapshot.revision, draft])

  const prepared = prepareMetadata(draft)
  const localIssues = plan ? [...plan.errors, ...plan.warnings] : prepared.issues
  const planMatchesDraft = plan !== null && plan.targetFilename === prepared.filename
  const canCommit =
    writable && plan !== null && plan.errors.length === 0 && !previewing && !committing && planMatchesDraft

  const reset = (): void => {
    const next = initialDraft(document, snapshot)
    setDraft(next)
    setPlan(null)
    setPreviewError(null)
  }

  const performCommit = async (): Promise<void> => {
    if (!plan) return
    setCommitting(true)
    const result = await window.leafmark.commitRename(plan.id)
    setCommitting(false)
    setConfirming(false)
    if (result.ok) {
      planIdRef.current = null
      notify('success', isUnmanaged ? '文件已纳入管理' : '重命名完成')
      onCommitted(result.value.snapshot, result.value.documentPath)
    } else {
      notify('error', result.error.message)
      setPlan(null)
      planIdRef.current = null
      onRequestRescan()
    }
  }

  const beginCommit = (): void => {
    if (!plan || plan.targetFilename !== prepared.filename) return
    if (snapshot.config.behavior.confirmBeforeRename) setConfirming(true)
    else void performCommit()
  }

  const code = documentCode(document)
  const conflictCount = document.conflictsWith.length
  const alertTone =
    document.status === 'conflict' ? 'tone-warn' : document.status === 'invalid' ? 'tone-danger' : 'tone-muted'

  return (
    <section className="editor" aria-label="文档编辑面板">
      <header className="editor-head">
        <div className="editor-head-main">
          <div className="editor-eyebrow">
            <StatusBadge status={document.status} />
            <span className="mono editor-code">{code ?? '未编号'}</span>
          </div>
          <h2 className="editor-title">{documentTitle(document)}</h2>
          <div className="editor-path" title={document.relativePath}>
            {document.relativePath}
          </div>
        </div>
      </header>

      <div className="editor-scroll">
        {document.status !== 'valid' ? (
          <div className={`editor-alert ${alertTone}`}>
            {isUnmanaged ? (
              <>
                <strong>尚未纳入管理</strong>
                <p>提交后会按规范重命名，文件内容保持逐字节不变。</p>
              </>
            ) : document.status === 'conflict' ? (
              <>
                <strong>编号冲突</strong>
                <p>
                  编号 {code} 也被 {conflictCount} 个其他文件使用：
                  {document.conflictsWith.map((path) => (
                    <span className="conflict-path" key={path}>
                      {path}
                    </span>
                  ))}
                </p>
              </>
            ) : (
              <>
                <strong>命名异常</strong>
                <ul>
                  {(document.parsed?.issues ?? [])
                    .filter((item) => item.severity === 'error')
                    .slice(0, 4)
                    .map((item, index) => (
                      <li key={index}>{item.message}</li>
                    ))}
                </ul>
              </>
            )}
          </div>
        ) : null}

        <NamingFields
          draft={draft}
          onChange={setDraft}
          snapshot={snapshot}
          disabled={committing || !writable}
          showFilename={false}
        />

        <div className="plan-card">
          <div className="plan-head">
            <span className="field-label">重命名预览</span>
            {!writable ? (
              <span className="plan-state is-error">只读状态</span>
            ) : !dirty ? (
              <span className="plan-state">未修改</span>
            ) : previewing ? (
              <span className="plan-state">正在检查…</span>
            ) : plan ? (
              <span className={plan.errors.length > 0 ? 'plan-state is-error' : 'plan-state is-ok'}>
                {plan.errors.length > 0 ? `${plan.errors.length} 个问题` : '可以提交'}
              </span>
            ) : (
              <span className="plan-state">等待输入</span>
            )}
          </div>
          <div className="plan-line">
            <span className="plan-label">当前</span>
            <code className="plan-name">{document.filename}</code>
          </div>
          <div className="plan-line">
            <span className="plan-label">目标</span>
            <code className="plan-name is-target">{plan?.targetFilename ?? prepared.filename}</code>
          </div>
          {previewError ? <p className="issue issue-error">{previewError}</p> : null}
          {localIssues.length > 0 ? (
            <ul className="issue-list">
              {localIssues.map((item, index) => (
                <li key={index} className={item.severity === 'error' ? 'issue issue-error' : 'issue issue-warning'}>
                  <span className="issue-mark">{item.severity === 'error' ? '!' : '·'}</span>
                  {item.message}
                </li>
              ))}
            </ul>
          ) : null}
          {plan && plan.errors.length === 0 && plan.warnings.length === 0 ? (
            <p className="plan-ok">文件名合法、编号未占用、目标路径可用。</p>
          ) : null}
          <p className="plan-hint">
            {dirty
              ? '重命名不会移动物理目录，也不会修改 Markdown 正文。'
              : '修改分类、序号、标签或标题后会生成新的目标文件名。'}
          </p>
        </div>

        <dl className="doc-facts">
          <div>
            <dt>物理目录</dt>
            <dd>{document.relativeDir === '.' ? '工作区根目录' : document.relativeDir}</dd>
          </div>
          <div>
            <dt>文件大小</dt>
            <dd>{formatBytes(document.sizeBytes)}</dd>
          </div>
          <div>
            <dt>修改时间</dt>
            <dd>{formatTimestamp(document.mtimeMs)}</dd>
          </div>
          <div>
            <dt>状态</dt>
            <dd>
              <StatusBadge status={document.status} />
            </dd>
          </div>
        </dl>
      </div>

      <footer className="editor-actions">
        <button type="button" className="button button-primary" disabled={!canCommit} onClick={beginCommit}>
          {committing ? '处理中…' : isUnmanaged ? '纳入管理' : '保存重命名'}
        </button>
        <button type="button" className="button button-quiet" onClick={reset} disabled={!dirty || committing}>
          重置
        </button>
      </footer>

      {confirming && plan ? (
        <Modal
          title={isUnmanaged ? '确认纳入管理' : '确认重命名'}
          subtitle="请确认目标文件名和可能的链接风险"
          onClose={() => setConfirming(false)}
          footer={
            <>
              <button type="button" className="button button-quiet" onClick={() => setConfirming(false)}>
                取消
              </button>
              <button type="button" className="button button-primary" onClick={() => void performCommit()}>
                确认重命名
              </button>
            </>
          }
        >
          <div className="rename-summary">
            <div className="rename-line">
              <span className="plan-label">当前</span>
              <code>{document.filename}</code>
            </div>
            <div className="rename-line">
              <span className="plan-label">目标</span>
              <code>{plan.targetFilename}</code>
            </div>
            {plan.warnings.map((warning, index) => (
              <p className="issue issue-warning" key={index}>
                <span className="issue-mark">·</span>
                {warning.message}
              </p>
            ))}
            <p className="plan-hint">文件内容不会改变；物理目录保持不变。</p>
          </div>
        </Modal>
      ) : null}
    </section>
  )
}
