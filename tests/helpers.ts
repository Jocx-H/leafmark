import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createDefaultConfig } from '@shared/config/types'

export interface TempWorkspace {
  root: string
  cleanup: () => Promise<void>
}

export async function createTempWorkspace(
  files: Record<string, string> = {},
  options: { config?: unknown; configText?: string } = {}
): Promise<TempWorkspace> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'leafmark-test-'))
  const configPath = path.join(root, '.leafmark.json')

  if (options.configText !== undefined) {
    await fs.writeFile(configPath, options.configText, 'utf8')
  } else if (options.config !== undefined) {
    await fs.writeFile(configPath, `${JSON.stringify(options.config, null, 2)}\n`, 'utf8')
  } else {
    await fs.writeFile(configPath, `${JSON.stringify(createDefaultConfig(), null, 2)}\n`, 'utf8')
  }

  for (const [relativePath, content] of Object.entries(files)) {
    const absolute = path.join(root, relativePath)
    await fs.mkdir(path.dirname(absolute), { recursive: true })
    await fs.writeFile(absolute, content, 'utf8')
  }

  return {
    root,
    cleanup: () => fs.rm(root, { recursive: true, force: true })
  }
}

export async function readText(root: string, relativePath: string): Promise<string> {
  return fs.readFile(path.join(root, relativePath), 'utf8')
}

export async function listFiles(root: string, relativeDir = ''): Promise<string[]> {
  const entries = await fs.readdir(path.join(root, relativeDir), { withFileTypes: true })
  const result: string[] = []
  for (const entry of entries) {
    const relative = relativeDir === '' ? entry.name : `${relativeDir}/${entry.name}`
    if (entry.isDirectory()) result.push(...(await listFiles(root, relative)))
    else result.push(relative)
  }
  return result.sort()
}
