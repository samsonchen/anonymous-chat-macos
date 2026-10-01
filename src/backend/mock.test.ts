import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MockBackend } from './mock'
import type { Message } from './types'

class MemoryStorage implements Storage {
  private data = new Map<string, string>()
  get length() {
    return this.data.size
  }
  clear() {
    this.data.clear()
  }
  getItem(k: string) {
    return this.data.get(k) ?? null
  }
  key(i: number) {
    return Array.from(this.data.keys())[i] ?? null
  }
  removeItem(k: string) {
    this.data.delete(k)
  }
  setItem(k: string, v: string) {
    this.data.set(k, v)
  }
}

/** 同一個 storage 上開多個「分頁」，各自有不同的暗碼。 */
function setup() {
  const storage = new MemoryStorage()
  const open = (secret: string) =>
    new MockBackend({ storage, tabSecret: secret, autoStart: false, latencyMs: 0 })
  return { storage, open }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-01T08:00:00'))
})
afterEach(() => {
  vi.useRealTimers()
})

describe('MockBackend', () => {
  it('代號不重複：另一個分頁用同一個代號被擋（大小寫視為相同）', async () => {
    const { open } = setup()
    const a = open('tab-a')
    const b = open('tab-b')
    expect(await a.join('Amy')).toEqual({ ok: true })
    expect(await b.join('amy')).toEqual({ ok: false, reason: 'taken' })
    expect(await b.join('Leo')).toEqual({ ok: true })
  })

  it('同一個分頁重新整理（暗碼相同）可以接手，不產生進出提示', async () => {
    const { open } = setup()
    const first = open('tab-a')
    await first.join('Amy')
    const afterReload = open('tab-a')
    expect(await afterReload.join('Amy')).toEqual({ ok: true })
    const joins = (await afterReload.loadRecent(50)).filter((m) => m.kind === 'join')
    expect(joins).toHaveLength(1)
  })

  it('不合規則的代號回傳 invalid', async () => {
    const { open } = setup()
    expect(await open('t').join('   ')).toEqual({ ok: false, reason: 'invalid' })
  })

  it('送訊息：代號由後端決定；空白與過長被拒絕；沒加入時被拒絕', async () => {
    const { open } = setup()
    const a = open('tab-a')
    expect(await a.send('哈囉')).toEqual({ ok: false, reason: 'not_member' })
    await a.join('Amy')
    expect(await a.send('  哈囉  ')).toEqual({ ok: true })
    expect(await a.send('   ')).toEqual({ ok: false, reason: 'empty' })
    expect(await a.send('x'.repeat(501))).toEqual({ ok: false, reason: 'too_long' })
    const chat = (await a.loadRecent(50)).filter((m) => m.kind === 'chat')
    expect(chat).toHaveLength(1)
    expect(chat[0]).toMatchObject({ nickname: 'Amy', body: '哈囉' })
  })

  it('另一個分頁收到新訊息與名單變化的事件', async () => {
    const { open } = setup()
    const a = open('tab-a')
    const b = open('tab-b')
    await a.join('Amy')
    await b.join('Leo')
    a.sync()
    const received: Message[] = []
    const joined: string[] = []
    const left: string[] = []
    a.on('message_received', (m) => received.push(m))
    a.on('member_joined', (m) => joined.push(m.nickname))
    a.on('member_left', (k) => left.push(k))
    const c = open('tab-c')
    await c.join('小明')
    await b.send('嗨')
    a.sync()
    expect(joined).toEqual(['小明'])
    expect(received.map((m) => [m.kind, m.nickname, m.body])).toEqual([
      ['join', '小明', null],
      ['chat', 'Leo', '嗨'],
    ])
    await b.leave()
    a.sync()
    expect(left).toEqual(['leo'])
    expect(received.at(-1)).toMatchObject({ kind: 'leave', nickname: 'Leo' })
  })

  it('按離開會馬上釋出代號', async () => {
    const { open } = setup()
    const a = open('tab-a')
    await a.join('Amy')
    await a.leave()
    expect(await open('tab-b').join('Amy')).toEqual({ ok: true })
  })

  it('直接關掉分頁：超過 30 秒沒心跳被清掃，寫一則離開提示，代號釋出', async () => {
    const { open } = setup()
    const a = open('tab-a')
    const watcher = open('tab-w')
    await a.join('Amy')
    await watcher.join('Leo')
    const received: Message[] = []
    watcher.on('message_received', (m) => received.push(m))
    a.destroy() // 關掉分頁：不再回報心跳

    vi.advanceTimersByTime(29_000)
    watcher.sweep()
    expect((await watcher.loadMembers()).map((m) => m.nickname)).toContain('Amy')

    vi.advanceTimersByTime(2_000) // 共 31 秒
    watcher.sweep()
    expect((await watcher.loadMembers()).map((m) => m.nickname)).not.toContain('Amy')
    expect(received.map((m) => [m.kind, m.nickname])).toContainEqual(['leave', 'Amy'])
    expect(await open('tab-b').join('Amy')).toEqual({ ok: true })
  })

  it('只保留最近 200 則', async () => {
    const { open } = setup()
    const a = open('tab-a')
    await a.join('Amy')
    for (let i = 0; i < 230; i++) await a.send(`訊息 ${i}`)
    const all = await a.loadSince(0)
    expect(all).toHaveLength(200)
    expect(all.at(-1)?.body).toBe('訊息 229')
  })

  it('loadSince 只回傳比指定 id 新的訊息', async () => {
    const { open } = setup()
    const a = open('tab-a')
    await a.join('Amy')
    await a.send('一')
    const [first] = (await a.loadRecent(50)).filter((m) => m.kind === 'chat')
    await a.send('二')
    const later = await a.loadSince(first.id)
    expect(later.map((m) => m.body)).toEqual(['二'])
  })

  describe('斷線', () => {
    it('30 秒內連回來：無聲接手，不產生進出提示', async () => {
      const { open } = setup()
      const a = open('tab-a')
      const b = open('tab-b')
      await a.join('Amy')
      await b.join('Leo')
      const states: string[] = []
      a.on('connection_changed', (s) => states.push(s))

      a.dev.setOffline(true)
      vi.advanceTimersByTime(10_000)
      expect(await a.send('x')).toEqual({ ok: false, reason: 'unavailable' })
      a.dev.setOffline(false)

      expect(states).toEqual(['reconnecting', 'online'])
      const kinds = (await b.loadRecent(50)).filter((m) => m.nickname === 'Amy').map((m) => m.kind)
      expect(kinds).toEqual(['join'])
    })

    it('超過 30 秒才連回來：被清掃後重新加入，會有離開與加入提示', async () => {
      const { open } = setup()
      const a = open('tab-a')
      const b = open('tab-b')
      await a.join('Amy')
      await b.join('Leo')
      a.dev.setOffline(true)
      vi.advanceTimersByTime(40_000)
      b.sweep()
      a.dev.setOffline(false)
      const kinds = (await b.loadRecent(50)).filter((m) => m.nickname === 'Amy').map((m) => m.kind)
      expect(kinds).toEqual(['join', 'leave', 'join'])
    })

    it('斷線期間代號被別人用掉：失去資格', async () => {
      const { open } = setup()
      const a = open('tab-a')
      const b = open('tab-b')
      await a.join('Amy')
      await b.join('Leo')
      const lost: string[] = []
      a.on('session_lost', (r) => lost.push(r))
      a.dev.setOffline(true)
      vi.advanceTimersByTime(40_000)
      b.sweep()
      expect(await open('tab-c').join('Amy')).toEqual({ ok: true })
      a.dev.setOffline(false)
      expect(lost).toEqual(['taken'])
    })
  })

  it('模擬無法連線：進入時回傳 unavailable', async () => {
    const { open } = setup()
    const a = open('tab-a')
    a.dev.setUnavailable(true)
    expect(await a.join('Amy')).toEqual({ ok: false, reason: 'unavailable' })
    a.dev.setUnavailable(false)
    expect(await a.join('Amy')).toEqual({ ok: true })
  })
})
