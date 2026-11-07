import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { ISSUE, LeafmarkError, hasErrors, issue } from '@shared/errors'
import type { LeafmarkConfig } from '@shared/config/types'
import { cloneConfig, createDefaultConfig } from '@shared/config/types'
import { validateConfig } from '@shared/config/validate'
import type { DocumentRecord, ScanProblem, ScanResult, TagStat } from '@shared/model'
import { recommendSequence } from '@shared/naming/allocate'
import { hasValidCode, parseFilename } from '@shared/naming/parse'
import { buildTagStats } from '@shared/tag-index'
import type {
  CreateDocumentInput,
  RenameInput,
  RenamePlanView,
  Snapshot,
  UndoResult,
  WorkspaceState
} from '@shared/ipc-contracts'
import { scanWorkspace } from '../scanner/scan'
import {
  CONFIG_FILENAME,
  configPathFor,
  readConfigFile,
  readConfigRaw,
  writeConfigFile,
  type ConfigFileState
} from '../config/io'
import { atomicRename, checkCollision, lstatOrNull } from '../rename/fsOps'
import { metadataFromDocument, prepareMetadata, splitIssues } from '../rename/metadata'
import { WorkspaceWatcher } from '../watcher/watcher'
import { dirnamePosix, resolveInside } from '../util/paths'

const PLAN_TTL_MS = 10 * 60 * 1000

interface StoredPlan {
  view: RenamePlanView
  sourceAbsolute: string
  targetAbsolute: string
  fingerprint: { size: number; mtimeMs: number }
}

interface UndoEntry {
  fromAbsolute: string
  toAbsolute: string
  fromRelative: string
  toRelative: string
  label: string
}

type SnapshotListener = (snapshot: Snapshot) => void

function compareDocuments(left: DocumentRecord, right: DocumentRecord): number {
  const leftCode = left.parsed?.code ?? '\uffff'
  const rightCode = right.parsed?.code ?? '\uffff'
  if (leftCode !== rightCode) return leftCode < rightCode ? -1 : 1
  return left.relativePath.localeCompare(right.relativePath)
}

export class WorkspaceSession {
  private documents: DocumentRecord[] = []
  private documentMap = new Map<string, DocumentRecord>()
  private problems: ScanProblem[] = []
  private tags: TagStat[] = []
  private scannedAt: number | null = null
  private revision = 0
  private scanning = false
  private scanPromise: Promise<void> | null = null
  private readonly plans = new Map<string, StoredPlan>()
  private readonly undoStack: UndoEntry[] = []
  private readonly listeners = new Set<SnapshotListener>()
  private readonly watcher: WorkspaceWatcher
  private watcherActive = false
  private recents: string[] = []
  private disposed = false

  private constructor(
    readonly rootPath: string,
    private configState: ConfigFileState,
    private readonly watchChanges: boolean
  ) {
    this.watcher = new WorkspaceWatcher(rootPath, {
      onBatch: (paths, overflow) => this.handleWatchBatch(paths, overflow),
      onStatus: (active) => {
        this.watcherActive = active
        this.emit()
      }
    })
  }

  static async open(rootPath: string, options: { watch?: boolean } = {}): Promise<WorkspaceSession> {
    const resolved = path.resolve(rootPath)
    let stat: import('node:fs').Stats
    try {
      stat = await fs.stat(resolved)
    } catch (error) {
      throw new LeafmarkError(
        ISSUE.workspaceUnreadable,
        `无法打开工作区：${(error as Error).message}`,
        resolved
      )
    }
    if (!stat.isDirectory()) {
      throw new LeafmarkError(ISSUE.workspaceUnreadable, '所选路径不是文件夹', resolved)
    }

    const configState = await readConfigFile(resolved)
    const session = new WorkspaceSession(resolved, configState, options.watch !== false)
    await session.runScan(true)
    if (session.watchChanges) session.watcher.start()
    return session
  }

  get config(): LeafmarkConfig {
    return this.configState.config
  }

  get isDisposed(): boolean {
    return this.disposed
  }

  get isWritable(): boolean {
    return this.configState.status === 'ok' || this.configState.status === 'missing'
  }

