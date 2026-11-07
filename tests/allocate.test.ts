import { describe, expect, it } from 'vitest'
import { freeSequences, recommendSequence } from '@shared/naming/allocate'

function assigned(value: ReturnType<typeof recommendSequence>): string | null {
  return value.kind === 'assigned' ? value.sequence : null
}

describe('recommendSequence', () => {
  it('recommends 00 for an empty category', () => {
    expect(assigned(recommendSequence([]))).toBe('00')
  })

  it('recommends max + 1 without filling gaps', () => {
    expect(assigned(recommendSequence(['00', '01', '03']))).toBe('04')
  })

  it('ignores duplicate and malformed entries', () => {
    expect(assigned(recommendSequence(['01', '01', '9', 'ab']))).toBe('02')
  })

  it('asks for a manual choice once 99 is used', () => {
    const result = recommendSequence(['98', '99'])
    expect(result.kind).toBe('manual')
  })

  it('reports a full category', () => {
    const used = Array.from({ length: 100 }, (_, index) => String(index).padStart(2, '0'))
    expect(recommendSequence(used).kind).toBe('full')
  })

  it('reports full when 99 is used and 00..98 are all taken', () => {
    const used = Array.from({ length: 100 }, (_, index) => String(index).padStart(2, '0'))
    expect(recommendSequence(used)).toMatchObject({ kind: 'full' })
  })

  it('lists free sequences', () => {
    const free = freeSequences(['00', '02'])
    expect(free).toContain('01')
    expect(free).not.toContain('00')
    expect(free).toHaveLength(98)
  })
})
