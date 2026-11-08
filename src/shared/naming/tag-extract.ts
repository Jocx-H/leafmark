import { normalizeNfc, validateTag } from './validate'

export interface ExtractedLeadingTags {
  tags: string[]
  title: string
  /** True when at least one valid leading `[tag]` group was removed from the title. */
  extracted: boolean
}

/**
 * Splits leading `[tag]` groups out of a free-form title.
 *
 * This is used when an existing file name such as `[GPU]使用CUDAGraph.md` is adopted:
 * the bracket prefix is meant as tags, not as part of the title. Extraction only
 * happens when every leading bracket group is a valid tag; otherwise the original
 * text is returned untouched so the user can fix it manually.
 */
export function extractLeadingTags(raw: string): ExtractedLeadingTags {
  const text = normalizeNfc(raw).trim()
  if (!text.startsWith('[')) {
    return { tags: [], title: text, extracted: false }
  }

  const tags: string[] = []
  let cursor = 0

  while (text[cursor] === '[') {
    const close = text.indexOf(']', cursor + 1)
    if (close === -1) {
      return { tags: [], title: text, extracted: false }
    }

    const validated = validateTag(text.slice(cursor + 1, close))
    const invalid =
      validated.value.length === 0 || validated.issues.some((item) => item.severity === 'error')
    if (invalid) {
      return { tags: [], title: text, extracted: false }
    }

    tags.push(validated.value)
    cursor = close + 1

    // Allow whitespace between consecutive tag groups, e.g. `[GPU] [CUDA]标题`.
    let probe = cursor
    while (probe < text.length && /\s/.test(text[probe] ?? '')) probe += 1
    if (text[probe] === '[') cursor = probe
    else break
  }

  const seen = new Set<string>()
  const unique: string[] = []
  for (const tag of tags) {
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(tag)
  }

  return { tags: unique, title: text.slice(cursor).trim(), extracted: unique.length > 0 }
}
