import { describe, expect, it } from 'vitest'
import { insertChildCategory } from '@shared/config/categories'

const current = {
  '00': '面向对象',
  '01': '模板元',
  '02': '面向过程'
}

describe('insertChildCategory', () => {
  it('appends a category at a free code without shifting', () => {
    const result = insertChildCategory(current, '03', '编译期计算')
    expect(result.error).toBeNull()
    expect(result.shiftedCodes).toEqual([])
    expect(result.children).toEqual({ ...current, '03': '编译期计算' })
  })

  it('inserts at 00 and shifts every existing code up by one', () => {
    const result = insertChildCategory(current, '00', '语言特性')
    expect(result.error).toBeNull()
    expect(result.shiftedCodes).toEqual(['00', '01', '02'])
    expect(result.children).toEqual({
      '01': '面向对象',
      '02': '模板元',
      '03': '面向过程',
      '00': '语言特性'
    })
  })

  it('inserts in the middle and shifts only the following codes', () => {
    const result = insertChildCategory(current, '01', '编译期计算')
    expect(result.shiftedCodes).toEqual(['01', '02'])
    expect(result.children).toEqual({
      '00': '面向对象',
      '02': '模板元',
      '03': '面向过程',
      '01': '编译期计算'
    })
  })

  it('handles gaps without renumbering unrelated codes', () => {
    const result = insertChildCategory({ '00': 'A', '05': 'B' }, '03', 'C')
    expect(result.shiftedCodes).toEqual(['05'])
    expect(result.children).toEqual({ '00': 'A', '06': 'B', '03': 'C' })
  })

  it('rejects insertion when 99 would overflow', () => {
    const result = insertChildCategory({ '99': '最后' }, '00', '新的')
    expect(result.children).toBeNull()
    expect(result.error).toContain('99')
  })

  it('rejects an empty name', () => {
    const result = insertChildCategory(current, '00', '   ')
    expect(result.children).toBeNull()
    expect(result.error).toContain('名称')
  })

  it('rejects a malformed code', () => {
    const result = insertChildCategory(current, '0', '新的')
    expect(result.children).toBeNull()
    expect(result.error).toContain('两位')
  })

  it('can fill a free code below existing ones', () => {
    const result = insertChildCategory({ '00': 'A', '02': 'B' }, '01', 'C')
    expect(result.shiftedCodes).toEqual(['02'])
    expect(result.children).toEqual({ '00': 'A', '03': 'B', '01': 'C' })
  })
})

import { reorderPrimaryCategories } from '@shared/config/categories'

const primaries = {
  '00': { name: 'NVGPU', children: { '00': 'A' } },
  '01': { name: 'C++', children: { '00': 'B' } },
  '02': { name: 'CUDA', children: { '00': 'C' } },
  '03': { name: '算子', children: { '00': 'D' } }
}

describe('reorderPrimaryCategories', () => {
  it('moves the first category to the third position', () => {
    const result = reorderPrimaryCategories(primaries, '00', '02')
    expect(result).not.toBeNull()
    expect(result?.movedCodes).toEqual(['00', '01', '02'])
    expect(Object.keys(result?.categories ?? {}).sort()).toEqual(['00', '01', '02', '03'])
    expect(result?.categories['00']?.name).toBe('C++')
    expect(result?.categories['01']?.name).toBe('CUDA')
    expect(result?.categories['02']?.name).toBe('NVGPU')
    expect(result?.categories['03']?.name).toBe('算子')
  })

  it('moves a later category to the front', () => {
    const result = reorderPrimaryCategories(primaries, '03', '00')
    expect(result?.categories['00']?.name).toBe('算子')
    expect(result?.categories['01']?.name).toBe('NVGPU')
    expect(result?.categories['02']?.name).toBe('C++')
    expect(result?.categories['03']?.name).toBe('CUDA')
  })

  it('keeps children attached to their category', () => {
    const result = reorderPrimaryCategories(primaries, '00', '02')
    expect(result?.categories['02']?.children).toEqual({ '00': 'A' })
    expect(result?.categories['00']?.children).toEqual({ '00': 'B' })
  })

  it('returns null for unknown or identical codes', () => {
    expect(reorderPrimaryCategories(primaries, '00', '00')).toBeNull()
    expect(reorderPrimaryCategories(primaries, '00', '09')).toBeNull()
  })

  it('preserves non-contiguous code slots', () => {
    const result = reorderPrimaryCategories(
      { '00': { name: 'A', children: {} }, '10': { name: 'B', children: {} }, '20': { name: 'C', children: {} } },
      '20',
      '00'
    )
    expect(Object.keys(result?.categories ?? {}).sort()).toEqual(['00', '10', '20'])
    expect(result?.categories['00']?.name).toBe('C')
    expect(result?.categories['10']?.name).toBe('A')
    expect(result?.categories['20']?.name).toBe('B')
  })
})
