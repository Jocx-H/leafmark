import { useMemo, useState, type ReactNode } from 'react'
import type { Snapshot } from '@shared/ipc-contracts'
import { prepareMetadata } from '@shared/naming/prepare'
import { recommendSequence } from '@shared/naming/allocate'
import { Modal } from '../../components/Modal'
import { NamingFields, type NamingDraft } from '../../components/NamingFields'
import { buildCategoryOptions, usedSequences } from '../../utils/documents'

interface CreateDialogProps {
  snapshot: Snapshot
  onClose: () => void
  onCreated: (snapshot: Snapshot, documentPath: string) => void
  notify: (kind: 'info' | 'success' | 'error', message: string) => void
}

function initialDraft(snapshot: Snapshot): NamingDraft {
  const options = buildCategoryOptions(snapshot.config, snapshot.documents)
  const primaryCode = options.primaries[0]?.code ?? '00'
  const secondaryCode = (options.secondaries.get(primaryCode) ?? [])[0]?.code ?? '00'
  const allocation = recommendSequence(usedSequences(snapshot.documents, primaryCode, secondaryCode))
  return {
    primaryCode,
    secondaryCode,
    sequenceCode: allocation.kind === 'assigned' ? allocation.sequence : '',
    tags: [],
    title: ''
  }
}

export function CreateDialog({ snapshot, onClose, onCreated, notify }: CreateDialogProps): ReactNode {
  const [draft, setDraft] = useState<NamingDraft>(() => initialDraft(snapshot))
  const [busy, setBusy] = useState(false)
  const prepared = useMemo(() => prepareMetadata(draft), [draft])
  const errors = prepared.issues.filter((item) => item.severity === 'error')

  const submit = async (): Promise<void> => {
    if (errors.length > 0 || busy) return
    setBusy(true)
    const result = await window.leafmark.createDocument({
      primaryCode: draft.primaryCode,
      secondaryCode: draft.secondaryCode,
      sequenceCode: draft.sequenceCode,
      tags: draft.tags,
      title: draft.title
    })
    setBusy(false)
    if (!result.ok) {
      notify('error', result.error.message)
      return
    }
    notify('success', `已创建 ${result.value.documentPath}`)
    onCreated(result.value.snapshot, result.value.documentPath)
    onClose()
  }

  return (
    <Modal
      title="新建 Markdown 文档"
      subtitle="选择分类与序号、填写标题和标签，提交后创建一个空的 .md 文件"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="button button-quiet" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={() => void submit()}
            disabled={busy || errors.length > 0}
          >
            {busy ? '创建中…' : '创建文档'}
          </button>
        </>
      }
    >
      <NamingFields draft={draft} onChange={setDraft} snapshot={snapshot} disabled={busy} titleAutoFocus />
      <p className="plan-hint">只创建空文件，不写入 Front Matter 或正文模板。</p>
    </Modal>
  )
}
