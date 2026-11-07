import { useMemo, useState, type ReactNode } from 'react'
import type { TagStat } from '@shared/model'
import { normalizeNfc } from '@shared/naming/validate'

interface ListToolbarProps {
  query: string
  onQueryChange: (value: string) => void
  selectedTags: string[]
  onTagsChange: (keys: string[]) => void
  tagMode: 'all' | 'any'
  onTagModeChange: (mode: 'all' | 'any') => void
  tags: TagStat[]
  pinnedTags: string[]
  resultCount: number
  totalCount: number
}

interface TagOption {
  key: string
  display: string
  count: number
}

export function ListToolbar({
  query,
  onQueryChange,
  selectedTags,
  onTagsChange,
  tagMode,
  onTagModeChange,
  tags,
  pinnedTags,
  resultCount,
  totalCount
}: ListToolbarProps): ReactNode {
  const [open, setOpen] = useState(false)
  const selected = new Set(selectedTags)

  const options = useMemo(() => {
    const map = new Map<string, TagOption>()
    for (const tag of tags) map.set(tag.key, { key: tag.key, display: tag.display, count: tag.count })
    for (const pinned of pinnedTags) {
      const display = normalizeNfc(pinned).trim()
      const key = display.toLowerCase()
      if (!map.has(key)) map.set(key, { key, display, count: 0 })
    }
    return [...map.values()]
  }, [tags, pinnedTags])

  const toggle = (key: string): void => {
    if (selected.has(key)) onTagsChange(selectedTags.filter((item) => item !== key))
    else onTagsChange([...selectedTags, key])
  }

  return (
    <div className="list-toolbar">
      <div className="search-wrap">
        <span className="search-icon" aria-hidden="true">
          ⌕
        </span>
        <input
          className="search-input"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="按标题或文件名筛选"
          aria-label="搜索文档"
          data-testid="search-input"
        />
        {query.length > 0 ? (
          <button type="button" className="search-clear" onClick={() => onQueryChange('')} aria-label="清除搜索">
            ×
          </button>
        ) : null}
      </div>

      <div className="popover-anchor">
        <button
          type="button"
          className={selectedTags.length > 0 ? 'button button-quiet is-active' : 'button button-quiet'}
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          标签筛选{selectedTags.length > 0 ? ` · ${selectedTags.length}` : ''}
        </button>
        {open ? (
          <>
            <div className="popover-backdrop" onClick={() => setOpen(false)} />
            <div className="popover tag-filter-popover" role="dialog" aria-label="标签筛选">
              <div className="popover-head">
                <span className="popover-title">标签</span>
                <div className="segmented" role="group" aria-label="标签匹配方式">
                  <button
                    type="button"
                    className={tagMode === 'all' ? 'is-active' : ''}
                    onClick={() => onTagModeChange('all')}
                  >
                    包含全部
                  </button>
                  <button
                    type="button"
                    className={tagMode === 'any' ? 'is-active' : ''}
                    onClick={() => onTagModeChange('any')}
                  >
                    包含任一
                  </button>
                </div>
              </div>
              <div className="popover-list">
                {options.length === 0 ? <p className="popover-empty">工作区中还没有标签</p> : null}
                {options.map((option) => (
                  <label className="tag-option" key={option.key}>
                    <input type="checkbox" checked={selected.has(option.key)} onChange={() => toggle(option.key)} />
                    <span className="tag-option-name">{option.display}</span>
                    <span className="tag-option-count">{option.count}</span>
                  </label>
                ))}
              </div>
              {selectedTags.length > 0 ? (
                <button type="button" className="link-button" onClick={() => onTagsChange([])}>
                  清除标签筛选
                </button>
              ) : null}
            </div>
          </>
        ) : null}
      </div>

      <span className="list-count">
        {resultCount} / {totalCount}
      </span>
    </div>
  )
}
