import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ISSUE, LeafmarkError } from '@shared/errors'
import { WorkspaceSession } from '../src/main/session/workspaceSession'
import { atomicRename } from '../src/main/rename/fsOps'
import { createTempWorkspace, listFiles, readText, type TempWorkspace } from './helpers'

let workspace: TempWorkspace | null = null
let session: WorkspaceSession | null = null

async function setup(files: Record<string, string>, config?: unknown): Promise<{ workspace: TempWorkspace; session: WorkspaceSession }> {
  workspace = await createTempWorkspace(files, config === undefined ? {} : { config })
  session = await WorkspaceSession.open(workspace.root, { watch: false })
  return { workspace, session }
}

afterEach(async () => {
  session?.dispose()
  session = null
  await workspace?.cleanup()
  workspace = null
})

function findDocument(activeSession: WorkspaceSession, filename: string) {
  const document = activeSession.snapshot().documents.find((item) => item.filename === filename)
  if (!document) throw new Error(`missing document: ${filename}`)
  return document
}

describe('rename flow', () => {
  it('adopts an unmanaged file without touching its content', async () => {
    const { workspace, session } = await setup({ '普通草稿.md': '正文内容' })
    const document = findDocument(session, '普通草稿.md')

    const plan = await session.previewRename({
      sourceRelativePath: document.relativePath,
      primaryCode: '01',
      secondaryCode: '01',
      sequenceCode: '00',
      tags: ['论文'],
      title: '普通草稿'
    })

    expect(plan.kind).toBe('adopt')
    expect(plan.errors).toEqual([])
    expect(plan.targetFilename).toBe('010100_[论文]_普通草稿.md')
    await session.commitRename(plan.id)

    expect(await readText(workspace.root, '010100_[论文]_普通草稿.md')).toBe('正文内容')
    expect(await listFiles(workspace.root)).not.toContain('普通草稿.md')
    expect(session.snapshot().documents[0]?.status).toBe('valid')
  })

  it('renames a valid document and keeps its bytes', async () => {
    const { workspace, session } = await setup({ '010100_旧标题.md': '逐字节保留\n' })
    const plan = await session.previewRename({
      sourceRelativePath: '010100_旧标题.md',
      primaryCode: '01',
      secondaryCode: '01',
      sequenceCode: '00',
      tags: [],
      title: '新标题'
    })
    expect(plan.targetFilename).toBe('010100_新标题.md')
    await session.commitRename(plan.id)
    expect(await readText(workspace.root, '010100_新标题.md')).toBe('逐字节保留\n')
    expect(await listFiles(workspace.root)).not.toContain('010100_旧标题.md')
  })

  it('moves category by number and keeps the physical directory', async () => {
    const { workspace, session } = await setup({ 'archive/010100_a.md': 'x' })
    const plan = await session.previewRename({
      sourceRelativePath: 'archive/010100_a.md',
      primaryCode: '03',
      secondaryCode: '02',
      sequenceCode: '05',
      tags: ['CUDA'],
      title: 'a'
    })
    expect(plan.targetRelativePath).toBe('archive/030205_[CUDA]_a.md')
    await session.commitRename(plan.id)
    expect(await readText(workspace.root, 'archive/030205_[CUDA]_a.md')).toBe('x')
  })

  it('normalizes an uppercase extension', async () => {
    const { workspace, session } = await setup({ '010100_标题.MD': 'x' })
    const plan = await session.previewRename({
      sourceRelativePath: '010100_标题.MD',
      primaryCode: '01',
      secondaryCode: '01',
      sequenceCode: '00',
      tags: [],
      title: '新标题'
    })
    expect(plan.targetFilename).toBe('010100_新标题.md')
    await session.commitRename(plan.id)
    expect(await listFiles(workspace.root)).toContain('010100_新标题.md')
  })

  it('rejects a code that is already used by another document', async () => {
    const { session } = await setup({
      '010100_a.md': 'a',
      '普通草稿.md': 'b'
    })
    const plan = await session.previewRename({
      sourceRelativePath: '普通草稿.md',
      primaryCode: '01',
      secondaryCode: '01',
      sequenceCode: '00',
      tags: [],
      title: '普通草稿'
    })
    expect(plan.errors.map((item) => item.code)).toContain(ISSUE.codeConflict)
  })

  it('refuses to commit when the source changed after the preview', async () => {
    const { workspace, session } = await setup({ '010100_旧.md': 'a' })
    const plan = await session.previewRename({
      sourceRelativePath: '010100_旧.md',
      primaryCode: '01',
      secondaryCode: '01',
      sequenceCode: '00',
      tags: [],
      title: '新'
    })
    await fs.appendFile(path.join(workspace.root, '010100_旧.md'), ' changed content')
    await expect(session.commitRename(plan.id)).rejects.toMatchObject({ code: ISSUE.sourceChanged })
  })

  it('refuses to overwrite a target that appeared after the preview', async () => {
    const { workspace, session } = await setup({ '010100_旧.md': 'a' })
    const plan = await session.previewRename({
      sourceRelativePath: '010100_旧.md',
      primaryCode: '01',
      secondaryCode: '01',
      sequenceCode: '00',
      tags: [],
      title: '新'
    })
    await fs.writeFile(path.join(workspace.root, '010100_新.md'), 'external', 'utf8')
    await expect(session.commitRename(plan.id)).rejects.toMatchObject({ code: ISSUE.targetExists })
    expect(await readText(workspace.root, '010100_旧.md')).toBe('a')
  })

  it('performs a case only rename safely', async () => {
    const { workspace, session } = await setup({ '010100_Case.md': 'a' })
    const plan = await session.previewRename({
      sourceRelativePath: '010100_Case.md',
      primaryCode: '01',
      secondaryCode: '01',
      sequenceCode: '00',
      tags: [],
      title: 'case'
    })
    expect(plan.targetFilename).toBe('010100_case.md')
    await session.commitRename(plan.id)
    const files = await listFiles(workspace.root)
    expect(files).toContain('010100_case.md')
    expect(files.filter((file) => file.endsWith('.md'))).toHaveLength(1)
  })

  it('rejects an unknown or consumed plan', async () => {
    const { session } = await setup({ '010100_a.md': 'a' })
    await expect(session.commitRename('does-not-exist')).rejects.toMatchObject({ code: ISSUE.planUnknown })

    const plan = await session.previewRename({
      sourceRelativePath: '010100_a.md',
      primaryCode: '01',
      secondaryCode: '01',
      sequenceCode: '00',
      tags: [],
      title: 'b'
    })
    await session.commitRename(plan.id)
    await expect(session.commitRename(plan.id)).rejects.toMatchObject({ code: ISSUE.planUnknown })
  })

  it('repairs underscore separated tag groups into the canonical name', async () => {
    const { workspace, session } = await setup({
      '000001_[模板元]_[C++]模板元编程特性总结.md': 'x'
    })
    const document = findDocument(session, '000001_[模板元]_[C++]模板元编程特性总结.md')
    expect(document.status).toBe('invalid')
    expect(document.parsed?.tags).toEqual(['模板元', 'C++'])
    expect(document.parsed?.title).toBe('模板元编程特性总结')

    const plan = await session.previewRename({
      sourceRelativePath: document.relativePath,
      primaryCode: '00',
      secondaryCode: '00',
      sequenceCode: '01',
      tags: ['模板元', 'C++'],
      title: '模板元编程特性总结'
    })
    expect(plan.targetFilename).toBe('000001_[模板元][C++]_模板元编程特性总结.md')
    expect(plan.errors).toEqual([])
    await session.commitRename(plan.id)

    expect(await listFiles(workspace.root)).toContain('000001_[模板元][C++]_模板元编程特性总结.md')
    expect(session.snapshot().documents[0]?.status).toBe('valid')
    expect(session.snapshot().documents[0]?.parsed?.tags).toEqual(['模板元', 'C++'])
  })

  it('resolves a conflict by assigning a free sequence', async () => {
    const { session } = await setup({
      '010100_a.md': 'a',
      'sub/010100_b.md': 'b'
    })
    const plan = await session.previewRename({
      sourceRelativePath: '010100_a.md',
      primaryCode: '01',
      secondaryCode: '01',
      sequenceCode: '01',
      tags: [],
      title: 'a'
    })
    expect(plan.errors).toEqual([])
    await session.commitRename(plan.id)
    const statuses = session.snapshot().documents.map((document) => document.status)
    expect(statuses).toEqual(['valid', 'valid'])
  })

  it('reports both files when two documents share a code', async () => {
    const { session } = await setup({
      '010100_a.md': 'a',
      'sub/010100_b.md': 'b'
    })
    const snapshot = session.snapshot()
    const first = snapshot.documents.find((document) => document.filename === '010100_a.md')
    const second = snapshot.documents.find((document) => document.filename === '010100_b.md')
    expect(first?.status).toBe('conflict')
    expect(second?.status).toBe('conflict')
    expect(first?.conflictsWith).toEqual(['sub/010100_b.md'])
  })
})

