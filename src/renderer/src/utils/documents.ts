import type { LeafmarkConfig } from '@shared/config/types'
import type { DocumentRecord, DocumentStatus } from '@shared/model'
import type { Snapshot } from '@shared/ipc-contracts'
import type { SequenceAllocation } from '@shared/naming/allocate'
import { recommendSequence } from '@shared/naming/allocate'

export type ViewKey = 'all' | 'unmanaged' | 'invalid' | 'conflict' | `cat:${string}` | `cat:${string}:${string}`

export interface CategoryOption {
  code: string
  name: string
}

export interface CategoryNodeView {
  code: string
  name: string
  count: number
  children: CategoryNodeView[]
}

export function documentCode(document: DocumentRecord): string | null {
  const code = document.parsed?.code
  return code && code.length === 6 ? code : null
}

export function documentTitle(document: DocumentRecord): string {
  if (document.parsed?.title) return document.parsed.title
  if (document.parsed?.stem) return document.parsed.stem
  return document.filename.replace(/\.md$/i, '')
}

export function documentTags(document: DocumentRecord): string[] {
  return document.parsed?.tags ?? []
}

export function documentPrimary(document: DocumentRecord): string | null {
  return document.parsed?.primaryCode ?? null
}

export function documentSecondary(document: DocumentRecord): string | null {
  return document.parsed?.secondaryCode ?? null
}

export function isManaged(document: DocumentRecord): boolean {
  return document.status === 'valid' || document.status === 'conflict'
}

export function statusLabel(status: DocumentStatus): string {
  switch (status) {
    case 'valid':
      return '已管理'
    case 'unmanaged':
      return '未纳入管理'
    case 'invalid':
      return '命名异常'
    case 'conflict':
      return '编号冲突'
    default:
      return status
  }
}

export function statusTone(status: DocumentStatus): 'ok' | 'muted' | 'danger' | 'warn' {
  switch (status) {
    case 'valid':
      return 'ok'
    case 'unmanaged':
      return 'muted'
    case 'invalid':
      return 'danger'
    case 'conflict':
      return 'warn'
    default:
      return 'muted'
  }
}

export function buildCategoryOptions(
  config: LeafmarkConfig,
  documents: readonly DocumentRecord[]
): { primaries: CategoryOption[]; secondaries: Map<string, CategoryOption[]> } {
  const primaryNames = new Map<string, string>()
  const secondaryNames = new Map<string, Map<string, string>>()

  for (const [code, node] of Object.entries(config.categories)) {
    primaryNames.set(code, node.name)
    const children = new Map<string, string>()
    for (const [childCode, childName] of Object.entries(node.children ?? {})) {
      children.set(childCode, childName)
    }
    secondaryNames.set(code, children)
  }

  for (const document of documents) {
    const parsed = document.parsed
    if (!parsed?.primaryCode || !parsed.secondaryCode || documentCode(document) === null) continue
    if (!primaryNames.has(parsed.primaryCode)) {
      primaryNames.set(parsed.primaryCode, '未配置')
    }
    let children = secondaryNames.get(parsed.primaryCode)
    if (!children) {
      children = new Map()
      secondaryNames.set(parsed.primaryCode, children)
    }
    if (!children.has(parsed.secondaryCode)) {
      children.set(parsed.secondaryCode, '未配置')
    }
  }

  const primaries = [...primaryNames.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([code, name]) => ({ code, name }))

  const secondaries = new Map<string, CategoryOption[]>()
  for (const [code, children] of secondaryNames) {
    secondaries.set(
      code,
      [...children.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([childCode, childName]) => ({ code: childCode, name: childName }))
    )
  }

  return { primaries, secondaries }
}

