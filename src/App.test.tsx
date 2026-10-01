// 冒煙測試：整個畫面能渲染，輸入代號後能進入聊天室並送出一則訊息。
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

beforeAll(() => {
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
  globalThis.ResizeObserver ??= class {
    observe() {}
    disconnect() {}
    unobserve() {}
  } as unknown as typeof ResizeObserver
})

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function waitFor(check: () => boolean, ms = 3000) {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > ms) throw new Error('等太久了')
    await act(async () => {
      await wait(20)
    })
  }
}

function setValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

let container: HTMLDivElement | null = null
afterEach(() => {
  container?.remove()
  container = null
  window.localStorage.clear()
})

describe('App', () => {
  it('輸入代號 → 進入聊天室 → 送出訊息 → 離開', async () => {
    const { default: App } = await import('./App')
    container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(<App />)
    })

    // 畫面 A
    expect(container.textContent).toContain('匿名聊天室')
    const input = container.querySelector<HTMLInputElement>('#nickname')!
    const submit = container.querySelector<HTMLButtonElement>('button[type="submit"]')!
    expect(submit.disabled).toBe(true) // 空白時不能按

    await act(async () => setValue(input, '一二三四五六七八九十甲乙丙'))
    expect(container.textContent).toContain('代號最多 12 個字')
    expect(submit.disabled).toBe(true)

    await act(async () => setValue(input, '小明'))
    expect(submit.disabled).toBe(false)
    await act(async () => {
      submit.click()
    })

    // 畫面 B
    await waitFor(() => container!.querySelector('.chat') !== null)
    expect(container.textContent).toContain('只保留最近的 200 則訊息')
    await waitFor(() => (container!.textContent ?? '').includes('小明 加入了聊天室'))
    expect(container.textContent).toContain('目前 1 人在線')

    const textarea = container.querySelector<HTMLTextAreaElement>('textarea')!
    const send = container.querySelector<HTMLButtonElement>('.sendbtn')!
    expect(send.disabled).toBe(true)
    await act(async () => setValue(textarea, '哈囉大家'))
    expect(send.disabled).toBe(false)
    await act(async () => {
      send.click()
    })
    await waitFor(() => (container!.querySelector('.bubble--mine')?.textContent ?? '') === '哈囉大家')
    expect(textarea.value).toBe('')

    // 離開 → 回到畫面 A，代號預先填好
    const leave = container.querySelector<HTMLButtonElement>('.leave')!
    await act(async () => {
      leave.click()
    })
    await waitFor(() => container!.querySelector('#nickname') !== null)
    expect(container.querySelector<HTMLInputElement>('#nickname')!.value).toBe('小明')

    await act(async () => root.unmount())
  })
})
