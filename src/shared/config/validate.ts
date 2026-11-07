import { ISSUE, issue, type Issue } from '../errors'
import { validateTag } from '../naming/validate'
import { createDefaultConfig, type CategoryNode, type LeafmarkConfig } from './types'

export interface ConfigValidationResult {
  config: LeafmarkConfig
  issues: Issue[]
}

const TWO_DIGITS = /^[0-9]{2}$/

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * Validates an unknown JSON value against the workspace configuration schema.
 * The returned configuration always has every known field populated so the rest of
 * the application can rely on it; `issues` reports what was rejected.
 */
export function validateConfig(raw: unknown): ConfigValidationResult {
  const config = createDefaultConfig()
  const issues: Issue[] = []

  if (!isPlainObject(raw)) {
    issues.push(
      issue(ISSUE.configInvalid, '工作区配置必须是一个 JSON 对象', 'error')
    )
    return { config, issues }
  }

  const schemaVersion = raw.schemaVersion
  if (typeof schemaVersion !== 'number') {
    issues.push(
      issue(ISSUE.configInvalid, '缺少 schemaVersion，配置文件需要显式声明版本号 1', 'error')
    )
  } else if (schemaVersion !== 1) {
    issues.push(
      issue(ISSUE.configInvalid, `不支持的 schemaVersion：${schemaVersion}，当前仅支持 1`, 'error')
    )
  }

  if (raw.scan !== undefined) {
    if (!isPlainObject(raw.scan)) {
      issues.push(issue(ISSUE.configInvalid, 'scan 必须是对象', 'error', undefined, 'scan'))
    } else {
      const scan = raw.scan
      if (scan.recursive !== undefined) {
        if (typeof scan.recursive === 'boolean') config.scan.recursive = scan.recursive
        else issues.push(issue(ISSUE.configInvalid, 'scan.recursive 必须是布尔值', 'error', undefined, 'scan.recursive'))
      }
      if (scan.followSymlinks !== undefined) {
        if (typeof scan.followSymlinks === 'boolean') config.scan.followSymlinks = scan.followSymlinks
        else
          issues.push(
            issue(ISSUE.configInvalid, 'scan.followSymlinks 必须是布尔值', 'error', undefined, 'scan.followSymlinks')
          )
      }
      if (scan.extensions !== undefined) {
        if (Array.isArray(scan.extensions) && scan.extensions.every((item) => typeof item === 'string')) {
          const extensions = scan.extensions
            .map((item) => (item as string).trim().toLowerCase())
            .filter((item) => item.startsWith('.') && item.length > 1)
          config.scan.extensions = extensions.length > 0 ? [...new Set(extensions)] : ['.md']
          if (extensions.length !== scan.extensions.length) {
            issues.push(
              issue(ISSUE.configInvalid, 'scan.extensions 中的扩展名必须以 “.” 开头', 'error', undefined, 'scan.extensions')
            )
          }
        } else {
          issues.push(issue(ISSUE.configInvalid, 'scan.extensions 必须是字符串数组', 'error', undefined, 'scan.extensions'))
        }
      }
      if (scan.ignoreGlobs !== undefined) {
        if (Array.isArray(scan.ignoreGlobs) && scan.ignoreGlobs.every((item) => typeof item === 'string')) {
          config.scan.ignoreGlobs = (scan.ignoreGlobs as string[]).map((item) => item.trim()).filter(Boolean)
        } else {
          issues.push(issue(ISSUE.configInvalid, 'scan.ignoreGlobs 必须是字符串数组', 'error', undefined, 'scan.ignoreGlobs'))
        }
      }
    }
  }

  if (raw.categories !== undefined) {
    if (!isPlainObject(raw.categories)) {
      issues.push(issue(ISSUE.configInvalid, 'categories 必须是对象', 'error', undefined, 'categories'))
    } else {
      const categories: Record<string, CategoryNode> = {}
      for (const [primary, value] of Object.entries(raw.categories)) {
        const path = `categories.${primary}`
        if (!TWO_DIGITS.test(primary)) {
          issues.push(issue(ISSUE.configInvalid, `一级分类编号必须是两位数字：“${primary}”`, 'error', undefined, path))
          continue
        }
        if (!isPlainObject(value)) {
          issues.push(issue(ISSUE.configInvalid, `分类 ${primary} 的配置必须是对象`, 'error', undefined, path))
          continue
        }
        if (!nonEmptyString(value.name)) {
          issues.push(issue(ISSUE.configInvalid, `分类 ${primary} 的名称不能为空`, 'error', undefined, `${path}.name`))
          continue
        }
        const children: Record<string, string> = {}
        if (value.children !== undefined) {
          if (!isPlainObject(value.children)) {
            issues.push(issue(ISSUE.configInvalid, `分类 ${primary} 的 children 必须是对象`, 'error', undefined, `${path}.children`))
          } else {
            for (const [secondary, childName] of Object.entries(value.children)) {
              const childPath = `${path}.children.${secondary}`
              if (!TWO_DIGITS.test(secondary)) {
                issues.push(
                  issue(ISSUE.configInvalid, `二级分类编号必须是两位数字：“${secondary}”`, 'error', undefined, childPath)
                )
                continue
              }
              if (!nonEmptyString(childName)) {
                issues.push(
                  issue(ISSUE.configInvalid, `二级分类 ${primary}/${secondary} 的名称不能为空`, 'error', undefined, childPath)
                )
                continue
              }
              children[secondary] = childName.trim()
            }
          }
        }
        categories[primary] = { name: value.name.trim(), children }
      }
      config.categories = categories
    }
  }

  if (raw.pinnedTags !== undefined) {
    if (!Array.isArray(raw.pinnedTags)) {
      issues.push(issue(ISSUE.configInvalid, 'pinnedTags 必须是字符串数组', 'error', undefined, 'pinnedTags'))
    } else {
      const seen = new Set<string>()
      const pinned: string[] = []
      raw.pinnedTags.forEach((value, index) => {
        if (typeof value !== 'string') {
          issues.push(issue(ISSUE.configInvalid, `pinnedTags[${index}] 必须是字符串`, 'error', undefined, `pinnedTags[${index}]`))
          return
        }
        const validated = validateTag(value)
        for (const tagIssue of validated.issues) {
          issues.push({ ...tagIssue, path: `pinnedTags[${index}]` })
        }
        const key = validated.value.toLowerCase()
        const rejected = validated.issues.some((item) => item.severity === 'error')
        if (validated.value.length > 0 && !rejected && !seen.has(key)) {
          seen.add(key)
          pinned.push(validated.value)
        }
      })
      config.pinnedTags = pinned
    }
  }

  if (raw.behavior !== undefined) {
    if (!isPlainObject(raw.behavior)) {
      issues.push(issue(ISSUE.configInvalid, 'behavior 必须是对象', 'error', undefined, 'behavior'))
    } else {
      if (raw.behavior.confirmBeforeRename !== undefined) {
        if (typeof raw.behavior.confirmBeforeRename === 'boolean') {
          config.behavior.confirmBeforeRename = raw.behavior.confirmBeforeRename
        } else {
          issues.push(
            issue(ISSUE.configInvalid, 'behavior.confirmBeforeRename 必须是布尔值', 'error', undefined, 'behavior.confirmBeforeRename')
          )
        }
      }
      if (raw.behavior.warnAboutLinks !== undefined) {
        if (typeof raw.behavior.warnAboutLinks === 'boolean') {
          config.behavior.warnAboutLinks = raw.behavior.warnAboutLinks
        } else {
          issues.push(
            issue(ISSUE.configInvalid, 'behavior.warnAboutLinks 必须是布尔值', 'error', undefined, 'behavior.warnAboutLinks')
          )
        }
      }
    }
  }

  return { config, issues }
}
