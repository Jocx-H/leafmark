import { useMemo, type ReactNode } from 'react'
import type { Snapshot } from '@shared/ipc-contracts'
import { prepareMetadata } from '@shared/naming/prepare'
import { utf8ByteLength } from '@shared/naming/validate'
import { TagEditor } from './TagEditor'
import { recommendSequence } from '@shared/naming/allocate'
import {
  buildCategoryOptions,
  usedSequences,
  type CategoryOption
} from '../utils/documents'

export interface NamingDraft {
  primaryCode: string
  secondaryCode: string
  sequenceCode: string
  tags: string[]
  title: string
}

interface NamingFieldsProps {
  draft: NamingDraft
  onChange: (draft: NamingDraft) => void
  snapshot: Snapshot
  disabled?: boolean
  titleAutoFocus?: boolean
  showFilename?: boolean
}

export function NamingFields({
  draft,
  onChange,
  snapshot,
  disabled,
  titleAutoFocus,
  showFilename = true
}: NamingFieldsProps): ReactNode {
  const options = useMemo(
    () => buildCategoryOptions(snapshot.config, snapshot.documents),
    [snapshot.config, snapshot.documents]
  )

  const primaries: CategoryOption[] =
    options.primaries.length > 0 ? options.primaries : [{ code: '00', name: '未分类' }]
  const secondaries: CategoryOption[] =
    (options.secondaries.get(draft.primaryCode) ?? []).length > 0
      ? (options.secondaries.get(draft.primaryCode) as CategoryOption[])
      : [{ code: draft.secondaryCode || '00', name: '未分类' }]

  const used = usedSequences(snapshot.documents, draft.primaryCode, draft.secondaryCode)
  const allocation = recommendSequence(used)

  const prepared = prepareMetadata(draft)
  const bytes = utf8ByteLength(prepared.filename)
  const overLimit = bytes > 200
  const errors = prepared.issues.filter((item) => item.severity === 'error')
  const warnings = prepared.issues.filter((item) => item.severity === 'warning')

  const suggestionSource = useMemo(() => {
    const seen = new Set<string>()
    const result: string[] = []
    for (const item of [...snapshot.tags.map((tag) => tag.display), ...snapshot.config.pinnedTags]) {
      const key = item.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      result.push(item)
    }
    return result
  }, [snapshot.tags, snapshot.config.pinnedTags])

  const applyPrimary = (code: string): void => {
    const nextSecondaries = options.secondaries.get(code) ?? []
    const secondary =
      nextSecondaries.find((item) => item.code === draft.secondaryCode)?.code ??
      nextSecondaries[0]?.code ??
      '00'
    const nextAllocation = recommendSequence(usedSequences(snapshot.documents, code, secondary))
    onChange({
      ...draft,
      primaryCode: code,
      secondaryCode: secondary,
      sequenceCode: nextAllocation.kind === 'assigned' ? nextAllocation.sequence : ''
    })
  }

  const applySecondary = (code: string): void => {
    const nextAllocation = recommendSequence(usedSequences(snapshot.documents, draft.primaryCode, code))
    onChange({
      ...draft,
      secondaryCode: code,
      sequenceCode: nextAllocation.kind === 'assigned' ? nextAllocation.sequence : ''
    })
  }

  const applyRecommendedSequence = (): void => {
    if (allocation.kind !== 'assigned') return
    onChange({ ...draft, sequenceCode: allocation.sequence })
  }

  return (
    <div className="naming-fields">
      <div className="field-row">
        <label className="field">
          <span className="field-label">一级分类</span>
          <select
            className="select-input"
            value={draft.primaryCode}
            onChange={(event) => applyPrimary(event.target.value)}
            disabled={disabled}
            data-testid="primary-select"
          >
            {primaries.map((item) => (
              <option key={item.code} value={item.code}>
                {item.code} · {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">二级分类</span>
          <select
            className="select-input"
            value={draft.secondaryCode}
            onChange={(event) => applySecondary(event.target.value)}
            disabled={disabled}
            data-testid="secondary-select"
          >
            {secondaries.map((item) => (
              <option key={item.code} value={item.code}>
                {item.code} · {item.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="field">
        <span className="field-label">文档序号</span>
        <div className="sequence-row">
          <input
            className="text-input sequence-input"
            value={draft.sequenceCode}
            onChange={(event) =>
              onChange({ ...draft, sequenceCode: event.target.value.replace(/[^0-9]/g, '').slice(0, 2) })
            }
            placeholder="00"
            inputMode="numeric"
            disabled={disabled}
            aria-label="两位文档序号"
          />
          <button
            type="button"
            className="button button-quiet sequence-recommend"
            onClick={applyRecommendedSequence}
            disabled={disabled || allocation.kind !== 'assigned'}
          >
            {allocation.kind === 'assigned' ? `推荐 ${allocation.sequence}` : '需手动选择'}
          </button>
          <span className="field-hint">
            {allocation.kind === 'assigned'
              ? `该分类已用 ${used.length} 个序号`
              : allocation.kind === 'manual'
                ? allocation.message
                : allocation.message}
          </span>
        </div>
      </div>

      <div className="field">
        <span className="field-label">标签</span>
        <TagEditor
          tags={draft.tags}
          onChange={(tags) => onChange({ ...draft, tags })}
          suggestions={suggestionSource}
          disabled={disabled}
        />
      </div>

      <label className="field">
        <span className="field-label">标题</span>
        <input
          className="text-input"
          value={draft.title}
          onChange={(event) => onChange({ ...draft, title: event.target.value })}
          placeholder="例如：稀疏矩阵乘优化"
          disabled={disabled}
          autoFocus={titleAutoFocus}
          data-testid="title-input"
        />
      </label>

      {showFilename ? (
        <div className="filename-preview" data-testid="filename-preview">
          <div className="filename-head">
            <span className="field-label">目标文件名</span>
            <span className={overLimit ? 'byte-count is-over' : 'byte-count'}>
              {bytes} / 200 字节
            </span>
          </div>
          <code className="filename-value">{prepared.filename}</code>
        </div>
      ) : null}

      {errors.length > 0 || warnings.length > 0 ? (
        <ul className="issue-list">
          {errors.map((item, index) => (
            <li key={`error-${index}`} className="issue issue-error">
              <span className="issue-mark">!</span>
              {item.message}
            </li>
          ))}
          {warnings.map((item, index) => (
            <li key={`warning-${index}`} className="issue issue-warning">
              <span className="issue-mark">·</span>
              {item.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
