import { useState } from 'react'
import type { DevControls } from '../backend/types'

/** 階段一的測試面板。網址加上 ?dev=1 才會出現，一般使用者看不到。 */
export function DevPanel({ dev }: { dev: DevControls }) {
  const [open, setOpen] = useState(false)
  const [offline, setOffline] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  return (
    <div className="dev">
      <button type="button" className="dev__toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        測試工具
      </button>
      {open && (
        <div className="dev__panel">
          <button
            type="button"
            onClick={() => {
              dev.setOffline(!offline)
              setOffline(!offline)
            }}
          >
            {offline ? '恢復連線' : '模擬斷線'}
          </button>
          <button
            type="button"
            onClick={() => {
              dev.setUnavailable(!unavailable)
              setUnavailable(!unavailable)
            }}
          >
            {unavailable ? '恢復服務（可以進入）' : '模擬無法連線（進入時）'}
          </button>
          <button
            type="button"
            onClick={() => {
              dev.reset()
              window.location.reload()
            }}
          >
            清除示範資料並重新整理
          </button>
        </div>
      )}
    </div>
  )
}
