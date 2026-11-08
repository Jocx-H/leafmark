import { describe, expect, it } from 'vitest'
import { extractLeadingTags } from '@shared/naming/tag-extract'

describe('extractLeadingTags', () => {
  it('splits a single leading tag from an adopted file name', () => {
    const result = extractLeadingTags('[GPU]使用CUDAGraph')
    expect(result.extracted).toBe(true)
    expect(result.tags).toEqual(['GPU'])
    expect(result.title).toBe('使用CUDAGraph')
  })

  it('splits consecutive tag groups', () => {
    const result = extractLeadingTags('[GPU][CUDA]稀疏矩阵')
    expect(result.tags).toEqual(['GPU', 'CUDA'])
    expect(result.title).toBe('稀疏矩阵')
  })

  it('allows whitespace between tag groups', () => {
    const result = extractLeadingTags('[GPU] [CUDA] 标题')
    expect(result.tags).toEqual(['GPU', 'CUDA'])
    expect(result.title).toBe('标题')
  })

  it('deduplicates tags ignoring case', () => {
    const result = extractLeadingTags('[cuda][CUDA]标题')
    expect(result.tags).toEqual(['cuda'])
    expect(result.title).toBe('标题')
  })

  it('keeps the original text when a tag is invalid', () => {
    const result = extractLeadingTags('[a/b]标题')
    expect(result.extracted).toBe(false)
    expect(result.tags).toEqual([])
    expect(result.title).toBe('[a/b]标题')
  })

  it('keeps the original text when a tag is unclosed', () => {
    const result = extractLeadingTags('[GPU标题')
    expect(result.extracted).toBe(false)
    expect(result.title).toBe('[GPU标题')
  })

  it('keeps the original text when the first tag is empty', () => {
    const result = extractLeadingTags('[]标题')
    expect(result.extracted).toBe(false)
    expect(result.title).toBe('[]标题')
  })

  it('leaves ordinary titles untouched', () => {
    const result = extractLeadingTags('普通标题')
    expect(result.extracted).toBe(false)
    expect(result.tags).toEqual([])
    expect(result.title).toBe('普通标题')
  })

  it('handles a title that only contains tags', () => {
    const result = extractLeadingTags('[GPU]')
    expect(result.extracted).toBe(true)
    expect(result.tags).toEqual(['GPU'])
    expect(result.title).toBe('')
  })

  it('normalizes decomposed Unicode in tags', () => {
    const result = extractLeadingTags('[Cafe\u0301]标题')
    expect(result.tags).toEqual(['Café'])
    expect(result.title).toBe('标题')
  })

  it('trims surrounding whitespace', () => {
    const result = extractLeadingTags('  [GPU] 使用  ')
    expect(result.tags).toEqual(['GPU'])
    expect(result.title).toBe('使用')
  })
})
