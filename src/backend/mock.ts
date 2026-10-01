// 階段一的假後端。完全在瀏覽器裡運作，不連任何伺服器。
//
// 它模擬「資料庫 + 即時通知」會做的事，讓畫面可以完整測試：
// - 用 localStorage 當作共用的資料庫，同一個瀏覽器的多個分頁看到的是同一份資料。
// - 用 BroadcastChannel 通知其他分頁「資料變了」，等於即時通知。
// - 規則（代號不重複、分頁暗碼、30 秒沒心跳視為離開、保留最近 200 則）跟架構文件第 5.5 節一致。
// - 放幾個「示範-」開頭的假成員，偶爾自動說話，讓一個人打開時畫面也不是空的。
//
// 階段二會新增 supabase.ts 實作同一份 ChatBackend 介面，畫面不用改。

import {
  HEARTBEAT_MS,
  KEEP_COUNT,
  SS_TAB_SECRET,
  STALE_MS,
  SWEEP_MS,
} from '../config'
import { checkMessage, checkNickname, nicknameKey } from '../lib/nickname'
import { getTabSecret } from '../lib/storage'
import type {
  ChatBackend,
  ChatEvents,
  ConnectionState,
  DevControls,
  JoinResult,
  Member,
  Message,
  MessageKind,
  SendResult,
  Unsubscribe,
} from './types'

const STATE_KEY = 'anon-chat-mock:v1'
const CHANNEL_NAME = 'anon-chat-mock'
const BOT_LOCK = 'anon-chat-mock-bots'
// 離開太久（超過這個時間）的人直接從名單消失，不補一則「離開」提示，避免回來時看到一堆過時的進出訊息。
const SILENT_DROP_MS = 5 * 60_000

interface StoredMember extends Member {
  secret: string
  last_seen: number
  bot?: boolean
}

interface State {
  messages: Message[]
  members: StoredMember[]
  nextId: number
  seeded: boolean
}

export interface MockOptions {
  storage?: Storage
  now?: () => number
  tabSecret?: string
  bots?: boolean
  latencyMs?: number
  heartbeatMs?: number
  sweepMs?: number
  staleMs?: number
  /** 是否監聽其他分頁的通知、背景計時器。測試時可關掉改手動呼叫 sync()。 */
  autoStart?: boolean
}

const BOT_NAMES = ['示範-小花', '示範-阿凱', '示範-Mia']
const BOT_LINES = [
  '大家好，這裡是示範用的訊息',
  '這個聊天室不用登入就能用',
  '試試看開第二個分頁，輸入同一個代號',
  '手機上也可以用',
  '代號重複的話會被擋下來',
  '訊息只保留最近的 200 則',
  '有人在嗎？',
  '按「離開」會馬上釋出你的代號',
]

const sleep = (ms: number) => (ms > 0 ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve())

export class MockBackend implements ChatBackend {
  private storage: Storage
  private now: () => number
  private secret: string
  private opts: Required<Omit<MockOptions, 'storage' | 'now' | 'tabSecret'>>
  private channel: BroadcastChannel | null = null
  private listeners: { [E in keyof ChatEvents]: Set<(p: ChatEvents[E]) => void> } = {
    message_received: new Set(),
    member_joined: new Set(),
    member_left: new Set(),
    connection_changed: new Set(),
    session_lost: new Set(),
  }
  private session: { nickname: string; key: string } | null = null
  private lastEmittedId = 0
  private known = new Map<string, Member>()
  private offline = false
  private unavailable = false
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private sweepTimer: ReturnType<typeof setInterval> | null = null
  private botTimer: ReturnType<typeof setTimeout> | null = null
  private botLineIndex = 0

  constructor(options: MockOptions = {}) {
    this.storage = options.storage ?? window.localStorage
    this.now = options.now ?? Date.now
    this.secret = options.tabSecret ?? getTabSecret(SS_TAB_SECRET)
    this.opts = {
      bots: options.bots ?? false,
      latencyMs: options.latencyMs ?? 0,
      heartbeatMs: options.heartbeatMs ?? HEARTBEAT_MS,
      sweepMs: options.sweepMs ?? SWEEP_MS,
      staleMs: options.staleMs ?? STALE_MS,
      autoStart: options.autoStart ?? true,
    }
    if (this.opts.autoStart) this.start()
  }

  // ---------- 啟動 ----------

