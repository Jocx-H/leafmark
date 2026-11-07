import { describe, expect, it } from 'vitest'
import { ISSUE } from '@shared/errors'
import {
  remainingTitleBytes,
  utf8ByteLength,
  validateCodePart,
  validateFilenameLength,
  validateTag,
  validateTitle
} from '@shared/naming/validate'

describe('validateTag', () => {
  it('trims and normalizes a tag', () => {
    const result = validateTag('  Cafe\u0301  ')
    expect(result.value).toBe('Café')
    expect(result.issues).toEqual([])
  })

  it('rejects an empty tag', () => {
    expect(validateTag('   ').issues.map((item) => item.code)).toContain(ISSUE.tagEmpty)
  })

  it('rejects forbidden characters', () => {
    for (const tag of ['a/b', 'a[b', 'a]b', 'a:b', 'a?b', 'a*b', 'a|b', 'a"b', 'a<b']) {
      const codes = validateTag(tag).issues.map((item) => item.code)
      expect(codes, tag).toContain(ISSUE.tagForbiddenChar)
    }
  })

  it('rejects a trailing period', () => {
    expect(validateTag('CUDA.').issues.map((item) => item.code)).toContain(ISSUE.tagTrailing)
  })

  it('warns about long tags without blocking them', () => {
    const result = validateTag('x'.repeat(21))
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0]?.code).toBe(ISSUE.tagTooLong)
    expect(result.issues[0]?.severity).toBe('warning')
  })

  it('rejects control characters', () => {
    expect(validateTag('a\u0000b').issues.map((item) => item.code)).toContain(ISSUE.tagForbiddenChar)
  })
})

describe('validateTitle', () => {
  it('trims a title', () => {
    expect(validateTitle('  标题  ', false).value).toBe('标题')
  })

  it('rejects an empty title', () => {
    expect(validateTitle('  ', false).issues.map((item) => item.code)).toContain(ISSUE.titleEmpty)
  })

  it('rejects forbidden characters', () => {
    expect(validateTitle('a/b', false).issues.map((item) => item.code)).toContain(ISSUE.titleForbiddenChar)
    expect(validateTitle('a|b', false).issues.map((item) => item.code)).toContain(ISSUE.titleForbiddenChar)
  })

  it('rejects a trailing period', () => {
    expect(validateTitle('标题.', false).issues.map((item) => item.code)).toContain(ISSUE.titleTrailing)
  })

  it('rejects a leading bracket only when the document has no tags', () => {
    expect(validateTitle('[标题]', false).issues.map((item) => item.code)).toContain(ISSUE.titleLeadingBracket)
    expect(validateTitle('[标题]', true).issues).toEqual([])
  })

  it('allows brackets inside the title', () => {
    expect(validateTitle('标题[补充]', true).issues).toEqual([])
  })
})

describe('validateCodePart', () => {
  it('requires two ASCII digits', () => {
    expect(validateCodePart('01')).toEqual([])
    expect(validateCodePart('1').map((item) => item.code)).toContain(ISSUE.codeLength)
    expect(validateCodePart('０１').map((item) => item.code)).toContain(ISSUE.codeNotDigits)
  })
})

describe('filename length', () => {
  it('counts UTF-8 bytes', () => {
    expect(utf8ByteLength('标题.md')).toBe(9)
  })

  it('reports an over budget name with concrete numbers', () => {
    const filename = `010203_${'标'.repeat(70)}.md`
    const issue = validateFilenameLength(filename)
    expect(issue?.code).toBe(ISSUE.nameTooLong)
    expect(issue?.message).toContain(String(utf8ByteLength(filename)))
  })

  it('computes the remaining title budget', () => {
    expect(remainingTitleBytes('010203_.md')).toBe(190)
  })
})
