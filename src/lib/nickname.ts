import { MESSAGE_MAX, NICKNAME_MAX } from '../config'

/** 以「字」計算長度（emoji 算一個字）。與資料庫的 char_length 一致。 */
export function charLength(s: string): number {
  return Array.from(s).length
}

// 零寬連字（ZWJ）與變體選擇符是組成 emoji 的一部分，不能擋。
const EMOJI_JOINERS = new Set([0x200d, 0xfe0e, 0xfe0f])
const BLANK_LOOKALIKES = new Set([0x115f, 0x1160, 0x2800, 0x3164])

function isInvisible(ch: string): boolean {
  const cp = ch.codePointAt(0)!
  if (EMOJI_JOINERS.has(cp)) return false
  if (BLANK_LOOKALIKES.has(cp)) return true
  return /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(ch)
}

export type NicknameCheck =
  | { ok: true; nickname: string; key: string; length: number }
  | { ok: false; reason: 'empty' | 'invisible' | 'too_long'; length: number }

/** 代號規則：去前後空白、1～12 字、不含看不見的字元。大小寫視為相同（key 是小寫）。 */
export function checkNickname(raw: string): NicknameCheck {
  const nickname = raw.trim()
  const length = charLength(nickname)
  if (length === 0) return { ok: false, reason: 'empty', length }
  if (Array.from(nickname).some(isInvisible)) return { ok: false, reason: 'invisible', length }
  if (length > NICKNAME_MAX) return { ok: false, reason: 'too_long', length }
  return { ok: true, nickname, key: nickname.toLowerCase(), length }
}

export function nicknameKey(nickname: string): string {
  return nickname.trim().toLowerCase()
}

export type MessageCheck =
  | { ok: true; body: string; length: number }
  | { ok: false; reason: 'empty' | 'too_long'; length: number }

/** 訊息規則：去前後空白後不能是空的，最多 500 字。 */
export function checkMessage(raw: string): MessageCheck {
  const body = raw.trim()
  const length = charLength(body)
  if (length === 0) return { ok: false, reason: 'empty', length }
  if (length > MESSAGE_MAX) return { ok: false, reason: 'too_long', length }
  return { ok: true, body, length }
}