  private start() {
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(CHANNEL_NAME)
      this.channel.onmessage = () => this.sync()
    }
    this.sweepTimer = setInterval(() => this.sweep(), this.opts.sweepMs)
    // 手機把網頁切到背景再切回來時，計時器可能被暫停，回到前景要立刻回報。
    document.addEventListener('visibilitychange', this.onVisibility)
    if (this.opts.bots) this.startBots()
  }

  private onVisibility = () => {
    if (document.visibilityState === 'visible') {
      this.sweep()
      this.heartbeat()
    }
  }

  // ---------- 共用資料（相當於資料庫） ----------

  private read(): State {
    try {
      const raw = this.storage.getItem(STATE_KEY)
      if (raw) return JSON.parse(raw) as State
    } catch {
      /* 資料壞掉就重來 */
    }
    return { messages: [], members: [], nextId: 1, seeded: false }
  }

  private write(s: State) {
    this.storage.setItem(STATE_KEY, JSON.stringify(s))
  }

  private iso(ms = this.now()) {
    return new Date(ms).toISOString()
  }

  private push(s: State, kind: MessageKind, nickname: string, body: string | null, at = this.now()) {
    s.messages.push({ id: s.nextId++, kind, nickname, body, created_at: this.iso(at) })
    if (s.messages.length > KEEP_COUNT) s.messages = s.messages.slice(-KEEP_COUNT)
  }

  /** 讀取 → 修改 → 寫回 → 通知其他分頁 → 通知自己。 */
  private mutate<T>(fn: (s: State) => T): T {
    const s = this.read()
    const result = fn(s)
    this.write(s)
    this.channel?.postMessage('changed')
    this.sync()
    return result
  }

  /** 移除超過 30 秒沒有心跳的成員。回傳是否有變動。 */
  private sweepState(s: State): boolean {
    const t = this.now()
    const stale = s.members.filter((m) => !m.bot && t - m.last_seen > this.opts.staleMs)
    if (stale.length === 0) return false
    const dropped = new Set(stale.map((m) => m.nickname_key))
    s.members = s.members.filter((m) => !dropped.has(m.nickname_key))
    for (const m of stale) {
      if (t - m.last_seen <= SILENT_DROP_MS) this.push(s, 'leave', m.nickname, null)
    }
    return true
  }

  /** 對應資料庫每 10 秒執行一次的清掃。 */
  sweep() {
    const s = this.read()
    if (this.sweepState(s)) {
      this.write(s)
      this.channel?.postMessage('changed')
    }
    this.sync()
  }

  // ---------- 即時通知 ----------

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

  /** 比對共用資料與自己上次看到的，把差異當作事件發出去。斷線模擬期間不發。 */
  sync() {
    if (this.offline || !this.session) return
    const s = this.read()
    for (const m of s.messages) {
      if (m.id > this.lastEmittedId) {
        this.lastEmittedId = m.id
        this.emit('message_received', m)
      }
    }
    const current = new Map(s.members.map((m) => [m.nickname_key, this.publicMember(m)]))
    for (const [key, m] of current) {
      if (!this.known.has(key)) {
        this.known.set(key, m)
        this.emit('member_joined', m)
      }
    }
    for (const key of Array.from(this.known.keys())) {
      if (!current.has(key)) {
        this.known.delete(key)
        this.emit('member_left', key)
      }
    }
  }

  private publicMember(m: StoredMember): Member {
    return { nickname_key: m.nickname_key, nickname: m.nickname, joined_at: m.joined_at }
  }

  // ---------- 指令 ----------

  async join(nickname: string): Promise<JoinResult> {
    await sleep(this.opts.latencyMs)
    if (this.unavailable || this.offline) return { ok: false, reason: 'unavailable' }
    const check = checkNickname(nickname)
    if (!check.ok) return { ok: false, reason: 'invalid' }
    const result = this.claim(check.nickname, check.key)
    if (!result.ok) return result
    this.session = { nickname: check.nickname, key: check.key }
    // 之後才發生的事才算「事件」，之前的歷史由 loadRecent 讀。
    const s = this.read()
    this.lastEmittedId = s.messages.at(-1)?.id ?? 0
    this.known = new Map(s.members.map((m) => [m.nickname_key, this.publicMember(m)]))
    this.heartbeatTimer ??= setInterval(() => this.heartbeat(), this.opts.heartbeatMs)
    return { ok: true }
  }

  /** 對應資料庫的 join_room：先清過期成員，再判斷代號能不能用。 */
  private claim(nickname: string, key: string): JoinResult {
    return this.mutate((s) => {
      this.sweepState(s)
      const existing = s.members.find((m) => m.nickname_key === key)
      if (existing) {
        if (existing.secret !== this.secret) return { ok: false, reason: 'taken' } as const
        // 同一個分頁重新整理或重新連線：直接接手，不產生進出提示。
        existing.last_seen = this.now()
        return { ok: true } as const
      }
      s.members.push({
        nickname_key: key,
        nickname,
        joined_at: this.iso(),
        secret: this.secret,
        last_seen: this.now(),
      })
      this.push(s, 'join', nickname, null)
      return { ok: true } as const
    })
  }

  async leave(): Promise<void> {
    const session = this.session
    this.stopSession()
    if (!session) return
    this.mutate((s) => {
      const mine = s.members.find((m) => m.nickname_key === session.key && m.secret === this.secret)
      if (!mine) return
      s.members = s.members.filter((m) => m !== mine)
      this.push(s, 'leave', mine.nickname, null)
    })
  }

  private stopSession() {
    this.session = null
    this.known.clear()
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = null
  }

  async send(body: string): Promise<SendResult> {
    await sleep(this.opts.latencyMs)
    if (this.unavailable || this.offline) return { ok: false, reason: 'unavailable' }
    const session = this.session
    if (!session) return { ok: false, reason: 'not_member' }
    const check = checkMessage(body)
    if (!check.ok) return { ok: false, reason: check.reason }
    // 發言者的代號由「資料庫」從成員資料取得，不採用前端傳來的名字。
    return this.mutate((s): SendResult => {
      const mine = s.members.find((m) => m.nickname_key === session.key && m.secret === this.secret)
      if (!mine) return { ok: false, reason: 'not_member' }
      mine.last_seen = this.now()
      this.push(s, 'chat', mine.nickname, check.body)
      return { ok: true }
    })
  }

  async loadRecent(limit: number): Promise<Message[]> {
    return this.read().messages.slice(-limit)
  }

  async loadSince(lastId: number): Promise<Message[]> {
    return this.read().messages.filter((m) => m.id > lastId)
  }

  async loadMembers(): Promise<Member[]> {
    return this.read()
      .members.map((m) => this.publicMember(m))
      .sort((a, b) => a.joined_at.localeCompare(b.joined_at) || a.nickname_key.localeCompare(b.nickname_key))
  }

  // ---------- 心跳與重新連線 ----------

  /** 每 10 秒告訴資料庫「我還在」。如果已經被清掃掉了，嘗試重新加入。 */
  heartbeat() {
    if (!this.session || this.offline || this.unavailable) return
    const { nickname, key } = this.session
    const result = this.claim(nickname, key)
    if (!result.ok) this.loseSession('taken')
  }

  private loseSession(reason: 'taken' | 'not_member') {
    this.stopSession()
    this.emit('session_lost', reason)
  }

  private setOffline(offline: boolean) {
    if (this.offline === offline) return
    this.offline = offline
    const state: ConnectionState = offline ? 'reconnecting' : 'online'
    if (offline) {
      this.emit('connection_changed', state)
      return
    }
    if (this.session) {
      // 連回來：用同一組暗碼重新加入。30 秒內是無聲接手；超過就是重新加入；代號被別人拿走就失去資格。
      const { nickname, key } = this.session
      const result = this.claim(nickname, key)
      if (!result.ok) {
        this.offline = false
        this.loseSession('taken')
        return
      }
      this.sync()
    }
    this.emit('connection_changed', state)
  }

  readonly dev: DevControls = {
    setOffline: (offline) => this.setOffline(offline),
    setUnavailable: (unavailable) => {
      this.unavailable = unavailable
    },
    reset: () => {
      this.storage.removeItem(STATE_KEY)
      this.channel?.postMessage('changed')
    },
  }

  // ---------- 示範用的假成員 ----------

  /**
   * 同一個瀏覽器開很多分頁時，只讓其中一個分頁負責讓假成員說話（用 Web Locks 選出來）。
   * 那個分頁關掉後，鎖會自動交給下一個分頁。
   */
  private startBots() {
    if (typeof navigator === 'undefined' || !navigator.locks) return
    void navigator.locks.request(BOT_LOCK, () => {
      return new Promise<void>(() => {
        // 拿到鎖就一直持有，直到這個分頁被關掉。
        this.runBots()
      })
    })
  }

  private runBots() {
    this.mutate((s) => {
      for (const name of BOT_NAMES) {
        const key = nicknameKey(name)
        if (!s.members.some((m) => m.nickname_key === key)) {
          s.members.push({
            nickname_key: key,
            nickname: name,
            joined_at: this.iso(this.now() - 60 * 60_000),
            secret: `bot-${key}`,
            last_seen: this.now(),
            bot: true,
          })
        }
      }
      if (!s.seeded) {
        s.seeded = true
        const t = this.now()
        this.push(s, 'chat', BOT_NAMES[0], '大家好，這裡是示範用的訊息', t - 12 * 60_000)
        this.push(s, 'chat', BOT_NAMES[1], '這個聊天室不用登入就能用', t - 9 * 60_000)
        this.push(s, 'chat', BOT_NAMES[2], '試試看開第二個分頁，輸入同一個代號', t - 5 * 60_000)
      }
    })
    const talk = () => {
      this.mutate((s) => {
        const name = BOT_NAMES[this.botLineIndex % BOT_NAMES.length]
        const line = BOT_LINES[this.botLineIndex % BOT_LINES.length]
        this.botLineIndex += 1
        this.push(s, 'chat', name, line)
      })
      this.botTimer = setTimeout(talk, 25_000 + Math.random() * 25_000)
    }
    this.botTimer = setTimeout(talk, 15_000 + Math.random() * 10_000)
  }

  /** 測試或關閉時清理計時器。 */
  destroy() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    if (this.sweepTimer) clearInterval(this.sweepTimer)
    if (this.botTimer) clearTimeout(this.botTimer)
    this.channel?.close()
    document.removeEventListener('visibilitychange', this.onVisibility)
  }
}
