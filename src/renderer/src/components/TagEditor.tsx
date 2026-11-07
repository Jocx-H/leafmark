import { useState, type KeyboardEvent, type ReactNode } from 'react'
import { normalizeNfc } from '@shared/naming/validate'

interface TagEditorProps {
  tags: string[]
  onChange: (tags: string[]) => void
  suggestions: string[]
  placeholder?: string
  disabled?: boolean
}

export function TagEditor({ tags, onChange, suggestions, placeholder, disabled }: TagEditorProps): ReactNode {
  const [input, setInput] = useState('')
  const [focused, setFocused] = useState(false)

  const selectedKeys = new Set(tags.map((tag) => tag.toLowerCase()))
  const needle = normalizeNfc(input).trim().toLowerCase()
  const matches =
    needle.length === 0
      ? []
      : suggestions
          .filter((suggestion) => !selectedKeys.has(suggestion.toLowerCase()))
          .filter((suggestion) => suggestion.toLowerCase().includes(needle))
          .slice(0, 8)

  const add = (raw: string): void => {
    const value = normalizeNfc(raw).trim()
    if (value.length === 0) return
    if (tags.some((tag) => tag.toLowerCase() === value.toLowerCase())) {
      setInput('')
      return
    }
    onChange([...tags, value])
    setInput('')
  }

  const remove = (index: number): void => {
    onChange(tags.filter((_tag, current) => current !== index))
  }

  const move = (index: number, delta: number): void => {
    const target = index + delta
    if (target < 0 || target >= tags.length) return
    const next = [...tags]
    const [item] = next.splice(index, 1)
    if (item === undefined) return
    next.splice(target, 0, item)
    onChange(next)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter' || event.key === ',' || event.key === '，') {
      event.preventDefault()
      add(input)
      return
    }
    if (event.key === 'Backspace' && input.length === 0 && tags.length > 0) {
      onChange(tags.slice(0, -1))
      return
    }
    if (event.key === 'Escape') {
      setInput('')
    }
  }

  return (
    <div className={disabled ? 'tag-editor is-disabled' : 'tag-editor'}>
      <div className="tag-chips">
        {tags.map((tag, index) => (
          <span className="tag-chip" key={`${tag}-${index}`}>
            <span className="tag-chip-label">{tag}</span>
            <span className="tag-chip-actions">
              <button
                type="button"
                aria-label={`前移标签 ${tag}`}
                onClick={() => move(index, -1)}
                disabled={disabled || index === 0}
              >
                ‹
              </button>
              <button
                type="button"
                aria-label={`后移标签 ${tag}`}
                onClick={() => move(index, 1)}
                disabled={disabled || index === tags.length - 1}
              >
                ›
              </button>
              <button type="button" aria-label={`移除标签 ${tag}`} onClick={() => remove(index)} disabled={disabled}>
                ×
              </button>
            </span>
          </span>
        ))}
        <input
          className="tag-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false)
            add(input)
          }}
          placeholder={tags.length === 0 ? (placeholder ?? '添加标签，回车确认') : '继续添加'}
          disabled={disabled}
          aria-label="添加标签"
        />
      </div>
      {focused && matches.length > 0 ? (
        <div className="tag-suggestions">
          {matches.map((suggestion) => (
            <button
              type="button"
              key={suggestion}
              className="tag-suggestion"
              onMouseDown={(event) => {
                event.preventDefault()
                add(suggestion)
              }}
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
