export interface ScanConfig {
  recursive: boolean
  extensions: string[]
  followSymlinks: boolean
  ignoreGlobs: string[]
}

export interface BehaviorConfig {
  confirmBeforeRename: boolean
  warnAboutLinks: boolean
}

export interface CategoryNode {
  name: string
  children: Record<string, string>
}

export interface LeafmarkConfig {
  schemaVersion: 1
  scan: ScanConfig
  categories: Record<string, CategoryNode>
  pinnedTags: string[]
  behavior: BehaviorConfig
}

export const DEFAULT_IGNORE_GLOBS = [
  '.git/**',
  'node_modules/**',
  'attachments/**'
] as const

export function createDefaultConfig(): LeafmarkConfig {
  return {
    schemaVersion: 1,
    scan: {
      recursive: true,
      extensions: ['.md'],
      followSymlinks: false,
      ignoreGlobs: [...DEFAULT_IGNORE_GLOBS]
    },
    categories: {
      '00': {
        name: '未分类',
        children: {
          '00': '未分类'
        }
      }
    },
    pinnedTags: [],
    behavior: {
      confirmBeforeRename: true,
      warnAboutLinks: true
    }
  }
}

/** Deep clone helper that keeps the configuration free of shared references. */
export function cloneConfig(config: LeafmarkConfig): LeafmarkConfig {
  return {
    schemaVersion: config.schemaVersion,
    scan: {
      recursive: config.scan.recursive,
      extensions: [...config.scan.extensions],
      followSymlinks: config.scan.followSymlinks,
      ignoreGlobs: [...config.scan.ignoreGlobs]
    },
    categories: Object.fromEntries(
      Object.entries(config.categories).map(([primary, node]) => [
        primary,
        { name: node.name, children: { ...node.children } }
      ])
    ),
    pinnedTags: [...config.pinnedTags],
    behavior: { ...config.behavior }
  }
}
