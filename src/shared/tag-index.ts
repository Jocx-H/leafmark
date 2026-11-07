import type { DocumentRecord, TagStat } from './model'
import { normalizeNfc } from './naming/validate'

export function tagKey(tag: string): string {
  return normalizeNfc(tag).trim().toLowerCase()
}

interface VariantInfo {
  count: number
  bestCode: string
}

/**
 * Builds the workspace wide tag list.
 *
 * The display spelling of a tag is chosen deterministically — most used spelling,
 * then the spelling used by the smallest document code, then lexicographic order —
 * so that the same workspace yields the same tag list on every platform
 * (the scan order itself is not stable across file systems).
 */
export function buildTagStats(documents: readonly DocumentRecord[]): TagStat[] {
  const byKey = new Map<string, Map<string, VariantInfo>>()
  const totals = new Map<string, number>()

  for (const document of documents) {
    if (!document.parsed) continue
    const code = document.parsed.code ?? ''
    for (const tag of document.parsed.tags) {
      const key = tagKey(tag)
      const display = normalizeNfc(tag).trim()
      let variants = byKey.get(key)
      if (!variants) {
        variants = new Map()
        byKey.set(key, variants)
      }
      totals.set(key, (totals.get(key) ?? 0) + 1)
      const current = variants.get(display)
      if (current) {
        current.count += 1
        if (code !== '' && (current.bestCode === '' || code < current.bestCode)) current.bestCode = code
      } else {
        variants.set(display, { count: 1, bestCode: code })
      }
    }
  }

  const stats: TagStat[] = []
  for (const [key, variants] of byKey) {
    let display = ''
    let best: VariantInfo | null = null
    for (const [candidate, info] of variants) {
      if (
        best === null ||
        info.count > best.count ||
        (info.count === best.count && compareBestCode(info.bestCode, best.bestCode) < 0) ||
        (info.count === best.count &&
          info.bestCode === best.bestCode &&
          candidate.localeCompare(display, 'zh-Hans-CN') < 0)
      ) {
        best = info
        display = candidate
      }
    }
    if (display !== '') {
      stats.push({ key, display, count: totals.get(key) ?? 0 })
    }
  }

  stats.sort((left, right) => {
    if (right.count !== left.count) return right.count - left.count
    return left.display.localeCompare(right.display, 'zh-Hans-CN')
  })

  return stats
}

function compareBestCode(left: string, right: string): number {
  if (left === right) return 0
  if (left === '') return 1
  if (right === '') return -1
  return left < right ? -1 : 1
}
