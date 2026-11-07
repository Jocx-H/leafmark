import { promises as fs } from 'node:fs'
import path from 'node:path'
import { validateConfig } from '@shared/config/validate'
import { createDefaultConfig, type LeafmarkConfig } from '@shared/config/types'
import { ISSUE, LeafmarkError, issue, type Issue } from '@shared/errors'

export const CONFIG_FILENAME = '.leafmark.json'

export type ConfigFileState =
  | { status: 'ok'; config: LeafmarkConfig; raw: Record<string, unknown>; issues: Issue[] }
  | { status: 'missing'; config: LeafmarkConfig; raw: null; issues: Issue[] }
  | {
      status: 'invalid'
      config: LeafmarkConfig
      raw: null
      issues: Issue[]
      syntaxError: { message: string; line: number; column: number } | null
    }
  | { status: 'unreadable'; config: LeafmarkConfig; raw: null; issues: Issue[]; error: string }

export function configPathFor(rootPath: string): string {
  return path.join(rootPath, CONFIG_FILENAME)
}

function locateJsonError(text: string, message: string): { line: number; column: number } | null {
  const lineColumn = /line\s+(\d+)\s+column\s+(\d+)/i.exec(message)
  if (lineColumn) {
    return { line: Number(lineColumn[1]), column: Number(lineColumn[2]) }
  }
  const position = /position\s+(\d+)/i.exec(message)
  if (!position) return null
  const offset = Number(position[1])
  const before = text.slice(0, Math.max(0, Math.min(offset, text.length)))
  const lines = before.split('\n')
  return { line: lines.length, column: (lines[lines.length - 1]?.length ?? 0) + 1 }
}

function formatJsonError(text: string, message: string): string {
  const location = locateJsonError(text, message)
  if (location === null) return `配置文件不是合法的 JSON：${message}`
  return `配置文件不是合法的 JSON：${message}（第 ${location.line} 行，第 ${location.column} 列）`
}

export async function readConfigFile(rootPath: string): Promise<ConfigFileState> {
  const filePath = configPathFor(rootPath)
  let text: string
  try {
    text = await fs.readFile(filePath, 'utf8')
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      return { status: 'missing', config: createDefaultConfig(), raw: null, issues: [] }
    }
    return {
      status: 'unreadable',
      config: createDefaultConfig(),
      raw: null,
      issues: [
        issue(ISSUE.configInvalid, `无法读取配置文件：${(error as Error).message}`, 'error', undefined, CONFIG_FILENAME)
      ],
      error: (error as Error).message
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    const rawMessage = (error as Error).message
    const location = locateJsonError(text, rawMessage)
    const message = formatJsonError(text, rawMessage)
    return {
      status: 'invalid',
      config: createDefaultConfig(),
      raw: null,
      issues: [issue(ISSUE.configInvalid, message, 'error', undefined, CONFIG_FILENAME)],
      syntaxError: location ? { message, line: location.line, column: location.column } : null
    }
  }

  const validated = validateConfig(parsed)
  const rawObject = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {}

  if (validated.issues.some((item) => item.severity === 'error')) {
    return {
      status: 'invalid',
      config: validated.config,
      raw: null,
      issues: validated.issues,
      syntaxError: null
    }
  }

  return { status: 'ok', config: validated.config, raw: rawObject, issues: validated.issues }
}

function mergeForWrite(raw: Record<string, unknown>, config: LeafmarkConfig): Record<string, unknown> {
  return {
    ...raw,
    schemaVersion: config.schemaVersion,
    scan: {
      recursive: config.scan.recursive,
      extensions: [...config.scan.extensions],
      followSymlinks: config.scan.followSymlinks,
      ignoreGlobs: [...config.scan.ignoreGlobs]
    },
    categories: Object.fromEntries(
      Object.entries(config.categories)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([primary, node]) => [
          primary,
          {
            name: node.name,
            children: Object.fromEntries(
              Object.entries(node.children).sort(([left], [right]) => left.localeCompare(right))
            )
          }
        ])
    ),
    pinnedTags: [...config.pinnedTags],
    behavior: {
      confirmBeforeRename: config.behavior.confirmBeforeRename,
      warnAboutLinks: config.behavior.warnAboutLinks
    }
  }
}

/** Writes the configuration using a temporary file and an atomic rename. */
export async function writeConfigFile(
  rootPath: string,
  config: LeafmarkConfig,
  previousRaw: Record<string, unknown> | null
): Promise<void> {
  const target = configPathFor(rootPath)
  const directory = path.dirname(target)
  const temporary = path.join(
    directory,
    `.${CONFIG_FILENAME}.${process.pid}.${Math.random().toString(36).slice(2, 10)}.tmp`
  )
  const payload = `${JSON.stringify(mergeForWrite(previousRaw ?? {}, config), null, 2)}\n`

  let handle: import('node:fs/promises').FileHandle | null = null
  try {
    handle = await fs.open(temporary, 'wx', 0o644)
    await handle.writeFile(payload, 'utf8')
    await handle.sync()
    await handle.close()
    handle = null
    await fs.rename(temporary, target)
  } catch (error) {
    if (handle) {
      await handle.close().catch(() => undefined)
    }
    await fs.unlink(temporary).catch(() => undefined)
    throw new LeafmarkError(
      ISSUE.configWriteFailed,
      `写入工作区配置失败：${(error as Error).message}`,
      temporary
    )
  }
}

export async function readConfigRaw(rootPath: string): Promise<Record<string, unknown> | null> {
  try {
    const text = await fs.readFile(configPathFor(rootPath), 'utf8')
    const parsed: unknown = JSON.parse(text)
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return null
  } catch {
    return null
  }
}
