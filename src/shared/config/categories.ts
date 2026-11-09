export interface InsertChildResult {
  children: Record<string, string> | null
  /** Existing child codes that will be moved one step up, in ascending order. */
  shiftedCodes: string[]
  error: string | null
}

const TWO_DIGITS = /^[0-9]{2}$/

/**
 * Inserts a secondary category at `code`, shifting every existing code >= `code`
 * one step up. This lets the user put a new category in front of `00`, `01`, ...
 *
 * The shift is only a configuration change: documents are not renamed here. The
 * settings UI blocks the operation when documents currently use the affected
 * codes, because their six digit numbers would otherwise point at other names.
 */
export function insertChildCategory(
  children: Record<string, string>,
  code: string,
  rawName: string
): InsertChildResult {
  if (!TWO_DIGITS.test(code)) {
    return { children: null, shiftedCodes: [], error: '二级分类编号必须是两位数字' }
  }

  const name = rawName.trim()
  if (name.length === 0) {
    return { children: null, shiftedCodes: [], error: '二级分类名称不能为空' }
  }

  const shiftedCodes = Object.keys(children)
    .filter((childCode) => TWO_DIGITS.test(childCode) && childCode >= code)
    .sort()

  if (shiftedCodes.includes('99')) {
    return {
      children: null,
      shiftedCodes,
      error: '99 号已被占用，无法继续后移；请先移除或调整 99 号分类'
    }
  }

  const next: Record<string, string> = {}
  for (const [childCode, childName] of Object.entries(children)) {
    const target = TWO_DIGITS.test(childCode) && childCode >= code
      ? String(Number(childCode) + 1).padStart(2, '0')
      : childCode
    next[target] = childName
  }
  next[code] = name

  return { children: next, shiftedCodes, error: null }
}

export interface ReorderPrimaryResult {
  categories: Record<string, import('./types').CategoryNode>
  mapping: Record<string, string>
  /** Codes whose position changed, i.e. codes that would need document renames. */
  movedCodes: string[]
}

/**
 * Moves `sourceCode` to the position of `targetCode` and keeps the existing set of
 * code slots. Codes are reassigned in list order, so the list stays sorted by code
 * while category contents move with their node.
 */
export function reorderPrimaryCategories(
  categories: Record<string, import('./types').CategoryNode>,
  sourceCode: string,
  targetCode: string
): ReorderPrimaryResult | null {
  const codes = Object.keys(categories).sort()
  const sourceIndex = codes.indexOf(sourceCode)
  const targetIndex = codes.indexOf(targetCode)
  if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) return null

  const reordered = [...codes]
  reordered.splice(sourceIndex, 1)
  reordered.splice(targetIndex, 0, sourceCode)

  // `reordered[i]` is the category that now occupies code slot `codes[i]`.
  const mapping: Record<string, string> = {}
  codes.forEach((slotCode, index) => {
    mapping[reordered[index] as string] = slotCode
  })

  const next: Record<string, import('./types').CategoryNode> = {}
  const movedCodes: string[] = []
  for (const oldCode of codes) {
    const node = categories[oldCode]
    if (!node) continue
    const newCode = mapping[oldCode] as string
    next[newCode] = node
    if (newCode !== oldCode) movedCodes.push(oldCode)
  }

  return { categories: next, mapping, movedCodes }
}
