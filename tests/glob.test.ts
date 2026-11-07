import { describe, expect, it } from 'vitest'
import { createIgnoreMatcher, globToRegExp } from '@shared/glob'

describe('globToRegExp', () => {
  it('matches a trailing /** against the directory itself', () => {
    const regexp = globToRegExp('.git/**')
    expect(regexp.test('.git/config')).toBe(true)
    expect(regexp.test('.git/')).toBe(true)
    expect(regexp.test('src/.gitignore')).toBe(false)
  })

  it('matches nested paths with **/', () => {
    const regexp = globToRegExp('**/node_modules/**')
    expect(regexp.test('a/node_modules/b.md')).toBe(true)
    expect(regexp.test('node_modules/b.md')).toBe(true)
  })

  it('keeps * inside one path segment', () => {
    const regexp = globToRegExp('*.tmp')
    expect(regexp.test('a.tmp')).toBe(true)
    expect(regexp.test('dir/a.tmp')).toBe(false)
  })
})

describe('createIgnoreMatcher', () => {
  const matcher = createIgnoreMatcher(['.git/**', 'node_modules/**', 'attachments/**', '*.tmp'])

  it('ignores default directories and their children', () => {
    expect(matcher('.git', true)).toBe(true)
    expect(matcher('.git/objects', true)).toBe(true)
    expect(matcher('attachments', true)).toBe(true)
    expect(matcher('notes/attachments', true)).toBe(false)
    expect(matcher('node_modules/pkg/readme.md', false)).toBe(true)
  })

  it('matches case insensitively', () => {
    expect(matcher('NODE_MODULES/pkg/readme.md', false)).toBe(true)
  })

  it('does not ignore unrelated paths', () => {
    expect(matcher('notes/010100_a.md', false)).toBe(false)
    expect(matcher('src/git-notes.md', false)).toBe(false)
  })

  it('normalizes windows style separators', () => {
    expect(matcher('node_modules\\pkg\\readme.md', false)).toBe(true)
  })

  it('exposes the configured patterns', () => {
    expect(matcher.patterns).toEqual(['.git/**', 'node_modules/**', 'attachments/**', '*.tmp'])
  })
})
