// 前端與後端之間的約定（架構文件第 5 節）。
// 階段一的假後端（mock.ts）與階段二的 Supabase 後端都要遵守這份介面，畫面只依賴這裡。

export type MessageKind = 'chat' | 'join' | 'leave'

export interface Message {
  id: number // 越新越大。斷線補訊息時用它判斷「最後收到哪一則」
  kind: MessageKind
  nickname: string
  body: string | null // 進出提示沒有內容
  created_at: string // ISO 時間字串，由後端記錄
}

export interface Member {
  nickname_key: string // 去空白、轉小寫後的代號，用來判斷重複
  nickname: string // 顯示用，保留原本大小寫
  joined_at: string
}

export type JoinResult =
  | { ok: true }
  | { ok: false; reason: 'taken' | 'invalid' | 'unavailable' }

export type SendResult =
  | { ok: true }
  | { ok: false; reason: 'not_member' | 'empty' | 'too_long' | 'unavailable' }

export type ConnectionState = 'online' | 'reconnecting'

/** 已經加入後，因為斷線太久而失去資格的原因。 */
export type SessionLostReason = 'taken' | 'not_member'

export interface ChatEvents {
  message_received: Message
  member_joined: Member
  member_left: string // nickname_key
  connection_changed: ConnectionState
  session_lost: SessionLostReason
}

export type Unsubscribe = () => void

/** 只有假後端提供，給 ?dev=1 的測試面板使用。 */
export interface DevControls {
  setOffline(offline: boolean): void
  setUnavailable(unavailable: boolean): void
  reset(): void
}

export interface ChatBackend {
  join(nickname: string): Promise<JoinResult>
  leave(): Promise<void>
  send(body: string): Promise<SendResult>
  loadRecent(limit: number): Promise<Message[]>
  loadSince(lastId: number): Promise<Message[]>
  loadMembers(): Promise<Member[]>
  on<E extends keyof ChatEvents>(event: E, cb: (payload: ChatEvents[E]) => void): Unsubscribe
  dev?: DevControls
}