describe('workspace boundary', () => {
  it('refuses to rename through a directory symlink that leaves the workspace', async () => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'leafmark-outside-'))
    await fs.writeFile(path.join(outside, '010100_a.md'), 'outside', 'utf8')
    try {
      const config = {
        schemaVersion: 1,
        scan: {
          recursive: true,
          extensions: ['.md'],
          followSymlinks: true,
          ignoreGlobs: []
        }
      }
      const workspaceLocal = await createTempWorkspace({}, { config })
      workspace = workspaceLocal
      try {
        await fs.symlink(outside, path.join(workspaceLocal.root, 'link'), 'dir')
      } catch {
        return
      }
      session = await WorkspaceSession.open(workspaceLocal.root, { watch: false })
      const document = session.snapshot().documents.find((item) => item.filename === '010100_a.md')
      expect(document).toBeTruthy()
      await expect(
        session.previewRename({
          sourceRelativePath: document?.relativePath ?? 'link/010100_a.md',
          primaryCode: '01',
          secondaryCode: '01',
          sequenceCode: '00',
          tags: [],
          title: 'b'
        })
      ).rejects.toMatchObject({ code: ISSUE.workspaceBoundary })
    } finally {
      await fs.rm(outside, { recursive: true, force: true })
    }
  })
})

