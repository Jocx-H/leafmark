import { ISSUE, issue, type Issue } from '../errors'
import {
  CODE_LENGTH,
  MAX_FILENAME_BYTES,
  MAX_TAG_CHARS,
  PART_LENGTH,
  TAG_FORBIDDEN_CHARS,
  TITLE_FORBIDDEN_CHARS,
  hasControlCharacter
} from './constants'

export function normalizeNfc(value: string): string {
  return value.normalize('NFC')
}

export function charCount(value: string): number {
  return Array.from(value).length
}

const encoder = new TextEncoder()

export function utf8ByteLength(value: string): number {
  return encoder.encode(value).length
}

export function isAsciiDigits(value: string): boolean {
  if (value.length === 0) return false
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code < 0x30 || code > 0x39) return false
  }
  return true
}

function findForbiddenChar(value: string, forbidden: Set<string> | null): string | null {
  for (const char of Array.from(value)) {
    if (hasControlCharacter(char)) return char
    if (forbidden?.has(char)) return char
  }
  return null
}

function describeChar(char: string): string {
  const code = char.codePointAt(0) ?? 0
  if (code < 0x20 || code === 0x7f) return `U+${code.toString(16).toUpperCase().padStart(4, '0')}`
  return char
}

export interface ValidatedTag {
  value: string
  issues: Issue[]
}

/** Validates and normalizes a single tag. Empty input is reported as an error. */
export function validateTag(raw: string): ValidatedTag {
  const value = normalizeNfc(raw).trim()
  const issues: Issue[] = []

  if (value.length === 0) {
    issues.push(issue(ISSUE.tagEmpty, '标签不能为空', 'error', 'tags'))
    return { value, issues }
  }

  const forbidden = findForbiddenChar(value, TAG_FORBIDDEN_CHARS)
  if (forbidden !== null) {
    issues.push(
      issue(ISSUE.tagForbiddenChar, `标签包含不允许的字符 “${describeChar(forbidden)}”`, 'error', 'tags')
    )
  }

  if (value.endsWith('.')) {
    issues.push(issue(ISSUE.tagTrailing, '标签不能以句点结尾', 'error', 'tags'))
  }

  if (charCount(value) > MAX_TAG_CHARS) {
    issues.push(
      issue(
        ISSUE.tagTooLong,
        `标签超过 ${MAX_TAG_CHARS} 个字符（当前 ${charCount(value)} 个），建议缩短`,
        'warning',
        'tags'
      )
    )
  }

  return { value, issues }
}

export interface ValidatedTitle {
  value: string
  issues: Issue[]
}

/**
 * Validates and normalizes a document title.
 * `hasTags` decides whether a leading `[` is ambiguous.
 */
export function validateTitle(raw: string, hasTags: boolean): ValidatedTitle {
  const value = normalizeNfc(raw).trim()
  const issues: Issue[] = []

  if (value.length === 0) {
    issues.push(issue(ISSUE.titleEmpty, '标题不能为空', 'error', 'title'))
    return { value, issues }
  }

  const forbidden = findForbiddenChar(value, TITLE_FORBIDDEN_CHARS)
  if (forbidden !== null) {
    issues.push(
      issue(ISSUE.titleForbiddenChar, `标题包含不允许的字符 “${describeChar(forbidden)}”`, 'error', 'title')
    )
  }

  if (value.endsWith('.')) {
    issues.push(issue(ISSUE.titleTrailing, '标题不能以句点结尾', 'error', 'title'))
  }

  if (!hasTags && value.startsWith('[')) {
    issues.push(
      issue(ISSUE.titleLeadingBracket, '无标签标题不能以 “[” 开头，请改用标签或调整标题', 'error', 'title')
    )
  }

  return { value, issues }
}

/** Checks that a six digit code is exactly six ASCII digits. */
export function validateCode(code: string): Issue[] {
  if (code.length !== CODE_LENGTH) {
    return [
      issue(ISSUE.codeLength, `编号必须是 ${CODE_LENGTH} 位数字（当前 ${code.length} 位）`, 'error', 'code')
    ]
  }
  if (!isAsciiDigits(code)) {
    return [issue(ISSUE.codeNotDigits, '编号只能包含 0-9 的 ASCII 数字', 'error', 'code')]
  }
  return []
}

/** Checks one two digit code part (primary, secondary or sequence). */
export function validateCodePart(value: string, field: 'code' | 'tags' = 'code'): Issue[] {
  if (value.length !== PART_LENGTH) {
    return [
      issue(ISSUE.codeLength, `编号分段必须是 ${PART_LENGTH} 位数字（当前 ${value.length} 位）`, 'error', field)
    ]
  }
  if (!isAsciiDigits(value)) {
    return [issue(ISSUE.codeNotDigits, '编号分段只能包含 0-9 的 ASCII 数字', 'error', field)]
  }
  return []
}

/** Checks the UTF-8 byte budget of the final filename, including its extension. */
export function validateFilenameLength(filename: string): Issue | null {
  const bytes = utf8ByteLength(filename)
  if (bytes <= MAX_FILENAME_BYTES) return null
  return issue(
    ISSUE.nameTooLong,
    `文件名长度为 ${bytes} 字节，超过 ${MAX_FILENAME_BYTES} 字节上限（超 ${bytes - MAX_FILENAME_BYTES} 字节）`,
    'error',
    'filename'
  )
}

/** Remaining byte budget for the title, used by the editor to show live feedback. */
export function remainingTitleBytes(filenameWithoutTitle: string): number {
  return MAX_FILENAME_BYTES - utf8ByteLength(filenameWithoutTitle)
}