export function buildCategoryTree(
  config: LeafmarkConfig,
  documents: readonly DocumentRecord[]
): CategoryNodeView[] {
  const { primaries, secondaries } = buildCategoryOptions(config, documents)
  const counts = new Map<string, number>()

  for (const document of documents) {
    if (!isManaged(document)) continue
    const parsed = document.parsed
    if (!parsed?.primaryCode || !parsed.secondaryCode) continue
    const key = `${parsed.primaryCode}:${parsed.secondaryCode}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return primaries.map((primary) => {
    const children = (secondaries.get(primary.code) ?? []).map((secondary) => ({
      code: secondary.code,
      name: secondary.name,
      count: counts.get(`${primary.code}:${secondary.code}`) ?? 0,
      children: [] as CategoryNodeView[]
    }))
    return {
      code: primary.code,
      name: primary.name,
      count: children.reduce((total, child) => total + child.count, 0),
      children
    }
  })
}

export interface ViewCounts {
  all: number
  unmanaged: number
  invalid: number
  conflict: number
}

export function viewCounts(documents: readonly DocumentRecord[]): ViewCounts {
  return {
    all: documents.length,
    unmanaged: documents.filter((document) => document.status === 'unmanaged').length,
    invalid: documents.filter((document) => document.status === 'invalid').length,
    conflict: documents.filter((document) => document.status === 'conflict').length
  }
}

export function viewLabel(view: ViewKey, config: LeafmarkConfig): string {
  if (view === 'all') return '全部文件'
  if (view === 'unmanaged') return '未纳入管理'
  if (view === 'invalid') return '命名异常'
  if (view === 'conflict') return '编号冲突'
  const parts = view.split(':')
  const primary = parts[1] ?? ''
  const secondary = parts[2]
  const primaryName = config.categories[primary]?.name ?? '未配置'
  if (secondary === undefined) return primaryName
  const secondaryName = config.categories[primary]?.children?.[secondary] ?? '未配置'
  return `${primaryName} / ${secondaryName}`
}

export function filterDocuments(
  documents: readonly DocumentRecord[],
  view: ViewKey,
  query: string,
  selectedTags: readonly string[],
  tagMode: 'all' | 'any'
): DocumentRecord[] {
  const needle = query.trim().toLowerCase()
  const tagKeys = selectedTags.map((tag) => tag.toLowerCase())

  return documents.filter((document) => {
    if (view === 'unmanaged' && document.status !== 'unmanaged') return false
    if (view === 'invalid' && document.status !== 'invalid') return false
    if (view === 'conflict' && document.status !== 'conflict') return false

    if (view.startsWith('cat:')) {
      const parts = view.split(':')
      const primary = parts[1] ?? ''
      const secondary = parts[2]
      if (!isManaged(document)) return false
      if (document.parsed?.primaryCode !== primary) return false
      if (secondary !== undefined && document.parsed?.secondaryCode !== secondary) return false
    }

    if (needle.length > 0) {
      const title = documentTitle(document).toLowerCase()
      const filename = document.filename.toLowerCase()
      if (!title.includes(needle) && !filename.includes(needle)) return false
    }

    if (tagKeys.length > 0) {
      const docTags = new Set(documentTags(document).map((tag) => tag.toLowerCase()))
      const matches =
        tagMode === 'all'
          ? tagKeys.every((tag) => docTags.has(tag))
          : tagKeys.some((tag) => docTags.has(tag))
      if (!matches) return false
    }

    return true
  })
}

export function usedSequences(
  documents: readonly DocumentRecord[],
  primaryCode: string,
  secondaryCode: string
): string[] {
  const used: string[] = []
  for (const document of documents) {
    const parsed = document.parsed
    if (!parsed || documentCode(document) === null) continue
    if (parsed.primaryCode !== primaryCode || parsed.secondaryCode !== secondaryCode) continue
    if (parsed.sequenceCode) used.push(parsed.sequenceCode)
  }
  return used
}

export function recommendationFor(
  documents: readonly DocumentRecord[],
  primaryCode: string,
  secondaryCode: string
): SequenceAllocation {
  return recommendSequence(usedSequences(documents, primaryCode, secondaryCode))
}

export function snapshotCategoryOptions(snapshot: Snapshot): {
  primaries: CategoryOption[]
  secondaries: Map<string, CategoryOption[]>
} {
  return buildCategoryOptions(snapshot.config, snapshot.documents)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
