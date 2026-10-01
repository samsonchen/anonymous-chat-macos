// 階段二的後端：連到 Supabase。
// 遵守 types.ts 的 ChatBackend 介面，畫面完全不知道背後是假的還是真的。
//
// - 寫入（進入、送訊息、心跳、離開）一律呼叫資料庫函式（RPC），規則由資料庫檢查。
// - 讀取（最近訊息、補漏掉的訊息、名單）直接讀資料表。
// - 即時通知用 Realtime 的 Postgres Changes：messages 的新增、members 的新增與刪除。
// - 斷線處理見 docs/architecture.md 6.4。

import { createClient } from '@supabase/supabase-js'
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import { HEARTBEAT_MS, SS_TAB_SECRET } from '../config'
import { checkMessage, checkNickname } from '../lib/nickname'
import { getTabSecret } from '../lib/storage'
import type {
  ChatBackend,
  ChatEvents,
  ConnectionState,
  JoinResult,
  Member,
  Message,
  SendResult,
  SessionLostReason,
  Unsubscribe,
} from './types'

export interface SupabaseOptions {
  tabSecret?: string
  heartbeatMs?: number
  /** 斷線後多久重試一次 */
  retryMs?: number
}

type RpcResult = { ok: boolean; reason?: string }

const MESSAGE_COLUMNS = 'id, kind, nickname, body, created_at'
const MEMBER_COLUMNS = 'nickname_key, nickname, joined_at'
const SUBSCRIBE_TIMEOUT_MS = 8000

export class SupabaseBackend implements ChatBackend {
  private client: SupabaseClient
  private secret: string
  private heartbeatMs: number
  private retryMs: number
  private channel: RealtimeChannel | null = null
  private session: { nickname: string; key: string } | null = null
  private connected = true
  private recovering = false
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private listeners: { [E in keyof ChatEvents]: Set<(p: ChatEvents[E]) => void> } = {
    message_received: new Set(),
    member_joined: new Set(),
    member_left: new Set(),
    connection_changed: new Set(),
    session_lost: new Set(),
  }

