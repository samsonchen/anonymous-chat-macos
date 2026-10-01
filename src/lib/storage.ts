// 瀏覽器儲存空間在無痕模式或被封鎖時會丟出錯誤，一律包起來，讀不到就當作沒有。
export function readLocal(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeLocal(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* 存不了就算了，只是下次不會預先填入代號 */
  }
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

/**
 * 這個分頁的暗碼（架構文件 5.4）。
 * sessionStorage 在重新整理後還在，但另開分頁就是全新的，所以能分辨「同一個分頁重新整理」與「另一個分頁」。
 */
export function getTabSecret(key: string): string {
  try {
    const existing = window.sessionStorage.getItem(key)
    if (existing) return existing
    const fresh = randomId()
    window.sessionStorage.setItem(key, fresh)
    return fresh
  } catch {
    return randomId()
  }
}
