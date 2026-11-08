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
