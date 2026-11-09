import type { Issue, IssueCode } from './errors'
import type { DocumentMetadata } from './naming/format'
import type { DocumentRecord, ScanProblem, TagStat } from './model'
import type { LeafmarkConfig } from './config/types'

export interface WorkspaceState {
  rootPath: string
  name: string
  configPath: string
  configStatus: 'ok' | 'missing' | 'invalid' | 'unreadable'
  configIssues: Issue[]
  /** True when the parsed configuration is writable (valid, or absent with defaults). */
  writable: boolean
}

export interface Snapshot {
  revision: number
  workspace: WorkspaceState | null
  config: LeafmarkConfig
  documents: DocumentRecord[]
  scanProblems: ScanProblem[]
  tags: TagStat[]
  recentWorkspaces: string[]
  canUndo: boolean
  undoLabel: string | null
  lastScanAt: number | null
  scanning: boolean
  watcherActive: boolean
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: { code: IssueCode; message: string } }

export interface RenameInput {
  sourceRelativePath: string
  primaryCode: string
  secondaryCode: string
  sequenceCode: string
  tags: string[]
  title: string
}

export interface CreateDocumentInput {
  primaryCode: string
  secondaryCode: string
  sequenceCode: string
  tags: string[]
  title: string
}

export type RenamePlanKind = 'rename' | 'adopt'

export interface RenamePlanView {
  id: string
  kind: RenamePlanKind
  sourceRelativePath: string
  targetRelativePath: string
  targetFilename: string
  oldMetadata: DocumentMetadata | null
  newMetadata: DocumentMetadata
  errors: Issue[]
  warnings: Issue[]
  createdAt: number
  expiresAt: number
}

export interface RenameCommitResult {
  snapshot: Snapshot
  documentPath: string
}

export interface CreateResult {
  snapshot: Snapshot
  documentPath: string
}

export interface UndoResult {
  snapshot: Snapshot
  undone: boolean
  message: string
  documentPath: string | null
}

export interface OpenWorkspaceResult {
  canceled: boolean
  snapshot: Snapshot | null
}

export interface OpenRecentResult {
  snapshot: Snapshot
}

export interface Notice {
  kind: 'info' | 'success' | 'error'
  message: string
}

export interface AppInfo {
  appVersion: string
  electronVersion: string
  platform: string
  arch: string
}

export interface LeafmarkApi {
  getSnapshot(): Promise<Result<Snapshot>>
  chooseWorkspace(): Promise<Result<OpenWorkspaceResult>>
  openRecentWorkspace(path: string): Promise<Result<OpenRecentResult>>
  rescan(): Promise<Result<Snapshot>>
  previewRename(input: RenameInput): Promise<Result<RenamePlanView>>
  commitRename(planId: string): Promise<Result<RenameCommitResult>>
  cancelPlan(planId: string): Promise<Result<null>>
  createDocument(input: CreateDocumentInput): Promise<Result<CreateResult>>
  undoLastRename(): Promise<Result<UndoResult>>
  updateConfig(config: LeafmarkConfig, mapping?: Record<string, string>): Promise<Result<Snapshot>>
  resetConfig(): Promise<Result<Snapshot>>
  getAppInfo(): Promise<Result<AppInfo>>
  onSnapshot(listener: (snapshot: Snapshot) => void): () => void
  onNotice(listener: (notice: Notice) => void): () => void
}

export const IPC = {
  getSnapshot: 'leafmark:get-snapshot',
  chooseWorkspace: 'leafmark:choose-workspace',
  openRecentWorkspace: 'leafmark:open-recent-workspace',
  rescan: 'leafmark:rescan',
  previewRename: 'leafmark:preview-rename',
  commitRename: 'leafmark:commit-rename',
  cancelPlan: 'leafmark:cancel-plan',
  createDocument: 'leafmark:create-document',
  undoLastRename: 'leafmark:undo-last-rename',
  updateConfig: 'leafmark:update-config',
  resetConfig: 'leafmark:reset-config',
  getAppInfo: 'leafmark:get-app-info',
  snapshotEvent: 'leafmark:snapshot',
  noticeEvent: 'leafmark:notice'
} as const