  constructor(url: string, key: string, options: SupabaseOptions = {}) {
    // 這個聊天室不用登入，所以不需要 Supabase 的登入狀態。
    this.client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
    this.secret = options.tabSecret ?? getTabSecret(SS_TAB_SECRET)
    this.heartbeatMs = options.heartbeatMs ?? HEARTBEAT_MS
    this.retryMs = options.retryMs ?? 3000
    if (typeof window !== 'undefined') {
      window.addEventListener('offline', () => this.markDown())
      window.addEventListener('online', () => this.recoverSoon(0))
      // 手機把網頁切到背景再切回來時，計時器可能被暫停，回到前景要立刻回報。
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void this.heartbeat()
      })
    }
  }

  // ---------- 事件 ----------

  on<E extends keyof ChatEvents>(event: E, cb: (payload: ChatEvents[E]) => void): Unsubscribe {
    const set = this.listeners[event] as Set<(p: ChatEvents[E]) => void>
    set.add(cb)
    return () => {
      set.delete(cb)
    }
  }

  private emit<E extends keyof ChatEvents>(event: E, payload: ChatEvents[E]) {
    const set = this.listeners[event] as Set<(p: ChatEvents[E]) => void>
    for (const cb of Array.from(set)) cb(payload)
  }

  // ---------- 指令 ----------

  async join(nickname: string): Promise<JoinResult> {
    const check = checkNickname(nickname)
    if (!check.ok) return { ok: false, reason: 'invalid' }
    const result = await this.rpc('join_room', { p_nickname: check.nickname, p_secret: this.secret })
    if (!result) return { ok: false, reason: 'unavailable' }
    if (!result.ok) return { ok: false, reason: result.reason === 'taken' ? 'taken' : 'invalid' }

    this.session = { nickname: check.nickname, key: check.key }
    this.connected = true
    // 先訂閱再讓畫面讀取最近訊息，避免兩步之間漏掉新訊息。
    try {
      await this.subscribe()
    } catch {
      // 訂閱不到即時通知就等於沒加入：先把剛加入的名額還回去。
      await this.dropSession()
      await this.rpc('leave_room', { p_nickname: check.nickname, p_secret: this.secret })
      return { ok: false, reason: 'unavailable' }
    }
    this.heartbeatTimer ??= setInterval(() => void this.heartbeat(), this.heartbeatMs)
    return { ok: true }
  }

  async leave(): Promise<void> {
    const session = this.session
    await this.dropSession()
    if (session) {
      await this.rpc('leave_room', { p_nickname: session.nickname, p_secret: this.secret })
    }
  }

  async send(body: string): Promise<SendResult> {
    const session = this.session
    if (!session) return { ok: false, reason: 'not_member' }
    const check = checkMessage(body)
    if (!check.ok) return { ok: false, reason: check.reason }
    const result = await this.rpc('send_message', {
      p_nickname: session.nickname,
      p_secret: this.secret,
      p_body: check.body,
    })
    if (!result) return { ok: false, reason: 'unavailable' }
    if (result.ok) return { ok: true }
    if (result.reason === 'not_member') {
      this.recoverSoon(0) // 可能是被清掃掉了，嘗試重新加入
      return { ok: false, reason: 'not_member' }
    }
    return { ok: false, reason: result.reason === 'too_long' ? 'too_long' : 'empty' }
  }

  async loadRecent(limit: number): Promise<Message[]> {
    const { data, error } = await this.client
      .from('messages')
      .select(MESSAGE_COLUMNS)
      .order('id', { ascending: false })
      .limit(limit)
    if (error) {
      this.markDown()
      return []
    }
    return (data as Message[]).reverse()
  }

  async loadSince(lastId: number): Promise<Message[]> {
    const { data, error } = await this.client
      .from('messages')
      .select(MESSAGE_COLUMNS)
      .gt('id', lastId)
      .order('id', { ascending: true })
      .limit(200)
    if (error) {
      this.markDown()
      return []
    }
    return data as Message[]
  }

  async loadMembers(): Promise<Member[]> {
    const { data, error } = await this.client
      .from('members')
      .select(MEMBER_COLUMNS)
      .order('joined_at', { ascending: true })
    if (error) {
      this.markDown()
      return []
    }
    return data as Member[]
  }

  // ---------- 呼叫資料庫函式 ----------

  /** 網路或伺服器出錯回傳 null（等同「連不上」），並進入斷線處理。 */
  private async rpc(name: string, args: Record<string, string>): Promise<RpcResult | null> {
    try {
      const { data, error } = await this.client.rpc(name, args)
      if (error || data === null || typeof data !== 'object') {
        this.markDown()
        return null
      }
      return data as RpcResult
    } catch {
      this.markDown()
      return null
    }
  }

  // ---------- 即時通知 ----------

  private subscribe(): Promise<void> {
    this.teardownChannel()
    const channel = this.client.channel('chat-room')
    this.channel = channel
    channel
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (p) =>
        this.emit('message_received', p.new as Message),
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'members' }, (p) =>
        this.emit('member_joined', p.new as Member),
      )
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'members' }, (p) => {
        const key = (p.old as { nickname_key?: string }).nickname_key
        if (key) this.emit('member_left', key)
      })
    return new Promise<void>((resolve, reject) => {
      let settled = false
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true
          reject(new Error('subscribe timeout'))
        }
      }, SUBSCRIBE_TIMEOUT_MS)
      channel.subscribe((status) => {
        if (channel !== this.channel) return // 已經被換掉的舊頻道，忽略
        if (status === 'SUBSCRIBED') {
          if (!settled) {
            settled = true
            clearTimeout(timer)
            resolve()
          } else if (!this.connected) {
            this.recoverSoon(0) // 頻道自己接回來了，確認資料庫那邊也還認得我們
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          if (!settled) {
            settled = true
            clearTimeout(timer)
            reject(new Error(status))
          } else {
            this.markDown()
          }
        }
      })
    })
  }

  private teardownChannel() {
    const channel = this.channel
    this.channel = null
    if (channel) void this.client.removeChannel(channel)
  }

  // ---------- 心跳、斷線與重新連線（架構文件 6.4） ----------

  private async heartbeat() {
    const session = this.session
    if (!session || !this.connected) return
    const result = await this.rpc('heartbeat', { p_nickname: session.nickname, p_secret: this.secret })
    if (result && !result.ok) this.recoverSoon(0) // 資料庫已經不認得我們（被清掃了），嘗試重新加入
  }

  private markDown() {
    if (!this.session) return
    if (this.connected) {
      this.connected = false
      this.emit('connection_changed', 'reconnecting' satisfies ConnectionState)
    }
    this.recoverSoon(this.retryMs)
  }

  private recoverSoon(delay: number) {
    if (!this.session) return
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = setTimeout(() => void this.recover(), delay)
  }

  /**
   * 用同一組暗碼重新加入：
   * 30 秒內是無聲接手；超過 30 秒會重新加入（產生加入提示）；代號被別人用掉就失去資格。
   */
  private async recover() {
    const session = this.session
    if (!session || this.recovering) return
    this.recovering = true
    try {
      let result: RpcResult | null = null
      try {
        const { data, error } = await this.client.rpc('join_room', {
          p_nickname: session.nickname,
          p_secret: this.secret,
        })
        if (!error && data && typeof data === 'object') result = data as RpcResult
      } catch {
        result = null
      }
      if (this.session !== session) return
      if (!result) {
        this.markDown()
        return
      }
      if (!result.ok) {
        await this.dropSession()
        this.emit('session_lost', (result.reason === 'taken' ? 'taken' : 'not_member') satisfies SessionLostReason)
        return
      }
      if (this.channel?.state !== 'joined') await this.subscribe()
      if (!this.connected) {
        this.connected = true
        this.emit('connection_changed', 'online' satisfies ConnectionState)
      }
    } catch {
      this.markDown()
    } finally {
      this.recovering = false
    }
  }

  private async dropSession() {
    this.session = null
    this.connected = true
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = null
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = null
    this.teardownChannel()
  }

  /** 模擬「直接關掉分頁」：不呼叫離開，只是停止心跳與連線。測試用。 */
  async destroy() {
    await this.dropSession()
  }
}
