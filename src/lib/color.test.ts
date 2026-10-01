import { describe, expect, it } from 'vitest'
import { nameColorIndex } from './color'

describe('nameColorIndex', () => {
  it('同一個名字永遠同色，大小寫視為相同', () => {
    expect(nameColorIndex('Amy')).toBe(nameColorIndex('amy'))
    expect(nameColorIndex(' Amy ')).toBe(nameColorIndex('amy'))
  })
  it('落在 0～7', () => {
    for (const n of ['小明', 'Amy', '🐱', 'x', '示範-小花']) {
      const i = nameColorIndex(n)
      expect(i).toBeGreaterThanOrEqual(0)
      expect(i).toBeLessThan(8)
    }
  })
  it('不同名字不會全部同色', () => {
    const set = new Set(['小明', '小華', 'Amy', '柚子', 'Leo', '阿傑'].map(nameColorIndex))
    expect(set.size).toBeGreaterThan(2)
  })
})
