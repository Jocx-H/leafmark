import { ISSUE, issue, type Issue } from '../errors'
import { CODE_LENGTH, DEFAULT_EXTENSION, PART_LENGTH } from './constants'
import { normalizeNfc, validateFilenameLength, validateTag, validateTitle } from './validate'

export interface ParsedName {
  /** The six digit code, or a longer/shorter digit run when the filename is malformed. */
  code: string | null
  primaryCode: string | null
  secondaryCode: string | null
  sequenceCode: string | null
  tags: string[]
  title: string | null
  /** Extension exactly as found, e.g. `.md` or `.MD`. */
  extension: string
  /** Filename without its extension. */
  stem: string
  issues: Issue[]
}

const DIGITS_PREFIX = /^[0-9]+/

/**
 * Parses a Markdown filename into code, tags and title.
 *
 * The parser is intentionally step based instead of one large regex so that every
 * failure carries a precise issue code and message.
 *
 * A filename only counts as "attempting the convention" when it starts with a digit
 * run followed by `_` (at least five digits) or with at least six digits. This keeps
 * ordinary names such as `2个想法.md` or `2024年终总结.md` in the unmanaged state.
 */
export interface ParseOptions {
  /** Extensions accepted as Markdown files. Defaults to `.md`. */
  extensions?: readonly string[]
}

export function parseFilename(input: string, options: ParseOptions = {}): ParsedName {
  const allowedExtensions = (options.extensions && options.extensions.length > 0
    ? options.extensions
    : [DEFAULT_EXTENSION]
  ).map((extension) => extension.toLowerCase())

  const filename = normalizeNfc(input)
  const dot = filename.lastIndexOf('.')
  const extension = dot > 0 ? filename.slice(dot) : ''
  const stem = dot > 0 ? filename.slice(0, dot) : filename

  const issues: Issue[] = []
  const parsed: ParsedName = {
    code: null,
    primaryCode: null,
    secondaryCode: null,
    sequenceCode: null,
    tags: [],
    title: null,
    extension,
    stem,
    issues
  }

  if (extension.length === 0) {
    issues.push(issue(ISSUE.extension, `文件名缺少 ${DEFAULT_EXTENSION} 扩展名`, 'error', 'extension'))
  } else if (!allowedExtensions.includes(extension.toLowerCase())) {
    issues.push(
      issue(
        ISSUE.extension,
        `扩展名必须为 ${allowedExtensions.join(' / ')}（当前为 “${extension}”）`,
        'error',
        'extension'
      )
    )
  } else if (extension !== DEFAULT_EXTENSION) {
    issues.push(
      issue(
        ISSUE.extensionNormalized,
        `扩展名 ${extension} 会在重命名时规范化为 ${DEFAULT_EXTENSION}`,
        'warning',
        'extension'
      )
    )
  }

  const digitsMatch = DIGITS_PREFIX.exec(stem)
  if (digitsMatch === null) return parsed

  const digits = digitsMatch[0]
  const remainder = stem.slice(digits.length)
  const attemptsConvention =
    (remainder.startsWith('_') && digits.length >= 5) || digits.length >= CODE_LENGTH
  if (!attemptsConvention) return parsed

  parsed.code = digits
  if (digits.length !== CODE_LENGTH) {
    issues.push(
      issue(ISSUE.codeLength, `编号必须是 ${CODE_LENGTH} 位数字（当前 ${digits.length} 位）`, 'error', 'code')
    )
  } else {
    parsed.primaryCode = digits.slice(0, PART_LENGTH)
    parsed.secondaryCode = digits.slice(PART_LENGTH, PART_LENGTH * 2)
    parsed.sequenceCode = digits.slice(PART_LENGTH * 2)
  }

  if (!remainder.startsWith('_')) {
    issues.push(issue(ISSUE.codeMissingSeparator, '编号后必须紧跟一个下划线 “_”', 'error', 'code'))
    return parsed
  }

  let cursor = remainder.slice(1)
  let titleRaw: string | null = null

  if (cursor.startsWith('[')) {
    const collected: string[] = []
    let unclosed = false
    let separatorFound = false

    while (cursor.startsWith('[')) {
      const close = cursor.indexOf(']')
      if (close === -1) {
        issues.push(issue(ISSUE.tagUnclosed, '标签缺少右方括号 “]”', 'error', 'tags'))
        unclosed = true
        break
      }

      const validated = validateTag(cursor.slice(1, close))
      if (validated.value.length > 0) collected.push(validated.value)
      issues.push(...validated.issues)

      cursor = cursor.slice(close + 1)

      if (cursor.startsWith('[')) continue

      if (cursor.startsWith('_')) {
        const afterSeparator = cursor.slice(1)
        // Lenient parsing: existing files may separate tag groups with `_`,
        // e.g. `000001_[模板元]_[C++]标题.md`. Titles may not start with `[`,
        // so a bracket group after the separator is always another tag.
        if (afterSeparator.startsWith('[')) {
          cursor = afterSeparator
          continue
        }
        cursor = afterSeparator
        separatorFound = true
      } else {
        issues.push(issue(ISSUE.tagBlockSeparator, '标签块后必须紧跟一个下划线 “_”（保存时会生成规范化文件名）', 'error', 'tags'))
      }
      break
    }

    const seen = new Set<string>()
    const deduped: string[] = []
    for (const tag of collected) {
      const key = tag.toLowerCase()
      if (seen.has(key)) {
        issues.push(issue(ISSUE.tagDuplicate, `同一文件内标签重复：“${tag}”`, 'error', 'tags'))
        continue
      }
      seen.add(key)
      deduped.push(tag)
    }
    parsed.tags = deduped

    // Recover the title even when the `_` separator is missing so the editor can
    // prefill a ready-to-fix name; only an unclosed tag block leaves it unknown.
    if (!unclosed && (separatorFound || cursor.length > 0)) {
      titleRaw = cursor
    }
  } else {
    titleRaw = cursor
  }

  if (titleRaw !== null) {
    const validatedTitle = validateTitle(titleRaw)
    parsed.title = validatedTitle.value.length > 0 ? validatedTitle.value : null
    issues.push(...validatedTitle.issues)
  }

  const lengthIssue = validateFilenameLength(filename)
  if (lengthIssue !== null) issues.push(lengthIssue)

  return parsed
}

/** True when the parsed code is a well formed six digit code, regardless of other issues. */
export function hasValidCode(parsed: ParsedName | null): parsed is ParsedName & { code: string } {
  if (parsed === null || parsed.code === null) return false
  return parsed.code.length === CODE_LENGTH && /^[0-9]{6}$/.test(parsed.code)
}

export function displayNameFor(parsed: ParsedName | null, filename: string): string {
  if (parsed?.title) return parsed.title
  return parsed?.stem ?? filename.replace(/\.md$/i, '')
}
