// 決定畫面使用哪一個後端。
// - 有設定 Supabase 的網址與公開金鑰：用 Supabase（階段二）。
// - 沒有設定：用假後端（階段一，全部在瀏覽器裡，方便沒有 Supabase 時也能看畫面）。
import { MockBackend } from './mock'
import { SupabaseBackend } from './supabase'
import type { ChatBackend } from './types'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

function create(): ChatBackend {
  if (url && key) return new SupabaseBackend(url, key)
  console.warn('沒有設定 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY，使用假後端（示範資料，不會連到其他人）。')
  return new MockBackend({ bots: true, latencyMs: 250 })
}

export const backend: ChatBackend = create()
