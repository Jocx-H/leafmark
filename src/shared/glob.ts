/**
 * Minimal glob matcher for the `ignoreGlobs` configuration.
 *
 * Supported syntax (always interpreted with `/` as the separator, independent of the
 * host platform):
 * - `*`  matches any characters except `/`
 * - `?`  matches one character except `/`
 * - `**` matches any characters, including `/`; `a/**` also matches `a` itself
 *
 * Matching is case insensitive so that a rule behaves the same on Windows, macOS and
 * case sensitive Linux file systems.
 */
export interface IgnoreMatcher {
  (relativePath: string, isDirectory: boolean): boolean
  readonly patterns: readonly string[]
}

export function globToRegExp(glob: string): RegExp {
  const normalized = glob.replace(/\\/g, '/').replace(/^\.\//, '')
  let source = ''
  let index = 0

  while (index < normalized.length) {
    const char = normalized[index]
    if (char === undefined) break

    if (char === '*') {
      if (normalized[index + 1] === '*') {
        index += 2
        if (normalized[index] === '/') {
          source += '(?:.*/)?'
          index += 1
        } else {
          source += '.*'
        }
        continue
      }
      source += '[^/]*'
      index += 1
      continue
    }

    if (char === '?') {
      source += '[^/]'
      index += 1
      continue
    }

    if (char === '[') {
      const close = normalized.indexOf(']', index + 1)
      if (close !== -1) {
        source += normalized.slice(index, close + 1)
        index = close + 1
        continue
      }
    }

    source += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    index += 1
  }

  return new RegExp(`^${source}$`, 'i')
}

export function createIgnoreMatcher(globs: readonly string[]): IgnoreMatcher {
  const patterns = globs
    .map((glob) => glob.trim())
    .filter((glob) => glob.length > 0)
    .map((glob) => ({ raw: glob, regexp: globToRegExp(glob) }))

  const matcher = ((relativePath: string, isDirectory: boolean): boolean => {
    const candidate = normalizeRelativePath(relativePath)
    if (candidate === '') return false
    const probe = isDirectory ? `${candidate}/` : candidate
    return patterns.some(({ regexp }) => regexp.test(candidate) || regexp.test(probe))
  }) as IgnoreMatcher

  Object.defineProperty(matcher, 'patterns', {
    value: patterns.map((pattern) => pattern.raw),
    enumerable: true
  })

  return matcher
}

export function normalizeRelativePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
}