describe('create document', () => {
  it('creates an empty file with the recommended sequence', async () => {
    const { workspace, session } = await setup({ '020100_已有.md': 'x' })
    const result = await session.createDocument({
      primaryCode: '02',
      secondaryCode: '01',
      sequenceCode: '',
      tags: ['课程'],
      title: '并行计算复习'
    })
    expect(result.documentPath).toBe('020101_[课程]_并行计算复习.md')
    const stat = await fs.stat(path.join(workspace.root, result.documentPath))
    expect(stat.size).toBe(0)
    expect(session.snapshot().documents.some((document) => document.relativePath === result.documentPath)).toBe(true)
  })

  it('rejects a duplicate code', async () => {
    const { session } = await setup({ '010100_已有.md': 'x' })
    await expect(
      session.createDocument({
        primaryCode: '01',
        secondaryCode: '01',
        sequenceCode: '00',
        tags: [],
        title: '新的'
      })
    ).rejects.toMatchObject({ code: ISSUE.codeConflict })
  })

  it('rejects an invalid title without creating a file', async () => {
    const { workspace, session } = await setup({})
    await expect(
      session.createDocument({
        primaryCode: '01',
        secondaryCode: '01',
        sequenceCode: '00',
        tags: [],
        title: '非法/标题'
      })
    ).rejects.toMatchObject({ code: ISSUE.titleForbiddenChar })
    expect(await listFiles(workspace.root)).toEqual(['.leafmark.json'])
  })
})

