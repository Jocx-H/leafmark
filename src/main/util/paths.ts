import path from 'node:path'
import { ISSUE, LeafmarkError } from '@shared/errors'
import { normalizeNfc } from '@shared/naming/validate'

/** Converts a host path fragment to the POSIX form used in snapshots and configs. */
export function toPosix(value: string): string {
  return value.split(path.sep).join('/')
}

/** Converts a POSIX style relative path to the host separator form. */
export function fromPosix(value: string): string {
  return value.split('/').join(path.sep)
}

/** Resolves a relative path against the workspace and rejects any escape attempt. */
export function resolveInside(rootPath: string, relativePath: string): string {
  if (typeof relativePath !== 'string' || relativePath.length === 0) {
    throw new LeafmarkError(ISSUE.invalidInput, '路径不能为空')
  }
  if (path.isAbsolute(relativePath)) {
    throw new LeafmarkError(ISSUE.workspaceBoundary, '不允许使用绝对路径')
  }
  const root = path.resolve(rootPath)
  const resolved = path.resolve(root, fromPosix(relativePath))
  const relative = path.relative(root, resolved)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new LeafmarkError(ISSUE.workspaceBoundary, '路径超出了当前工作区')
  }
  return resolved
}

export function relativeToRoot(rootPath: string, absolutePath: string): string {
  return toPosix(path.relative(path.resolve(rootPath), path.resolve(absolutePath)))
}

export function dirnamePosix(relativePath: string): string {
  const index = relativePath.lastIndexOf('/')
  return index === -1 ? '.' : relativePath.slice(0, index)
}

export function basenamePosix(relativePath: string): string {
  const index = relativePath.lastIndexOf('/')
  return index === -1 ? relativePath : relativePath.slice(index + 1)
}

/**
 * Normalizes a file name for case insensitive comparisons.
 * Unicode NFC avoids macOS decomposition surprises; lowercasing approximates the
 * case insensitive behaviour of the default Windows and macOS file systems.
 */
export function normalizeForCompare(value: string): string {
  return normalizeNfc(value).toLowerCase()
}
