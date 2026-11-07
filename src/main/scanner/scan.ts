import { promises as fs } from 'node:fs'
import path from 'node:path'
import { hasErrors } from '@shared/errors'
import { createIgnoreMatcher } from '@shared/glob'
import type { LeafmarkConfig } from '@shared/config/types'
import type { DocumentRecord, DocumentStatus, ScanProblem, ScanResult } from '@shared/model'
import { hasValidCode, parseFilename } from '@shared/naming/parse'
import { buildTagStats } from '@shared/tag-index'
import { mapLimit } from '../util/async'
import { dirnamePosix, toPosix } from '../util/paths'

interface FileEntry {
  absolutePath: string
  relativePath: string
  filename: string
}

export interface ScanOptions {
  signal?: AbortSignal
}

function abortError(): Error {
  const error = new Error('扫描已取消')
  error.name = 'AbortError'
  return error
}

function problemFor(relativePath: string, error: unknown): ScanProblem {
  const code = (error as NodeJS.ErrnoException).code ?? 'EIO'
  const message =
    code === 'EACCES' || code === 'EPERM'
      ? '没有访问权限'
      : code === 'ENOENT'
        ? '路径已不存在'
        : `无法读取：${(error as Error).message}`
  return { path: relativePath || '.', code, message }
}

/**
 * Scans the workspace for Markdown files.
 *
 * Only directory entries and file metadata are read; Markdown content is never opened.
 * Unreadable directories and files become entries in `problems` and never abort the scan.
 */
export async function scanWorkspace(
  rootPath: string,
  config: LeafmarkConfig,
  options: ScanOptions = {}
): Promise<ScanResult> {
  const started = performance.now()
  const problems: ScanProblem[] = []
  const matcher = createIgnoreMatcher(config.scan.ignoreGlobs)
  const extensions = new Set(config.scan.extensions.map((extension) => extension.toLowerCase()))
  const files: FileEntry[] = []
  const visitedDirectories = new Set<string>()

  const checkAborted = (): void => {
    if (options.signal?.aborted) throw abortError()
  }

  async function walk(absoluteDir: string, relativeDir: string): Promise<void> {
    checkAborted()

    let realDirectory: string | null = null
    if (config.scan.followSymlinks) {
      try {
        realDirectory = await fs.realpath(absoluteDir)
      } catch {
        realDirectory = null
      }
      if (realDirectory !== null) {
        if (visitedDirectories.has(realDirectory)) return
        visitedDirectories.add(realDirectory)
      }
    }

    let directory: Awaited<ReturnType<typeof fs.opendir>> | null = null
    try {
      directory = await fs.opendir(absoluteDir)
    } catch (error) {
      problems.push(problemFor(relativeDir, error))
      return
    }

    const entries: import('node:fs').Dirent[] = []
    try {
      for await (const entry of directory) entries.push(entry)
    } catch (error) {
      problems.push(problemFor(relativeDir, error))
    } finally {
      await directory.close().catch(() => undefined)
    }

    for (const entry of entries) {
      checkAborted()
      const name = entry.name
      const childRelative = relativeDir === '' ? name : `${relativeDir}/${name}`
      const childAbsolute = path.join(absoluteDir, name)

      if (entry.isSymbolicLink()) {
        if (!config.scan.followSymlinks) continue
        let target: import('node:fs').Stats
        try {
          target = await fs.stat(childAbsolute)
        } catch (error) {
          problems.push(problemFor(childRelative, error))
          continue
        }
        if (target.isDirectory()) {
          if (matcher(childRelative, true)) continue
          if (!config.scan.recursive) continue
          await walk(childAbsolute, childRelative)
          continue
        }
        if (target.isFile() && extensions.has(path.extname(name).toLowerCase())) {
          files.push({ absolutePath: childAbsolute, relativePath: toPosix(childRelative), filename: name })
        }
        continue
      }

      if (entry.isDirectory()) {
        if (matcher(childRelative, true)) continue
        if (!config.scan.recursive) continue
        await walk(childAbsolute, childRelative)
        continue
      }

      if (!entry.isFile()) continue
      if (matcher(childRelative, false)) continue
      if (!extensions.has(path.extname(name).toLowerCase())) continue

      files.push({ absolutePath: childAbsolute, relativePath: toPosix(childRelative), filename: name })
    }
  }

  await walk(rootPath, '')
  checkAborted()

  const stats = await mapLimit(files, 32, async (file) => {
    try {
      return await fs.stat(file.absolutePath)
    } catch (error) {
      problems.push(problemFor(file.relativePath, error))
      return null
    }
  })

  type ParsedEntry = {
    entry: FileEntry
    parsed: ReturnType<typeof parseFilename>
    sizeBytes: number
    mtimeMs: number
  }

  const entries: ParsedEntry[] = []
  files.forEach((file, index) => {
    const stat = stats[index]
    if (!stat) return
    entries.push({
      entry: file,
      parsed: parseFilename(file.filename, { extensions: config.scan.extensions }),
      sizeBytes: stat.size,
      mtimeMs: stat.mtimeMs
    })
  })

  const codeGroups = new Map<string, string[]>()
  for (const item of entries) {
    if (!hasValidCode(item.parsed)) continue
    const code = item.parsed.code
    const group = codeGroups.get(code)
    if (group) group.push(item.entry.relativePath)
    else codeGroups.set(code, [item.entry.relativePath])
  }

  const documents: DocumentRecord[] = entries.map(({ entry, parsed, sizeBytes, mtimeMs }) => {
    const conflictsWith: string[] = []
    if (hasValidCode(parsed)) {
      const group = codeGroups.get(parsed.code) ?? []
      for (const candidate of group) {
        if (candidate !== entry.relativePath) conflictsWith.push(candidate)
      }
      conflictsWith.sort()
    }

    let status: DocumentStatus
    if (parsed.code === null) status = 'unmanaged'
    else if (conflictsWith.length > 0) status = 'conflict'
    else if (hasErrors(parsed.issues)) status = 'invalid'
    else status = 'valid'

    return {
      relativePath: entry.relativePath,
      relativeDir: dirnamePosix(entry.relativePath),
      filename: entry.filename,
      sizeBytes,
      mtimeMs,
      status,
      parsed,
      conflictsWith
    }
  })

  documents.sort((left, right) => {
    const leftCode = left.parsed?.code ?? '\uffff'
    const rightCode = right.parsed?.code ?? '\uffff'
    if (leftCode !== rightCode) return leftCode < rightCode ? -1 : 1
    return left.relativePath.localeCompare(right.relativePath)
  })

  return {
    documents,
    problems,
    tags: buildTagStats(documents),
    scannedAt: Date.now(),
    durationMs: Math.round(performance.now() - started)
  }
}