  subscribe(listener: SnapshotListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  setRecentWorkspaces(recents: string[]): void {
    this.recents = [...recents]
  }

  dispose(): void {
    this.disposed = true
    this.watcher.stop()
    this.plans.clear()
    this.listeners.clear()
  }

  snapshot(): Snapshot {
    return {
      revision: this.revision,
      workspace: this.workspaceState(),
      config: cloneConfig(this.configState.config),
      documents: this.documents,
      scanProblems: this.problems,
      tags: this.tags,
      recentWorkspaces: this.recents,
      canUndo: this.undoStack.length > 0,
      undoLabel: this.undoStack.length > 0 ? this.undoStack[this.undoStack.length - 1]?.label ?? null : null,
      lastScanAt: this.scannedAt,
      scanning: this.scanning,
      watcherActive: this.watcherActive
    }
  }

  private workspaceState(): WorkspaceState {
    return {
      rootPath: this.rootPath,
      name: path.basename(this.rootPath) || this.rootPath,
      configPath: configPathFor(this.rootPath),
      configStatus: this.configState.status,
      configIssues: this.configState.issues,
      writable: this.isWritable
    }
  }

  private emit(): void {
    if (this.disposed) return
    const snapshot = this.snapshot()
    for (const listener of this.listeners) {
      try {
        listener(snapshot)
      } catch {
        // A failing listener must never break the session.
      }
    }
  }

  private signature(): string {
    const documents = this.documents.map((document) => [
      document.relativePath,
      document.status,
      document.parsed?.code ?? '',
      document.parsed?.tags.join('\u0000') ?? '',
      document.parsed?.title ?? '',
      document.sizeBytes,
      Math.round(document.mtimeMs)
    ])
    return JSON.stringify([documents, this.problems.map((problem) => [problem.path, problem.message])])
  }

  private applyScan(result: ScanResult): void {
    this.documents = result.documents
    this.documentMap = new Map(result.documents.map((document) => [document.relativePath, document]))
    this.problems = result.problems
    this.tags = result.tags
    this.scannedAt = result.scannedAt
  }

  async rescan(): Promise<Snapshot> {
    await this.runScan(false)
    return this.snapshot()
  }

  private async runScan(force: boolean): Promise<void> {
    if (this.disposed) return
    if (this.scanPromise) {
      await this.scanPromise
      return
    }

    const previousSignature = this.signature()
    this.scanning = true
    this.emit()

    const promise = (async () => {
      try {
        const result = await scanWorkspace(this.rootPath, this.configState.config)
        this.applyScan(result)
      } catch (error) {
        this.problems = [
          {
            path: '.',
            code: (error as NodeJS.ErrnoException).code ?? 'SCAN_FAILED',
            message: `扫描失败：${(error as Error).message}`
          }
        ]
      } finally {
        this.scanning = false
        this.scanPromise = null
      }
    })()

    this.scanPromise = promise
    await promise

    if (force || this.signature() !== previousSignature) {
      this.revision += 1
    }
    this.emit()
  }

  private recomputeDerived(): void {
    const groups = new Map<string, string[]>()
    for (const document of this.documents) {
      if (!document.parsed || !hasValidCode(document.parsed)) continue
      const group = groups.get(document.parsed.code)
      if (group) group.push(document.relativePath)
      else groups.set(document.parsed.code, [document.relativePath])
    }

    for (const document of this.documents) {
      const parsed = document.parsed
      if (!parsed || !hasValidCode(parsed)) {
        document.conflictsWith = []
        document.status = parsed === null ? 'unmanaged' : 'invalid'
        continue
      }
      const group = groups.get(parsed.code) ?? []
      document.conflictsWith = group.filter((candidate) => candidate !== document.relativePath).sort()
      if (document.conflictsWith.length > 0) document.status = 'conflict'
      else if (hasErrors(parsed.issues)) document.status = 'invalid'
      else document.status = 'valid'
    }

    this.documents.sort(compareDocuments)
    this.documentMap = new Map(this.documents.map((document) => [document.relativePath, document]))
    this.tags = buildTagStats(this.documents)
  }

  private addDocument(document: DocumentRecord): void {
    this.documents = [...this.documents, document]
    this.recomputeDerived()
  }

  private removeDocument(relativePath: string): void {
    this.documents = this.documents.filter((document) => document.relativePath !== relativePath)
    this.recomputeDerived()
  }

  private markChanged(): void {
    this.revision += 1
    this.emit()
  }

  private async documentRecordFor(absolutePath: string, relativePath: string): Promise<DocumentRecord> {
    const stat = await fs.stat(absolutePath)
    const filename = path.basename(absolutePath)
    return {
      relativePath,
      relativeDir: dirnamePosix(relativePath),
      filename,
      sizeBytes: stat.size,
      mtimeMs: stat.mtimeMs,
      status: 'valid',
      parsed: parseFilename(filename),
      conflictsWith: []
    }
  }

  private assertWritable(): void {
    if (!this.isWritable) {
      throw new LeafmarkError(
        ISSUE.configReadonly,
        '工作区配置文件存在错误，当前为只读状态。请先修复或恢复默认配置'
      )
    }
  }

  private prunePlans(): void {
    const now = Date.now()
    for (const [id, plan] of this.plans) {
      if (now > plan.view.expiresAt) this.plans.delete(id)
    }
  }

  private codeConflictFor(code: string, excludedRelativePath: string | null): DocumentRecord | null {
    if (code.length !== 6) return null
    return (
      this.documents.find(
        (document) =>
          document.relativePath !== excludedRelativePath &&
          document.parsed !== null &&
          hasValidCode(document.parsed) &&
          document.parsed.code === code
      ) ?? null
    )
  }

  async previewRename(input: RenameInput): Promise<RenamePlanView> {
    if (typeof input?.sourceRelativePath !== 'string') {
      throw new LeafmarkError(ISSUE.invalidInput, '请求缺少源文件路径')
    }
    this.prunePlans()

    const source = this.documentMap.get(input.sourceRelativePath)
    if (!source) {
      throw new LeafmarkError(ISSUE.sourceMissing, '文档已不存在，请重新扫描工作区')
    }

    const sourceAbsolute = resolveInside(this.rootPath, source.relativePath)
    const sourceStat = await lstatOrNull(sourceAbsolute)
    if (sourceStat === null) {
      throw new LeafmarkError(ISSUE.sourceMissing, '文档已不存在，请重新扫描工作区')
    }
    if (sourceStat.isSymbolicLink()) {
      throw new LeafmarkError(ISSUE.symlink, '符号链接不参与重命名')
    }

    const prepared = prepareMetadata({
      primaryCode: input.primaryCode,
      secondaryCode: input.secondaryCode,
      sequenceCode: input.sequenceCode,
      tags: input.tags,
      title: input.title
    })
    const { errors, warnings } = splitIssues(prepared.issues)

    if (!this.isWritable) {
      errors.push(
        issue(ISSUE.configReadonly, '工作区配置文件存在错误，当前为只读状态', 'error')
      )
    }

    if (prepared.metadata.code.length === 6) {
      const conflicting = this.codeConflictFor(prepared.metadata.code, source.relativePath)
      if (conflicting) {
        errors.push(
          issue(
            ISSUE.codeConflict,
            `编号 ${prepared.metadata.code} 已被 “${conflicting.filename}” 使用`,
            'error',
            'code'
          )
        )
      }
    }

    const directory = path.dirname(sourceAbsolute)
    const collision = await checkCollision(directory, prepared.filename, path.basename(sourceAbsolute))
    if (collision.exact) {
      errors.push(
        issue(ISSUE.targetExists, `目标文件已存在：${prepared.filename}`, 'error', 'filename')
      )
    } else if (collision.caseInsensitive) {
      errors.push(
        issue(
          ISSUE.targetCaseConflict,
          `目标名称与已有文件 “${collision.matchedEntry ?? ''}” 仅大小写不同`,
          'error',
          'filename'
        )
      )
    }

    if (prepared.filename === source.filename) {
      errors.push(issue(ISSUE.planNoChange, '目标文件名与当前文件名相同', 'error'))
    }

    if (this.configState.config.behavior.warnAboutLinks && prepared.filename !== source.filename) {
      warnings.push(
        issue(ISSUE.linkRisk, '重命名可能使其他文档或外部工具中的链接失效', 'warning')
      )
    }

    const now = Date.now()
    const view: RenamePlanView = {
      id: randomUUID(),
      kind: source.status === 'unmanaged' ? 'adopt' : 'rename',
      sourceRelativePath: source.relativePath,
      targetRelativePath:
        dirnamePosix(source.relativePath) === '.'
          ? prepared.filename
          : `${dirnamePosix(source.relativePath)}/${prepared.filename}`,
      targetFilename: prepared.filename,
      oldMetadata: metadataFromDocument(source),
      newMetadata: prepared.metadata,
      errors,
      warnings,
      createdAt: now,
      expiresAt: now + PLAN_TTL_MS
    }

    this.plans.set(view.id, {
      view,
      sourceAbsolute,
      targetAbsolute: path.join(directory, prepared.filename),
      fingerprint: { size: sourceStat.size, mtimeMs: sourceStat.mtimeMs }
    })

    return view
  }

  async cancelPlan(planId: string): Promise<void> {
    this.plans.delete(planId)
  }

  async commitRename(planId: string): Promise<{ documentPath: string }> {
    this.assertWritable()
    const plan = this.plans.get(planId)
    if (!plan) {
      throw new LeafmarkError(ISSUE.planUnknown, '重命名预览已失效，请重新生成预览')
    }
    this.plans.delete(planId)

    if (Date.now() > plan.view.expiresAt) {
      throw new LeafmarkError(ISSUE.planExpired, '重命名预览已过期，请重新生成预览')
    }
    const { sourceAbsolute, targetAbsolute, view } = plan
    const firstPlanError = view.errors[0]
    if (firstPlanError) {
      throw new LeafmarkError(firstPlanError.code, `重命名预览存在未解决的错误：${firstPlanError.message}`)
    }

    const sourceStat = await lstatOrNull(sourceAbsolute)
    if (sourceStat === null) {
      throw new LeafmarkError(ISSUE.sourceMissing, '源文件已不存在，可能已被外部移动或删除')
    }
    if (sourceStat.isSymbolicLink()) {
      throw new LeafmarkError(ISSUE.symlink, '符号链接不参与重命名')
    }
    if (
      sourceStat.size !== plan.fingerprint.size ||
      Math.abs(sourceStat.mtimeMs - plan.fingerprint.mtimeMs) > 0.5
    ) {
      throw new LeafmarkError(
        ISSUE.sourceChanged,
        '源文件在预览之后被修改过，请重新扫描并生成预览'
      )
    }

    const sourceName = path.basename(sourceAbsolute)
    const collision = await checkCollision(path.dirname(targetAbsolute), path.basename(targetAbsolute), sourceName)
    if (collision.exact) {
      throw new LeafmarkError(
        ISSUE.targetExists,
        `目标文件已存在：${path.basename(targetAbsolute)}`
      )
    }
    if (collision.caseInsensitive) {
      throw new LeafmarkError(
        ISSUE.targetCaseConflict,
        `目标名称与已有文件 “${collision.matchedEntry ?? ''}” 仅大小写不同`
      )
    }

    const conflicting = this.codeConflictFor(view.newMetadata.code, view.sourceRelativePath)
    if (conflicting) {
      throw new LeafmarkError(
        ISSUE.codeConflict,
        `编号 ${view.newMetadata.code} 已被 “${conflicting.filename}” 使用`
      )
    }

    await atomicRename(sourceAbsolute, targetAbsolute)

    this.removeDocument(view.sourceRelativePath)
    const record = await this.documentRecordFor(targetAbsolute, view.targetRelativePath)
    this.addDocument(record)

    this.undoStack.push({
      fromAbsolute: sourceAbsolute,
      toAbsolute: targetAbsolute,
      fromRelative: view.sourceRelativePath,
      toRelative: view.targetRelativePath,
      label: `${sourceName} → ${path.basename(targetAbsolute)}`
    })

    this.markChanged()
    return { documentPath: view.targetRelativePath }
  }

  async createDocument(input: CreateDocumentInput): Promise<{ documentPath: string }> {
    this.assertWritable()

    let sequenceCode = (input.sequenceCode ?? '').trim()
    if (sequenceCode.length === 0) {
      const used = this.usedSequences(input.primaryCode, input.secondaryCode)
      const allocation = recommendSequence(used)
      if (allocation.kind === 'assigned') {
        sequenceCode = allocation.sequence
      } else {
        throw new LeafmarkError(
          allocation.kind === 'full' ? ISSUE.categoryFull : ISSUE.sequenceManual,
          allocation.message
        )
      }
    }

    const prepared = prepareMetadata({
      primaryCode: input.primaryCode,
      secondaryCode: input.secondaryCode,
      sequenceCode,
      tags: input.tags,
      title: input.title
    })
    const { errors } = splitIssues(prepared.issues)
    const firstError = errors[0]
    if (firstError) throw new LeafmarkError(firstError.code, firstError.message)

    const conflicting = this.codeConflictFor(prepared.metadata.code, null)
    if (conflicting) {
      throw new LeafmarkError(
        ISSUE.codeConflict,
        `编号 ${prepared.metadata.code} 已被 “${conflicting.filename}” 使用`
      )
    }

    const targetAbsolute = path.join(this.rootPath, prepared.filename)
    const collision = await checkCollision(this.rootPath, prepared.filename, '')
    if (collision.exact) {
      throw new LeafmarkError(ISSUE.targetExists, `目标文件已存在：${prepared.filename}`)
    }
    if (collision.caseInsensitive) {
      throw new LeafmarkError(
        ISSUE.targetCaseConflict,
        `目标名称与已有文件 “${collision.matchedEntry ?? ''}” 仅大小写不同`
      )
    }

    try {
      await fs.writeFile(targetAbsolute, '', { flag: 'wx', mode: 0o644 })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new LeafmarkError(ISSUE.targetExists, `目标文件已存在：${prepared.filename}`)
      }
      throw new LeafmarkError(ISSUE.ioFailed, `创建文件失败：${(error as Error).message}`)
    }

    const record = await this.documentRecordFor(targetAbsolute, prepared.filename)
    this.addDocument(record)
    this.markChanged()
    return { documentPath: prepared.filename }
  }

