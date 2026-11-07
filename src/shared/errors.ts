/**
 * Stable issue codes shared by the main process, the renderer and the tests.
 * Never reuse a code for a different meaning: the renderer and the docs refer to them.
 */

export type IssueSeverity = 'error' | 'warning'

export type IssueField = 'filename' | 'extension' | 'code' | 'tags' | 'title' | 'path'

export interface Issue {
  code: IssueCode
  severity: IssueSeverity
  message: string
  field?: IssueField
  /** JSON pointer style location, used by configuration validation. */
  path?: string
}

export const ISSUE = {
  /** The file extension is not `.md`. */
  extension: 'E_EXTENSION',
  /** The numeric code is not exactly six characters long. */
  codeLength: 'E_CODE_LENGTH',
  /** The numeric code contains non ASCII digits. */
  codeNotDigits: 'E_CODE_NOT_DIGITS',
  /** A six digit code is not followed by the `_` separator. */
  codeMissingSeparator: 'E_CODE_MISSING_SEPARATOR',
  /** A tag is not closed with `]`. */
  tagUnclosed: 'E_TAG_UNCLOSED',
  /** A tag is empty, e.g. `[]`. */
  tagEmpty: 'E_TAG_EMPTY',
  /** A tag contains a character that is not allowed. */
  tagForbiddenChar: 'E_TAG_FORBIDDEN_CHAR',
  /** A tag ends with a space or a period. */
  tagTrailing: 'E_TAG_TRAILING',
  /** The same tag is used twice in one filename (case insensitive). */
  tagDuplicate: 'E_TAG_DUPLICATE',
  /** A tag is longer than the recommended length (warning only). */
  tagTooLong: 'E_TAG_TOO_LONG',
  /** The tag block is not followed by the `_` separator. */
  tagBlockSeparator: 'E_TAG_BLOCK_SEPARATOR',
  /** A document title is empty. */
  titleEmpty: 'E_TITLE_EMPTY',
  /** A title contains a character that is not allowed. */
  titleForbiddenChar: 'E_TITLE_FORBIDDEN_CHAR',
  /** A title ends with a space or a period. */
  titleTrailing: 'E_TITLE_TRAILING',
  /** A title without tags starts with `[`, which is ambiguous. */
  titleLeadingBracket: 'E_TITLE_LEADING_BRACKET',
  /** The final filename exceeds the UTF-8 byte budget. */
  nameTooLong: 'E_NAME_TOO_LONG',
  /** Two or more files share the same six digit code. */
  codeConflict: 'E_CODE_CONFLICT',
  /** The requested sequence number is already used by another document. */
  sequenceTaken: 'E_SEQUENCE_TAKEN',
  /** The target file already exists. */
  targetExists: 'E_TARGET_EXISTS',
  /** The directory entry collides case-insensitively with another entry. */
  targetCaseConflict: 'E_TARGET_CASE_CONFLICT',
  /** The source document no longer exists. */
  sourceMissing: 'E_SOURCE_MISSING',
  /** The source document changed between preview and commit. */
  sourceChanged: 'E_SOURCE_CHANGED',
  /** The rename plan expired or was already consumed. */
  planExpired: 'E_PLAN_EXPIRED',
  /** The rename plan id is unknown. */
  planUnknown: 'E_PLAN_UNKNOWN',
  /** The plan does not change anything. */
  planNoChange: 'E_PLAN_NO_CHANGE',
  /** The source document is a symbolic link. */
  symlink: 'E_SYMLINK',
  /** The requested path escapes the workspace. */
  workspaceBoundary: 'E_WORKSPACE_BOUNDARY',
  /** The workspace configuration cannot be written in its current state. */
  configReadonly: 'E_CONFIG_READONLY',
  /** The workspace configuration is invalid. */
  configInvalid: 'E_CONFIG_INVALID',
  /** Writing the workspace configuration failed. */
  configWriteFailed: 'E_CONFIG_WRITE_FAILED',
  /** The requested target category is already full. */
  categoryFull: 'E_CATEGORY_FULL',
  /** The requested target category needs a manually chosen sequence number. */
  sequenceManual: 'E_SEQUENCE_MANUAL',
  /** The workspace directory cannot be read. */
  workspaceUnreadable: 'E_WORKSPACE_UNREADABLE',
  /** A filesystem operation failed. */
  ioFailed: 'E_IO_FAILED',
  /** The request payload did not match the expected shape. */
  invalidInput: 'E_INVALID_INPUT',
  /** Renaming may break links from other documents or external tools (warning only). */
  linkRisk: 'W_LINK_RISK',
  /** The extension is valid but will be normalized to lowercase `.md` (warning only). */
  extensionNormalized: 'W_EXTENSION_NORMALIZED',
  /** A category code has no display name configured. */
  categoryUnnamed: 'W_CATEGORY_UNNAMED',
  /** Unknown configuration fields are preserved but ignored. */
  configUnknownField: 'W_CONFIG_UNKNOWN_FIELD'
} as const

export type IssueCode = (typeof ISSUE)[keyof typeof ISSUE]

export function issue(
  code: IssueCode,
  message: string,
  severity: IssueSeverity = 'error',
  field?: IssueField,
  path?: string
): Issue {
  const result: Issue = { code, severity, message }
  if (field !== undefined) result.field = field
  if (path !== undefined) result.path = path
  return result
}

export function hasErrors(issues: readonly Issue[]): boolean {
  return issues.some((item) => item.severity === 'error')
}

/** Application level error with a stable code, safe to send to the renderer. */
export class LeafmarkError extends Error {
  readonly code: IssueCode
  readonly detail?: string

  constructor(code: IssueCode, message: string, detail?: string) {
    super(message)
    this.name = 'LeafmarkError'
    this.code = code
    this.detail = detail
  }
}

export function toLeafmarkError(error: unknown, fallbackMessage: string): LeafmarkError {
  if (error instanceof LeafmarkError) return error
  const message = error instanceof Error ? error.message : fallbackMessage
  return new LeafmarkError(ISSUE.ioFailed, fallbackMessage, message)
}
