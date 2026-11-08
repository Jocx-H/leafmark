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
