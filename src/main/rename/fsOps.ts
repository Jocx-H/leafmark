import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { ISSUE, LeafmarkError } from '@shared/errors'
import { normalizeForCompare } from '../util/paths'

export interface CollisionCheck {
  exact: boolean
  caseInsensitive: boolean
  matchedEntry: string | null
}

export async function lstatOrNull(target: string): Promise<import('node:fs').Stats | null> {
  try {
    return await fs.lstat(target)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

/**
 * Checks whether a target name collides with an existing directory entry.
 * The source entry itself is ignored so that a pure case change is allowed.
 */
export async function checkCollision(
  directory: string,
  targetName: string,
  sourceName: string
): Promise<CollisionCheck> {
  let entries: string[]
  try {
    entries = await fs.readdir(directory)
  } catch (error) {
    throw new LeafmarkError(
      ISSUE.ioFailed,
      `无法读取目录以检查名称冲突：${(error as Error).message}`,
      directory
    )
  }

  const targetKey = normalizeForCompare(targetName)
  let exact = false
  let caseInsensitive = false
  let matchedEntry: string | null = null

  for (const entry of entries) {
    if (entry === sourceName) continue
    if (entry === targetName) {
      exact = true
      matchedEntry = entry
      break
    }
    if (normalizeForCompare(entry) === targetKey) {
      caseInsensitive = true
      matchedEntry = entry
    }
  }

  return { exact, caseInsensitive, matchedEntry }
}

/**
 * Renames `source` to `target` within the same directory.
 *
 * Node's `fs.rename` overwrites existing files on Windows and POSIX, therefore the
 * target is checked right before the rename. A pure case change goes through a unique
 * temporary name so that case insensitive file systems cannot merge the two entries.
 */
export async function atomicRename(source: string, target: string): Promise<void> {
  if (source === target) {
    throw new LeafmarkError(ISSUE.planNoChange, '源文件名和目标文件名相同')
  }

  const sourceName = path.basename(source)
  const targetName = path.basename(target)
  const sameDirectory = path.dirname(source) === path.dirname(target)
  const caseOnly = sameDirectory && normalizeForCompare(sourceName) === normalizeForCompare(targetName)

  const sourceStat = await lstatOrNull(source)
  if (sourceStat === null) {
    throw new LeafmarkError(ISSUE.sourceMissing, `源文件已不存在：${sourceName}`)
  }

  if (!caseOnly) {
    const targetStat = await lstatOrNull(target)
    if (targetStat !== null) {
      throw new LeafmarkError(ISSUE.targetExists, `目标文件已存在：${targetName}`)
    }
  }

  try {
    if (caseOnly) {
      const temporary = path.join(path.dirname(source), `.leafmark-tmp-${randomUUID()}`)
      await fs.rename(source, temporary)
      try {
        await fs.rename(temporary, target)
      } catch (error) {
        await fs.rename(temporary, source).catch(() => undefined)
        throw error
      }
    } else {
      await fs.rename(source, target)
    }
  } catch (error) {
    if (error instanceof LeafmarkError) throw error
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      throw new LeafmarkError(ISSUE.sourceMissing, `源文件已不存在：${sourceName}`)
    }
    if (code === 'EEXIST' || code === 'ENOTEMPTY' || code === 'EISDIR') {
      throw new LeafmarkError(ISSUE.targetExists, `目标文件已存在：${targetName}`)
    }
    throw new LeafmarkError(ISSUE.ioFailed, `重命名失败：${(error as Error).message}`, `${source} -> ${target}`)
  }
}
