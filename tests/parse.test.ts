import { describe, expect, it } from 'vitest'
import { ISSUE } from '@shared/errors'
import { parseFilename } from '@shared/naming/parse'

function issueCodes(parsed: ReturnType<typeof parseFilename>): string[] {
  return parsed.issues.map((item) => item.code)
}

describe('parseFilename', () => {
  it('parses 000000_标题.md', () => {
    const parsed = parseFilename('000000_标题.md')
    expect(parsed.code).toBe('000000')
    expect(parsed.primaryCode).toBe('00')
    expect(parsed.secondaryCode).toBe('00')
    expect(parsed.sequenceCode).toBe('00')
    expect(parsed.tags).toEqual([])
    expect(parsed.title).toBe('标题')
    expect(parsed.issues).toEqual([])
  })

  it('parses 010203_[CUDA]_标题.md', () => {
    const parsed = parseFilename('010203_[CUDA]_标题.md')
    expect(parsed.code).toBe('010203')
    expect(parsed.tags).toEqual(['CUDA'])
    expect(parsed.title).toBe('标题')
    expect(parsed.issues).toEqual([])
  })

  it('accepts tag groups separated by underscores and normalizes them', () => {
    const parsed = parseFilename('010203_[CUDA]_[SpMM]_稀疏矩阵乘优化.md')
    expect(parsed.tags).toEqual(['CUDA', 'SpMM'])
    expect(parsed.title).toBe('稀疏矩阵乘优化')
    expect(parsed.issues).toEqual([])
  })

  it('recognises a managed file whose tag groups are separated by underscores', () => {
    const parsed = parseFilename('000001_[模板元]_[C++]模板元编程特性总结.md')
    expect(parsed.tags).toEqual(['模板元', 'C++'])
    expect(parsed.title).toBe('模板元编程特性总结')
    expect(issueCodes(parsed)).toContain(ISSUE.tagBlockSeparator)
  })

  it('keeps underscores inside the title', () => {
    const parsed = parseFilename('010203_[CUDA][SpMM]_带_下划线的标题.md')
    expect(parsed.tags).toEqual(['CUDA', 'SpMM'])
    expect(parsed.title).toBe('带_下划线的标题')
    expect(parsed.issues).toEqual([])
  })

  it('reports a five digit code', () => {
    const parsed = parseFilename('01020_标题.md')
    expect(parsed.code).toBe('01020')
    expect(issueCodes(parsed)).toContain(ISSUE.codeLength)
    expect(parsed.title).toBe('标题')
  })

  it('accepts an uppercase extension with a normalization warning', () => {
    const parsed = parseFilename('010203_[空标签]_标题.MD')
    expect(parsed.code).toBe('010203')
    expect(parsed.tags).toEqual(['空标签'])
    expect(parsed.title).toBe('标题')
    expect(issueCodes(parsed)).toEqual([ISSUE.extensionNormalized])
    expect(parsed.issues[0]?.severity).toBe('warning')
  })

  it('requires a separator after the tag block but still recovers the title', () => {
    const parsed = parseFilename('010203_[CUDA]标题.md')
    expect(issueCodes(parsed)).toContain(ISSUE.tagBlockSeparator)
    expect(parsed.tags).toEqual(['CUDA'])
    expect(parsed.title).toBe('标题')
  })

  it('recovers tags and title when several tags lack the separator', () => {
    const parsed = parseFilename('010203_[CUDA][SpMM]标题.md')
    expect(issueCodes(parsed)).toContain(ISSUE.tagBlockSeparator)
    expect(parsed.tags).toEqual(['CUDA', 'SpMM'])
    expect(parsed.title).toBe('标题')
  })

  it('rejects an empty tag', () => {
    const parsed = parseFilename('010203_[]_标题.md')
    expect(issueCodes(parsed)).toContain(ISSUE.tagEmpty)
    expect(parsed.tags).toEqual([])
    expect(parsed.title).toBe('标题')
  })

  it('rejects duplicate tags ignoring case', () => {
    const parsed = parseFilename('010203_[CUDA][cuda]_标题.md')
    expect(issueCodes(parsed)).toContain(ISSUE.tagDuplicate)
    expect(parsed.tags).toEqual(['CUDA'])
  })

  it('rejects forbidden characters in tags', () => {
    const parsed = parseFilename('010203_[非法/标签]_标题.md')
    expect(issueCodes(parsed)).toContain(ISSUE.tagForbiddenChar)
    expect(parsed.title).toBe('标题')
  })

  it('rejects an empty title', () => {
    const parsed = parseFilename('010203_.md')
    expect(issueCodes(parsed)).toContain(ISSUE.titleEmpty)
    expect(parsed.title).toBeNull()
  })

  it('treats ordinary names as unmanaged', () => {
    const parsed = parseFilename('普通文档.md')
    expect(parsed.code).toBeNull()
    expect(parsed.tags).toEqual([])
    expect(parsed.title).toBeNull()
    expect(parsed.issues).toEqual([])
  })

  it('does not treat short digit prefixes without underscore as numbering', () => {
    expect(parseFilename('2个想法.md').code).toBeNull()
    expect(parseFilename('2024年终总结.md').code).toBeNull()
  })

  it('treats a long digit run as a malformed code', () => {
    const parsed = parseFilename('0102034_标题.md')
    expect(parsed.code).toBe('0102034')
    expect(issueCodes(parsed)).toContain(ISSUE.codeLength)
  })

  it('requires an underscore directly after the six digit code', () => {
    const parsed = parseFilename('010203abc.md')
    expect(parsed.code).toBe('010203')
    expect(issueCodes(parsed)).toContain(ISSUE.codeMissingSeparator)
  })

  it('accepts additional extensions only when configured', () => {
    const configured = parseFilename('010100_标题.markdown', { extensions: ['.md', '.markdown'] })
    expect(configured.extension).toBe('.markdown')
    expect(issueCodes(configured)).toEqual([ISSUE.extensionNormalized])

    const rejected = parseFilename('010100_标题.markdown')
    expect(issueCodes(rejected)).toContain(ISSUE.extension)
  })

  it('reports a missing extension', () => {
    const parsed = parseFilename('010203_标题')
    expect(issueCodes(parsed)).toContain(ISSUE.extension)
    expect(parsed.title).toBe('标题')
  })

  it('treats a leading bracket as a tag block instead of a title', () => {
    const parsed = parseFilename('010203_[标签]_标题.md')
    expect(parsed.tags).toEqual(['标签'])
    expect(parsed.title).toBe('标题')
    expect(issueCodes(parsed)).not.toContain(ISSUE.titleLeadingBracket)
  })

  it('reports an unclosed tag block', () => {
    const parsed = parseFilename('010203_[不是标签.md')
    expect(issueCodes(parsed)).toContain(ISSUE.tagUnclosed)
    expect(parsed.tags).toEqual([])
  })

  it('normalizes decomposed Unicode to NFC', () => {
    const parsed = parseFilename('010203_[Cafe\u0301]_标题.md')
    expect(parsed.tags).toEqual(['Café'])
    expect(parsed.issues).toEqual([])
  })

  it('rejects filenames above the UTF-8 byte budget', () => {
    const parsed = parseFilename(`010203_${'标'.repeat(66)}.md`)
    expect(issueCodes(parsed)).toContain(ISSUE.nameTooLong)
  })

  it('accepts exactly the byte budget', () => {
    const title = '标'.repeat(63)
    const filename = `010203_${title}.md`
    expect(new TextEncoder().encode(filename).length).toBeLessThanOrEqual(200)
    expect(issueCodes(parseFilename(filename))).not.toContain(ISSUE.nameTooLong)
  })
})
