import type { ParsedName } from './naming/parse'

export type DocumentStatus = 'valid' | 'unmanaged' | 'invalid' | 'conflict'

export interface DocumentRecord {
  /** POSIX style path relative to the workspace root, e.g. `archive/010100_a.md`. */
  relativePath: string
  /** POSIX style directory relative to the workspace root, `.` for the root itself. */
  relativeDir: string
  filename: string
  sizeBytes: number
  mtimeMs: number
  status: DocumentStatus
  /** Parsed metadata, or `null` for an unmanaged file. */
  parsed: ParsedName | null
  /** Other relative paths that share the same six digit code. */
  conflictsWith: string[]
}

export interface ScanProblem {
  path: string
  code: string
  message: string
}

export interface TagStat {
  /** NFC + lowercase identity used for comparisons. */
  key: string
  /** Display form chosen deterministically across the whole workspace. */
  display: string
  count: number
}

export interface ScanResult {
  documents: DocumentRecord[]
  problems: ScanProblem[]
  tags: TagStat[]
  scannedAt: number
  durationMs: number
}

export interface WorkspaceSummary {
  rootPath: string
  name: string
  configPath: string
}
