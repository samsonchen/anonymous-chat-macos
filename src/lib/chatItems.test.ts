import { describe, expect, it } from 'vitest'
import type { Message } from '../backend/types'
import { buildItems } from './chatItems'

const msg = (id: number, kind: Message['kind'], nickname: string, at: string, body: string | null = null): Message => ({
  id,
  kind,
  nickname,
  body,
  created_at: new Date(at).toISOString(),
})

describe('buildItems', () => {
  it('同一個人連續發言合併，中間隔了別人或提示就重新開一組', () => {
    const items = buildItems(
      [
        msg(1, 'chat', 'Amy', '2026-10-01T08:00:00', 'a'),
        msg(2, 'chat', 'amy', '2026-10-01T08:00:10', 'b'),
        msg(3, 'join', 'Leo', '2026-10-01T08:01:00'),
        msg(4, 'chat', 'Amy', '2026-10-01T08:02:00', 'c'),
        msg(5, 'chat', 'Leo', '2026-10-01T08:03:00', 'd'),
      ],
      '小明',
    )
    expect(items.map((i) => i.type)).toEqual(['date', 'group', 'system', 'group', 'group'])
    const first = items[1]
    expect(first.type === 'group' && first.messages.length).toBe(2)
  })

  it('跨日插入日期分隔線，並標出自己的訊息', () => {
    const items = buildItems(
      [msg(1, 'chat', '小明', '2026-09-30T23:50:00', 'x'), msg(2, 'chat', '小明', '2026-10-01T00:10:00', 'y')],
      '小明',
    )
    expect(items.map((i) => i.type)).toEqual(['date', 'group', 'date', 'group'])
    expect(items[1].type === 'group' && items[1].mine).toBe(true)
  })

  it('進出提示的文字', () => {
    const items = buildItems(
      [msg(1, 'join', '小華', '2026-10-01T08:00:00'), msg(2, 'leave', '小華', '2026-10-01T08:05:00')],
      '小明',
    )
    expect(items.filter((i) => i.type === 'system').map((i) => i.type === 'system' && i.text)).toEqual([
      '小華 加入了聊天室',
      '小華 離開了聊天室',
    ])
  })
})
