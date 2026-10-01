import { NAME_COLOR_COUNT } from '../config'

/** 代號 → 固定的顏色序號。同一個名字（大小寫視為相同）永遠同色。 */
export function nameColorIndex(nickname: string): number {
  let h = 0x811c9dc5 // FNV-1a
  for (const ch of nickname.trim().toLowerCase()) {
    h ^= ch.codePointAt(0)!
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h % NAME_COLOR_COUNT
}

/** 對應 tokens.css 裡的 --name-0 ~ --name-7。 */
export function nameColor(nickname: string): string {
  return `var(--name-${nameColorIndex(nickname)})`
}
