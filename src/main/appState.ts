import path from 'node:path'
import { BrowserWindow, dialog } from 'electron'
import { ISSUE, LeafmarkError, type IssueCode } from '@shared/errors'
import { createDefaultConfig, type LeafmarkConfig } from '@shared/config/types'
import type {
  CreateDocumentInput,
  Notice,
  OpenRecentResult,
  OpenWorkspaceResult,
  RenameInput,
  RenamePlanView,
  Snapshot,
  UndoResult
} from '@shared/ipc-contracts'
import { IPC } from '@shared/ipc-contracts'
import { WorkspaceSession } from './session/workspaceSession'
import { RecentWorkspaces } from './recents'

/**
 * Owns the single active workspace session and the window it is bound to.
 * All methods are called from IPC handlers and therefore re-validate their input.
 */
export class AppState {
  private session: WorkspaceSession | null = null
  private window: BrowserWindow | null = null
  private unsubscribe: (() => void) | null = null
  private readonly recents: RecentWorkspaces
  private opening = false

  constructor(userDataPath: string) {
    this.recents = new RecentWorkspaces(path.join(userDataPath, 'recent-workspaces.json'))
  }

  async init(): Promise<void> {
    await this.recents.load()
  }

  attachWindow(window: BrowserWindow): void {
    this.window = window
  }

  dispose(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
    this.session?.dispose()
    this.session = null
    this.window = null
  }

  getWindow(): BrowserWindow | null {
    return this.window
  }

  private emptySnapshot(): Snapshot {
    return {
      revision: 0,
      workspace: null,
      config: createDefaultConfig(),
      documents: [],
      scanProblems: [],
      tags: [],
      recentWorkspaces: this.recents.list(),
      canUndo: false,
      undoLabel: null,
      lastScanAt: null,
      scanning: false,
      watcherActive: false
    }
  }

  snapshot(): Snapshot {
    const session = this.session
    if (!session) return this.emptySnapshot()
    session.setRecentWorkspaces(this.recents.list())
    return session.snapshot()
  }

  private requireSession(): WorkspaceSession {
    if (!this.session) {
      throw new LeafmarkError(ISSUE.invalidInput, '尚未打开任何工作区')
    }
    return this.session
  }

  private broadcast(snapshot: Snapshot): void {
    const window = this.window
    if (!window || window.isDestroyed()) return
    window.webContents.send(IPC.snapshotEvent, snapshot)
  }

  notify(notice: Notice): void {
    const window = this.window
    if (!window || window.isDestroyed()) return
    window.webContents.send(IPC.noticeEvent, notice)
  }

  async openWorkspace(rootPath: string): Promise<Snapshot> {
    if (this.opening) {
      throw new LeafmarkError(ISSUE.invalidInput, '正在打开其他工作区，请稍候')
    }
    this.opening = true
    try {
      const next = await WorkspaceSession.open(rootPath)
      const previous = this.session
      this.unsubscribe?.()
      this.session = next
      this.unsubscribe = next.subscribe((snapshot) => this.broadcast(snapshot))
      previous?.dispose()
      await this.recents.add(next.rootPath)
      next.setRecentWorkspaces(this.recents.list())
      this.broadcast(next.snapshot())
      return next.snapshot()
    } finally {
      this.opening = false
    }
  }

  async chooseWorkspace(): Promise<OpenWorkspaceResult> {
    const window = this.window
    if (!window) throw new LeafmarkError(ISSUE.invalidInput, '窗口尚未就绪')
    const result = await dialog.showOpenDialog(window, {
      title: '选择 LeafMark 工作区',
      buttonLabel: '打开工作区',
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true, snapshot: null }
    }
    const snapshot = await this.openWorkspace(result.filePaths[0] as string)
    return { canceled: false, snapshot }
  }

  async openRecentWorkspace(workspacePath: string): Promise<OpenRecentResult> {
    if (typeof workspacePath !== 'string' || workspacePath.length === 0) {
      throw new LeafmarkError(ISSUE.invalidInput, '工作区路径无效')
    }
    return { snapshot: await this.openWorkspace(workspacePath) }
  }

  async rescan(): Promise<Snapshot> {
    return this.requireSession().rescan()
  }

  async previewRename(input: RenameInput): Promise<RenamePlanView> {
    return this.requireSession().previewRename(input)
  }

  async commitRename(planId: string): Promise<{ snapshot: Snapshot; documentPath: string }> {
    const session = this.requireSession()
    const result = await session.commitRename(planId)
    return { snapshot: session.snapshot(), documentPath: result.documentPath }
  }

  async cancelPlan(planId: string): Promise<null> {
    await this.requireSession().cancelPlan(planId)
    return null
  }

  async createDocument(input: CreateDocumentInput): Promise<{ snapshot: Snapshot; documentPath: string }> {
    const session = this.requireSession()
    const result = await session.createDocument(input)
    return { snapshot: session.snapshot(), documentPath: result.documentPath }
  }

  async undoLastRename(): Promise<UndoResult> {
    return this.requireSession().undoLastRename()
  }

  async updateConfig(config: LeafmarkConfig): Promise<Snapshot> {
    const session = this.requireSession()
    return session.updateConfig(config)
  }

  async resetConfig(): Promise<Snapshot> {
    const session = this.requireSession()
    return session.resetConfig()
  }

  async openFromCommandLine(candidate: string | null): Promise<void> {
    if (!candidate) {
      this.broadcast(this.emptySnapshot())
      return
    }
    try {
      await this.openWorkspace(candidate)
    } catch (error) {
      const message = error instanceof LeafmarkError ? error.message : (error as Error).message
      this.notify({ kind: 'error', message: `无法打开工作区：${message}` })
      this.broadcast(this.emptySnapshot())
    }
  }
}

export type { IssueCode }
