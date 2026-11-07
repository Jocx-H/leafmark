import { CODE_LENGTH, DEFAULT_EXTENSION, PART_LENGTH } from './constants'
import { isAsciiDigits } from './validate'

export interface CodeParts {
  primaryCode: string
  secondaryCode: string
  sequenceCode: string
}

export interface DocumentMetadata extends CodeParts {
  code: string
  tags: string[]
  title: string
}

export interface FilenameParts {
  code: string
  tags: string[]
  title: string
}

export function joinCode(primaryCode: string, secondaryCode: string, sequenceCode: string): string {
  return `${primaryCode}${secondaryCode}${sequenceCode}`
}

export function splitCode(code: string): CodeParts | null {
  if (code.length !== CODE_LENGTH || !isAsciiDigits(code)) return null
  return {
    primaryCode: code.slice(0, PART_LENGTH),
    secondaryCode: code.slice(PART_LENGTH, PART_LENGTH * 2),
    sequenceCode: code.slice(PART_LENGTH * 2)
  }
}

/** Builds the filename stem (without extension) from its parts. */
export function formatStem(parts: FilenameParts): string {
  const tags = parts.tags.map((tag) => `[${tag}]`).join('')
  const prefix = tags.length > 0 ? `${tags}_` : ''
  return `${parts.code}_${prefix}${parts.title}`
}

/** Builds the complete filename. The extension is always lowercase `.md`. */
export function formatFilename(parts: FilenameParts, extension: string = DEFAULT_EXTENSION): string {
  return `${formatStem(parts)}${extension}`
}

export function filenameFromMetadata(metadata: DocumentMetadata): string {
  return formatFilename({
    code: metadata.code,
    tags: metadata.tags,
    title: metadata.title
  })
}
