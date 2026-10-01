// 決定畫面使用哪一個後端。
// 階段一：假後端（全部在瀏覽器裡）。
// 階段二：改成 Supabase 後端，只需要改這一個檔案。
import { MockBackend } from './mock'
import type { ChatBackend } from './types'

export const backend: ChatBackend = new MockBackend({ bots: true, latencyMs: 250 })
