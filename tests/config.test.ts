import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ISSUE } from '@shared/errors'
import { createDefaultConfig } from '@shared/config/types'
import { validateConfig } from '@shared/config/validate'
import { readConfigFile, writeConfigFile } from '../src/main/config/io'
import { createTempWorkspace } from './helpers'

describe('validateConfig', () => {
  it('requires schemaVersion', () => {
    const result = validateConfig({})
    expect(result.issues.some((item) => item.code === ISSUE.configInvalid)).toBe(true)
  })

  it('accepts the default configuration', () => {
    const result = validateConfig(createDefaultConfig())
    expect(result.issues.filter((item) => item.severity === 'error')).toEqual([])
  })

  it('rejects malformed category codes and empty names', () => {
    const result = validateConfig({
      schemaVersion: 1,
      categories: {
        '1': { name: '错', children: {} },
        '02': { name: '  ', children: {} },
        '03': { name: '正常', children: { '1': '错' } }
      }
    })
    const paths = result.issues.map((item) => item.path)
    expect(paths).toContain('categories.1')
    expect(paths).toContain('categories.02.name')
    expect(paths).toContain('categories.03.children.1')
  })

  it('validates pinned tags', () => {
    const result = validateConfig({ schemaVersion: 1, pinnedTags: ['CUDA', 'a/b', ''] })
    expect(result.issues.filter((item) => item.severity === 'error')).toHaveLength(2)
    expect(result.config.pinnedTags).toEqual(['CUDA'])
  })

  it('drops invalid extension entries but keeps a working default', () => {
    const result = validateConfig({ schemaVersion: 1, scan: { extensions: ['md', '.markdown'] } })
    expect(result.config.scan.extensions).toEqual(['.markdown'])
    expect(result.issues.some((item) => item.code === ISSUE.configInvalid)).toBe(true)
  })

  it('ignores unknown fields without failing', () => {
    const result = validateConfig({ schemaVersion: 1, somethingNew: true })
    expect(result.issues.filter((item) => item.severity === 'error')).toEqual([])
  })
})

describe('config file io', () => {
  it('returns defaults when the file is missing', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'leafmark-config-'))
    try {
      const state = await readConfigFile(root)
      expect(state.status).toBe('missing')
      expect(state.config.categories['00']?.name).toBe('未分类')
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it('reports a syntax error with a line number', async () => {
    const workspace = await createTempWorkspace(
      {},
      { configText: '{\n  "schemaVersion": 1,\n  broken\n}\n' }
    )
    try {
      const state = await readConfigFile(workspace.root)
      expect(state.status).toBe('invalid')
      if (state.status !== 'invalid') throw new Error('expected an invalid config state')
      expect(state.syntaxError).not.toBeNull()
      expect(state.syntaxError?.line).toBeGreaterThanOrEqual(2)
    } finally {
      await workspace.cleanup()
    }
  })

  it('reports invalid values with their paths', async () => {
    const workspace = await createTempWorkspace({}, { config: { schemaVersion: 1, categories: { '0a': { name: 'x' } } } })
    try {
      const state = await readConfigFile(workspace.root)
      expect(state.status).toBe('invalid')
      expect(state.issues.some((item) => item.path === 'categories.0a')).toBe(true)
    } finally {
      await workspace.cleanup()
    }
  })

  it('preserves unknown fields when writing', async () => {
    const workspace = await createTempWorkspace({})
    try {
      const config = createDefaultConfig()
      await writeConfigFile(workspace.root, config, {
        schemaVersion: 1,
        custom: { keep: true },
        categories: {}
      })
      const raw = JSON.parse(await fs.readFile(path.join(workspace.root, '.leafmark.json'), 'utf8')) as Record<
        string,
        unknown
      >
      expect(raw.custom).toEqual({ keep: true })
      expect(Object.keys(raw.categories as Record<string, unknown>)).toContain('00')

      const state = await readConfigFile(workspace.root)
      expect(state.status).toBe('ok')
    } finally {
      await workspace.cleanup()
    }
  })

  it('leaves no temporary files behind after an atomic write', async () => {
    const workspace = await createTempWorkspace({})
    try {
      await writeConfigFile(workspace.root, createDefaultConfig(), null)
      const entries = await fs.readdir(workspace.root)
      expect(entries.filter((entry) => entry.includes('.tmp'))).toEqual([])
      expect(entries).toContain('.leafmark.json')
    } finally {
      await workspace.cleanup()
    }
  })
})
