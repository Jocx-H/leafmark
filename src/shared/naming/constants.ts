export const CODE_LENGTH = 6
export const PART_LENGTH = 2
export const MAX_FILENAME_BYTES = 200
export const MAX_TAG_CHARS = 20
export const DEFAULT_EXTENSION = '.md'

/** Characters that are illegal in a file name on Windows and are rejected everywhere. */
export const ILLEGAL_FILENAME_CHARS = ['<', '>', ':', '"', '/', '\\', '|', '?', '*']

/** Characters that may never appear inside a tag. */
export const TAG_FORBIDDEN_CHARS = new Set([...ILLEGAL_FILENAME_CHARS, '[', ']'])

/** Characters that may never appear inside a title. */
export const TITLE_FORBIDDEN_CHARS = new Set(ILLEGAL_FILENAME_CHARS)

const CONTROL_CHARACTERS = /\p{Cc}/u

export function hasControlCharacter(value: string): boolean {
  return CONTROL_CHARACTERS.test(value)
}

export function isForbiddenFilenameChar(char: string): boolean {
  return ILLEGAL_FILENAME_CHARS.includes(char) || hasControlCharacter(char)
}
