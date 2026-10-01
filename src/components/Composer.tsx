import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { MESSAGE_MAX } from '../config'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { charLength, checkMessage } from '../lib/nickname'
import { T } from '../text'
import type { SendResult } from '../backend/types'
import { Icon } from './Icon'

const SEND_ERRORS: Record<string, string> = {
  too_long: T.errSendTooLong,
  not_member: T.errSendNotMember,
  unavailable: T.errSendUnavailable,
  empty: '',
}

interface Props {
  locked: boolean // 斷線時鎖住，但保留已打的字
  showHint: boolean // 電腦版才顯示「Enter 送出」的提示
  onSend: (body: string) => Promise<SendResult>
}

export function Composer({ locked, showHint, onSend }: Props) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)
  // 觸控裝置（手機、平板）的 Enter 是換行，用旁邊的按鈕送出。
  const touch = useMediaQuery('(hover: none) and (pointer: coarse)')

  const count = charLength(text.trim())
  const over = count > MESSAGE_MAX
  const canSend = !locked && !sending && count > 0 && !over

  // 文字框隨內容長高（有上限，超過就在裡面捲動）。
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [text])

  useEffect(() => {
    if (!locked) ref.current?.focus({ preventScroll: true })
  }, [locked])

  const submit = async () => {
    const check = checkMessage(text)
    if (!check.ok || locked || sending) return
    setSending(true)
    setError('')
    const result = await onSend(check.body)
    setSending(false)
    if (result.ok) {
      setText('')
      ref.current?.focus({ preventScroll: true })
    } else {
      setError(SEND_ERRORS[result.reason] ?? '')
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || touch) return
    // 中文輸入法選字時按 Enter 是「確認選字」，不能當成送出。
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    e.preventDefault()
    void submit()
  }

  const counterClass = over ? 'counter counter--over' : count >= 450 ? 'counter counter--warn' : 'counter'

  return (
    <div className="composer">
      {error && (
        <p className="composer__error" role="alert">
          <Icon name="alert" size={16} />
          {error}
        </p>
      )}
      <div className="composer__row">
        <label className={`composer__box${over ? ' composer__box--over' : ''}${locked ? ' composer__box--locked' : ''}`}>
          <span className="sr-only">{T.composerLabel}</span>
          <textarea
            ref={ref}
            rows={1}
            value={text}
            disabled={locked}
            placeholder={T.composerPlaceholder}
            enterKeyHint="enter"
            onChange={(e) => {
              setText(e.target.value)
              if (error) setError('')
            }}
            onKeyDown={onKeyDown}
          />
          <span className={counterClass} aria-live="off">
            {count} / {MESSAGE_MAX}
          </span>
        </label>
        <button type="button" className="sendbtn" aria-label={T.send} disabled={!canSend} onClick={() => void submit()}>
          <Icon name="send" size={20} />
        </button>
      </div>
      {showHint && <p className="composer__hint">{T.composerHint}</p>}
    </div>
  )
}
