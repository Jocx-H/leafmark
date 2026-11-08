import { ISSUE, issue, type Issue } from '../errors'
import { formatFilename, type DocumentMetadata } from './format'
import { validateCodePart, validateFilenameLength, validateTag, validateTitle } from './validate'

export interface MetadataDraft {
  primaryCode: string
  secondaryCode: string
  sequenceCode: string
  tags: string[]
  title: string
}

export interface PreparedMetadata {
  metadata: DocumentMetadata
  filename: string
  issues: Issue[]
}

/**
 * Normalizes and validates a naming draft. The returned metadata mirrors what was
 * entered so the editor can always preview the target name, even while issues remain.
 */
export function prepareMetadata(draft: MetadataDraft): PreparedMetadata {
  const issues: Issue[] = []

  issues.push(...validateCodePart(draft.primaryCode))
  issues.push(...validateCodePart(draft.secondaryCode))
  issues.push(...validateCodePart(draft.sequenceCode))

  const tags: string[] = []
  const seen = new Set<string>()
  for (const raw of draft.tags) {
    const validated = validateTag(String(raw))
    issues.push(...validated.issues)
    if (validated.value.length === 0) continue
    const key = validated.value.toLowerCase()
    if (seen.has(key)) {
      issues.push(issue(ISSUE.tagDuplicate, `同一文件内标签重复：“${validated.value}”`, 'error', 'tags'))
      continue
    }
    seen.add(key)
    tags.push(validated.value)
  }

  const title = validateTitle(String(draft.title ?? ''))
  issues.push(...title.issues)

  const code = `${draft.primaryCode}${draft.secondaryCode}${draft.sequenceCode}`
  const metadata: DocumentMetadata = {
    code,
    primaryCode: draft.primaryCode,
    secondaryCode: draft.secondaryCode,
    sequenceCode: draft.sequenceCode,
    tags,
    title: title.value
  }
  const filename = formatFilename({ code, tags, title: title.value })
  const lengthIssue = validateFilenameLength(filename)
  if (lengthIssue !== null) issues.push(lengthIssue)

  return { metadata, filename, issues }
}

export function splitIssues(issues: readonly Issue[]): { errors: Issue[]; warnings: Issue[] } {
  const errors: Issue[] = []
  const warnings: Issue[] = []
  for (const item of issues) {
    if (item.severity === 'error') errors.push(item)
    else warnings.push(item)
  }
  return { errors, warnings }
}