  private usedSequences(primaryCode: string, secondaryCode: string): string[] {
    const prefix = `${primaryCode}${secondaryCode}`
    const used: string[] = []
    for (const document of this.documents) {
      const parsed = document.parsed
      if (!parsed || !hasValidCode(parsed)) continue
      if (!parsed.code.startsWith(prefix)) continue
      if (parsed.sequenceCode) used.push(parsed.sequenceCode)
    }
    return used
  }

  async undoLastRename(): Promise<UndoResult> {
    const entry = this.undoStack[this.undoStack.length - 1]
    if (!entry) {
      return { snapshot: this.snapshot(), undone: false, message: '没有可撤销的重命名', documentPath: null }
    }
    if (!this.isWritable) {
      return {
        snapshot: this.snapshot(),
        undone: false,
        message: '工作区配置文件存在错误，当前为只读状态，无法撤销',
        documentPath: null
      }
    }

    const currentStat = await lstatOrNull(entry.toAbsolute)
    if (currentStat === null) {
      return {
        snapshot: this.snapshot(),
        undone: false,
        message: '撤销目标已不存在，可能已被外部移动或删除',
        documentPath: null
      }
    }

    const collision = await checkCollision(
      path.dirname(entry.fromAbsolute),
      path.basename(entry.fromAbsolute),
      path.basename(entry.toAbsolute)
    )
    if (collision.exact || collision.caseInsensitive) {
      return {
        snapshot: this.snapshot(),
        undone: false,
        message: `原名称已被 “${collision.matchedEntry ?? ''}” 占用，无法撤销`,
        documentPath: null
      }
    }

    try {
      await atomicRename(entry.toAbsolute, entry.fromAbsolute)
    } catch (error) {
      return {
        snapshot: this.snapshot(),
        undone: false,
        message: error instanceof LeafmarkError ? error.message : '撤销失败',
        documentPath: null
      }
    }

    this.undoStack.pop()
    this.removeDocument(entry.toRelative)
    const record = await this.documentRecordFor(entry.fromAbsolute, entry.fromRelative)
    this.addDocument(record)
    this.markChanged()

    return {
      snapshot: this.snapshot(),
      undone: true,
      message: `已撤销：${entry.label}`,
      documentPath: entry.fromRelative
    }
  }

