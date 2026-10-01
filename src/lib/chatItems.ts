import { formatDate, dayKey } from './time'
import { nicknameKey } from './nickname'
import type { Message } from '../backend/types'

export type ChatItem =
  | { type: 'date'; key: string; label: string }
  | { type: 'system'; key: string; text: string }
  | { type: 'group'; key: string; nickname: string; mine: boolean; messages: Message[] }

/**
 * 把訊息整理成畫面要顯示的項目：
 * - 跨日時插入日期分隔線
 * - 進出提示是一行灰字
 * - 同一個人連續發的訊息合併成一組（中間隔了提示或日期就重新開一組）
 */
export function buildItems(messages: Message[], myNickname: string): ChatItem[] {
  const myKey = nicknameKey(myNickname)
  const items: ChatItem[] = []
  let lastDay = ''
  for (const m of messages) {
    const day = dayKey(m.created_at)
    if (day !== lastDay) {
      lastDay = day
      items.push({ type: 'date', key: `d-${m.id}`, label: formatDate(m.created_at) })
    }
    if (m.kind !== 'chat') {
      items.push({
        type: 'system',
        key: `s-${m.id}`,
        text: `${m.nickname} ${m.kind === 'join' ? '加入' : '離開'}了聊天室`,
      })
      continue
    }
    const last = items.at(-1)
    const key = nicknameKey(m.nickname)
    if (last && last.type === 'group' && nicknameKey(last.nickname) === key) {
      last.messages.push(m)
    } else {
      items.push({ type: 'group', key: `g-${m.id}`, nickname: m.nickname, mine: key === myKey, messages: [m] })
    }
  }
  return items
}