describe('undo', () => {
  it('restores the previous name', async () => {
    const { workspace, session } = await setup({ '010100_旧.md': 'x' })
    const plan = await session.previewRename({
      sourceRelativePath: '010100_旧.md',
      primaryCode: '01',
      secondaryCode: '01',
      sequenceCode: '00',
      tags: [],
      title: '新'
    })
    await session.commitRename(plan.id)
    const result = await session.undoLastRename()
    expect(result.undone).toBe(true)
    expect(result.documentPath).toBe('010100_旧.md')
    expect(await readText(workspace.root, '010100_旧.md')).toBe('x')
    expect(await listFiles(workspace.root)).not.toContain('010100_新.md')
  })

  it('fails safely when the old name is occupied', async () => {
    const { workspace, session } = await setup({ '010100_旧.md': 'x' })
    const plan = await session.previewRename({
      sourceRelativePath: '010100_旧.md',
      primaryCode: '01',
      secondaryCode: '01',
      sequenceCode: '00',
      tags: [],
      title: '新'
    })
    await session.commitRename(plan.id)
    await fs.writeFile(path.join(workspace.root, '010100_旧.md'), '占用', 'utf8')
    const result = await session.undoLastRename()
    expect(result.undone).toBe(false)
    expect(await readText(workspace.root, '010100_新.md')).toBe('x')
    expect(await readText(workspace.root, '010100_旧.md')).toBe('占用')
  })

  it('reports when there is nothing to undo', async () => {
    const { session } = await setup({ '010100_a.md': 'a' })
    const result = await session.undoLastRename()
    expect(result.undone).toBe(false)
    expect(result.documentPath).toBeNull()
  })
})

describe('configuration state', () => {
  it('becomes read only when the configuration is broken', async () => {
    const root = await createTempWorkspace({ '010100_a.md': 'a' }, { configText: '{ broken json' })
    workspace = root
    session = await WorkspaceSession.open(root.root, { watch: false })
    expect(session.isWritable).toBe(false)

    const plan = await session.previewRename({
      sourceRelativePath: '010100_a.md',
      primaryCode: '01',
      secondaryCode: '01',
      sequenceCode: '00',
      tags: [],
      title: 'b'
    })
    expect(plan.errors.map((item) => item.code)).toContain(ISSUE.configReadonly)
    await expect(
      session.createDocument({
        primaryCode: '01',
        secondaryCode: '01',
        sequenceCode: '01',
        tags: [],
        title: '新的'
      })
    ).rejects.toMatchObject({ code: ISSUE.configReadonly })
  })

  it('writes the configuration through the session and rescans', async () => {
    const { workspace, session } = await setup({ '010100_a.md': 'a' })
    const config = session.snapshot().config
    config.categories['07'] = { name: '新分类', children: { '01': '子分类' } }
    const next = await session.updateConfig(config)
    expect(next.config.categories['07']?.name).toBe('新分类')
    const raw = JSON.parse(await readText(workspace.root, '.leafmark.json')) as {
      categories: Record<string, { name: string }>
    }
    expect(raw.categories['07']?.name).toBe('新分类')
  })
})

describe('atomicRename', () => {
  it('never overwrites an existing file', async () => {
    const workspace = await createTempWorkspace({ 'a.md': 'a', 'b.md': 'b' })
    try {
      await expect(
        atomicRename(path.join(workspace.root, 'a.md'), path.join(workspace.root, 'b.md'))
      ).rejects.toBeInstanceOf(LeafmarkError)
      expect(await readText(workspace.root, 'b.md')).toBe('b')
      expect(await readText(workspace.root, 'a.md')).toBe('a')
    } finally {
      await workspace.cleanup()
    }
  })
})