  async updateConfig(nextConfig: LeafmarkConfig): Promise<Snapshot> {
    const validated = validateConfig(nextConfig)
    const firstError = validated.issues.find((item) => item.severity === 'error')
    if (firstError) {
      throw new LeafmarkError(ISSUE.configInvalid, firstError.message)
    }

    const raw = this.configState.status === 'ok' ? this.configState.raw : await readConfigRaw(this.rootPath)
    await writeConfigFile(this.rootPath, validated.config, raw)
    this.plans.clear()
    this.configState = await readConfigFile(this.rootPath)
    await this.runScan(true)
    return this.snapshot()
  }

  async resetConfig(): Promise<Snapshot> {
    await writeConfigFile(this.rootPath, createDefaultConfig(), null)
    this.plans.clear()
    this.configState = await readConfigFile(this.rootPath)
    await this.runScan(true)
    return this.snapshot()
  }

  private handleWatchBatch(paths: string[], overflow: boolean): void {
    if (this.disposed) return
    void overflow
    const configTouched = paths.some(
      (candidate) => candidate === CONFIG_FILENAME || candidate.endsWith(`/${CONFIG_FILENAME}`)
    )
    if (configTouched) {
      void this.reloadConfigFromDisk()
      return
    }
    void this.runScan(false)
  }

  private async reloadConfigFromDisk(): Promise<void> {
    if (this.disposed) return
    const next = await readConfigFile(this.rootPath)
    const changed =
      next.status !== this.configState.status ||
      JSON.stringify(next.config) !== JSON.stringify(this.configState.config)
    this.configState = next
    this.plans.clear()
    if (changed) await this.runScan(false)
    else this.emit()
  }
}
