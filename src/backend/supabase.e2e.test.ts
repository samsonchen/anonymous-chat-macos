// @vitest-environment node
// 真的連到 Supabase 的端對端測試。平常 npm test 不會跑（會留下測試用的訊息），要跑的時候：
//   SUPABASE_E2E=1 SUPABASE_E2E_URL=... SUPABASE_E2E_KEY=... npx vitest run src/backend/supabase.e2e.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { SupabaseBackend } from './supabase'
import type { Member, Message } from './types'

const url = process.env.SUPABASE_E2E_URL ?? ''
const key = process.env.SUPABASE_E2E_KEY ?? ''
const enabled = Boolean(process.env.SUPABASE_E2E && url && key)

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function until(check: () => boolean, ms = 8000) {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > ms) throw new Error('等太久了')
    await wait(100)
  }
}

describe.skipIf(!enabled)('SupabaseBackend（真的連到 Supabase）', { timeout: 30_000 }, () => {
  // describe 的內容即使被略過也會執行，所以連線物件要等到真的要跑時才建立。
  let a: SupabaseBackend
  let b: SupabaseBackend
  let c: SupabaseBackend
  beforeAll(() => {
    const make = (secret: string) => new SupabaseBackend(url, key, { tabSecret: secret, heartbeatMs: 5000 })
    a = make('e2e-secret-aaaa')
    b = make('e2e-secret-bbbb')
    c = make('e2e-secret-cccc')
  })
  const received: Message[] = []
  const joined: Member[] = []
  const left: string[] = []

  afterAll(async () => {
    await a.leave()
    await b.leave()
    await c.leave()
  })

  it('進入、重複代號被擋、即時收到別人的進出與訊息', async () => {
    expect(await a.join('整合A')).toEqual({ ok: true })
    a.on('message_received', (m) => received.push(m))
    a.on('member_joined', (m) => joined.push(m))
    a.on('member_left', (k) => left.push(k))

    expect(await c.join('整合a')).toEqual({ ok: false, reason: 'taken' })
    expect(await b.join('整合B')).toEqual({ ok: true })
    await until(() => joined.some((m) => m.nickname === '整合B'))
    await until(() => received.some((m) => m.kind === 'join' && m.nickname === '整合B'))

    expect(await b.send('  即時測試  ')).toEqual({ ok: true })
    await until(() => received.some((m) => m.kind === 'chat' && m.body === '即時測試'))
    const members = await a.loadMembers()
    expect(members.map((m) => m.nickname)).toEqual(expect.arrayContaining(['整合A', '整合B']))
  })

  it('loadRecent 與 loadSince', async () => {
    const recent = await a.loadRecent(50)
    expect(recent.length).toBeGreaterThan(0)
    const lastId = recent.at(-1)!.id
    await b.send('第二則')
    await until(() => received.some((m) => m.body === '第二則'))
    const since = await a.loadSince(lastId)
    expect(since.map((m) => m.body)).toContain('第二則')
  })

  it('按離開：對方立刻收到離開提示，代號釋出', async () => {
    await b.leave()
    await until(() => left.includes('整合b'))
    await until(() => received.some((m) => m.kind === 'leave' && m.nickname === '整合B'))
    expect(await c.join('整合B')).toEqual({ ok: true })
    await c.leave()
  })

  it('直接關掉分頁：約 30 秒後被清掃，離開提示出現（驗證 pg_cron）', async () => {
    const d = new SupabaseBackend(url, key, { tabSecret: 'e2e-secret-dddd', heartbeatMs: 5000 })
    expect(await d.join('整合D')).toEqual({ ok: true })
    await until(() => joined.some((m) => m.nickname === '整合D'))
    const closedAt = Date.now()
    await d.destroy()
    await until(() => left.includes('整合d'), 75_000)
    const seconds = Math.round((Date.now() - closedAt) / 1000)
    console.log(`關掉分頁後 ${seconds} 秒，其他人收到離開提示`)
    expect(seconds).toBeGreaterThanOrEqual(25)
  }, 90_000)
})
