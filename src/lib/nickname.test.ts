import { describe, expect, it } from 'vitest'
import { charLength, checkMessage, checkNickname } from './nickname'

describe('checkNickname', () => {
  it('去掉前後空白，key 是小寫', () => {
    const r = checkNickname('  Amy  ')
    expect(r).toMatchObject({ ok: true, nickname: 'Amy', key: 'amy', length: 3 })
  })

  it('1 字與 12 字可以，13 字不行', () => {
    expect(checkNickname('小').ok).toBe(true)
    expect(checkNickname('一二三四五六七八九十甲乙').ok).toBe(true)
    expect(checkNickname('一二三四五六七八九十甲乙丙')).toMatchObject({ ok: false, reason: 'too_long', length: 13 })
  })

  it('全空白不行', () => {
    expect(checkNickname('')).toMatchObject({ ok: false, reason: 'empty' })
    expect(checkNickname('   　 ')).toMatchObject({ ok: false, reason: 'empty' })
  })

  it('看不見的字元不行', () => {
    expect(checkNickname('​')).toMatchObject({ ok: false, reason: 'invisible' })
    expect(checkNickname('A​B')).toMatchObject({ ok: false, reason: 'invisible' })
    expect(checkNickname('ㅤ')).toMatchObject({ ok: false, reason: 'invisible' })
    expect(checkNickname('‮Amy')).toMatchObject({ ok: false, reason: 'invisible' })
  })

  it('emoji 算一個字，由多個符號組成的 emoji 也可以', () => {
    expect(charLength('🐱')).toBe(1)
    expect(checkNickname('🐱喵喵').ok).toBe(true)
    expect(checkNickname('👨‍👩‍👧').ok).toBe(true)
    expect(checkNickname('❤️').ok).toBe(true)
  })
})

describe('checkMessage', () => {
  it('空白不行', () => {
    expect(checkMessage('  \n ')).toMatchObject({ ok: false, reason: 'empty' })
  })
  it('500 字可以，501 字不行', () => {
    expect(checkMessage('a'.repeat(500)).ok).toBe(true)
    expect(checkMessage('a'.repeat(501))).toMatchObject({ ok: false, reason: 'too_long' })
  })
  it('去掉前後空白，保留中間的換行', () => {
    expect(checkMessage('  第一行\n第二行 ')).toMatchObject({ ok: true, body: '第一行\n第二行' })
  })
})
