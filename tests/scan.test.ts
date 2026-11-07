import { promises as fs } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createDefaultConfig } from '@shared/config/types'
import { scanWorkspace } from '../src/main/scanner/scan'
import { createTempWorkspace } from './helpers'

describe('scanWorkspace', () => {
  it('parses statuses and detects conflicts across directories', async () => {
    const workspace = await createTempWorkspace({
      '010100_a.md': 'a',
      'sub/010100_b.md': 'b',
      '010200_[CUDA]_c.md': 'c',
      '01030_坏编号.md': 'd',
      '普通草稿.md': 'e',
      '.git/hidden.md': 'f',
      'node_modules/pkg/readme.md': 'g',
      'attachments/image-note.md': 'h',
      'notes.txt': 'i'
    })
    try {
      const result = await scanWorkspace(workspace.root, createDefaultConfig())
      const byName = new Map(result.documents.map((document) => [document.filename, document]))

      expect(byName.get('010100_a.md')?.status).toBe('conflict')
      expect(byName.get('010100_b.md')?.status).toBe('conflict')
      expect(byName.get('010100_a.md')?.conflictsWith).toEqual(['sub/010100_b.md'])
      expect(byName.get('010200_[CUDA]_c.md')?.status).toBe('valid')
      expect(byName.get('01030_坏编号.md')?.status).toBe('invalid')
      expect(byName.get('普通草稿.md')?.status).toBe('unmanaged')
      expect(byName.has('hidden.md')).toBe(false)
      expect(byName.has('readme.md')).toBe(false)
      expect(byName.has('image-note.md')).toBe(false)
      expect(byName.has('notes.txt')).toBe(false)
      expect(result.documents).toHaveLength(5)
    } finally {
      await workspace.cleanup()
    }
  })

  it('sorts documents by code', async () => {
    const workspace = await createTempWorkspace({
      '020100_b.md': 'b',
      '010100_a.md': 'a',
      '普通.md': 'c'
    })
    try {
      const result = await scanWorkspace(workspace.root, createDefaultConfig())
      expect(result.documents.map((document) => document.filename)).toEqual([
        '010100_a.md',
        '020100_b.md',
        '普通.md'
      ])
    } finally {
      await workspace.cleanup()
    }
  })

  it('honours recursive=false', async () => {
    const workspace = await createTempWorkspace({
      '010100_root.md': 'a',
      'sub/010200_nested.md': 'b'
    })
    try {
      const config = createDefaultConfig()
      config.scan.recursive = false
      const result = await scanWorkspace(workspace.root, config)
      expect(result.documents.map((document) => document.filename)).toEqual(['010100_root.md'])
    } finally {
      await workspace.cleanup()
    }
  })

  it('scans case insensitive extensions but reports a normalization warning', async () => {
    const workspace = await createTempWorkspace({ '010100_标题.MD': 'x' })
    try {
      const result = await scanWorkspace(workspace.root, createDefaultConfig())
      expect(result.documents).toHaveLength(1)
      expect(result.documents[0]?.status).toBe('valid')
      expect(result.documents[0]?.parsed?.extension).toBe('.MD')
    } finally {
      await workspace.cleanup()
    }
  })

  it('scans additional configured extensions', async () => {
    const workspace = await createTempWorkspace({ '010100_标题.markdown': 'x' })
    try {
      const config = createDefaultConfig()
      config.scan.extensions = ['.md', '.markdown']
      const result = await scanWorkspace(workspace.root, config)
      expect(result.documents).toHaveLength(1)
      expect(result.documents[0]?.status).toBe('valid')
      expect(result.documents[0]?.parsed?.extension).toBe('.markdown')
    } finally {
      await workspace.cleanup()
    }
  })

  it('skips symlinked directories by default', async () => {
    const workspace = await createTempWorkspace({ 'real/010100_a.md': 'a' })
    try {
      let linked = true
      try {
        await fs.symlink(workspace.root, `${workspace.root}/loop`, 'dir')
      } catch {
        linked = false
      }
      if (!linked) return
      const result = await scanWorkspace(workspace.root, createDefaultConfig())
      expect(result.documents.map((document) => document.filename)).toEqual(['010100_a.md'])
      expect(result.problems).toEqual([])
    } finally {
      await workspace.cleanup()
    }
  })

  it('builds a deterministic tag index', async () => {
    const workspace = await createTempWorkspace({
      '010100_[CUDA]_a.md': 'a',
      '010200_[cuda]_b.md': 'b',
      '010300_[SpMM]_c.md': 'c'
    })
    try {
      const result = await scanWorkspace(workspace.root, createDefaultConfig())
      const cuda = result.tags.find((tag) => tag.key === 'cuda')
      expect(cuda?.display).toBe('CUDA')
      expect(cuda?.count).toBe(2)
    } finally {
      await workspace.cleanup()
    }
  })

  it('handles a Chinese workspace path with spaces', async () => {
    const workspace = await createTempWorkspace({ '我的 笔记/010100_标题.md': 'x' })
    try {
      const result = await scanWorkspace(workspace.root, createDefaultConfig())
      expect(result.documents[0]?.relativePath).toBe('我的 笔记/010100_标题.md')
    } finally {
      await workspace.cleanup()
    }
  })
})
