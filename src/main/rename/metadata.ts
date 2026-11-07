import type { DocumentMetadata } from '@shared/naming/format'
import { hasValidCode, type ParsedName } from '@shared/naming/parse'
import type { DocumentRecord } from '@shared/model'

export { prepareMetadata, splitIssues } from '@shared/naming/prepare'
export type { MetadataDraft, PreparedMetadata } from '@shared/naming/prepare'

export function metadataFromDocument(document: DocumentRecord): DocumentMetadata | null {
  return metadataFromParsed(document.parsed)
}

export function metadataFromParsed(parsed: ParsedName | null): DocumentMetadata | null {
  if (!parsed || !hasValidCode(parsed)) return null
  return {
    code: parsed.code,
    primaryCode: parsed.primaryCode as string,
    secondaryCode: parsed.secondaryCode as string,
    sequenceCode: parsed.sequenceCode as string,
    tags: [...parsed.tags],
    title: parsed.title ?? ''
  }
}
