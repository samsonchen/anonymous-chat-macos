import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { buildItems } from '../lib/chatItems'
import { nameColor } from '../lib/color'
import { nicknameKey } from '../lib/nickname'
import { formatTime } from '../lib/time'
import { T } from '../text'
import type { Message } from '../backend/types'
import { Icon } from './Icon'

const NEAR_BOTTOM_PX = 48

/** 訊息氣泡。內容太高時收合，避免有人用大量換行讓一則訊息佔滿整個畫面。 */
function Bubble({ body, mine }: { body: string; mine: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [overflowing, setOverflowing] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (el && !expanded) setOverflowing(el.scrollHeight > el.clientHeight + 1)
  }, [body, expanded])
  return (
    <div className={mine ? 'bubble bubble--mine' : 'bubble'}>
      <div ref={ref} className={expanded ? 'bubble__text' : 'bubble__text bubble__text--clamped'}>
        {body}
      </div>
      {(overflowing || expanded) && (
        <button type="button" className="bubble__toggle" onClick={() => setExpanded(!expanded)}>
          {expanded ? T.showLess : T.showAll}
        </button>
      )}
    </div>
  )
}

export function MessageList({ messages, myNickname }: { messages: Message[]; myNickname: string }) {
  const items = useMemo(() => buildItems(messages, myNickname), [messages, myNickname])
  const myKey = nicknameKey(myNickname)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)
  const prevLastIdRef = useRef<number | null>(null)
  const [hasNew, setHasNew] = useState(false)

  const last = messages.at(-1)
  const lastId = last?.id ?? null
  const lastIsMine = last?.kind === 'chat' && nicknameKey(last.nickname) === myKey

  const scrollToBottom = () => {
    const el = scrollerRef.current
    if (el) el.scrollTop = el.scrollHeight
  }

  // 在底部時，新訊息自動捲到最新；正在往上看舊訊息時，不強制跳走，改顯示「有新訊息」。
  useLayoutEffect(() => {
    const prev = prevLastIdRef.current
    prevLastIdRef.current = lastId
    if (prev === null) {
      scrollToBottom()
      return
    }
    if (lastId === prev) return
    if (atBottomRef.current || lastIsMine) {
      scrollToBottom()
      setHasNew(false)
    } else {
      setHasNew(true)
    }
  }, [lastId, lastIsMine])

  // 手機鍵盤跳出來、視窗大小改變時，如果原本在底部就維持在底部。
  useLayoutEffect(() => {
    const el = scrollerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      if (atBottomRef.current) scrollToBottom()
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const onScroll = () => {
    const el = scrollerRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX
    atBottomRef.current = atBottom
    if (atBottom) setHasNew(false)
  }

  return (
    <div className="messages">
      <div
        className="messages__scroller"
        ref={scrollerRef}
        onScroll={onScroll}
        role="log"
        aria-live="polite"
        aria-label={T.appName}
        tabIndex={0}
      >
        <div className="messages__inner">
          <p className="messages__note">{T.retention}</p>
          {items.map((item) => {
            if (item.type === 'date') {
              return (
                <div key={item.key} className="datesep" role="separator">
                  <span>{item.label}</span>
                </div>
              )
            }
            if (item.type === 'system') {
              return (
                <p key={item.key} className="sysline">
                  {item.text}
                </p>
              )
            }
            return (
              <div key={item.key} className={item.mine ? 'group group--mine' : 'group'}>
                <div className="group__name" style={{ color: item.mine ? 'var(--self-name)' : nameColor(item.nickname) }}>
                  {item.nickname}
                </div>
                {item.messages.map((m) => (
                  <div key={m.id} className="msgrow">
                    {item.mine && <time className="msgrow__time">{formatTime(m.created_at)}</time>}
                    <Bubble body={m.body ?? ''} mine={item.mine} />
                    {!item.mine && <time className="msgrow__time">{formatTime(m.created_at)}</time>}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>
      {hasNew && (
        <button
          type="button"
          className="newbtn"
          onClick={() => {
            scrollToBottom()
            setHasNew(false)
          }}
        >
          <Icon name="arrowdown" size={18} />
          {T.newMessages}
        </button>
      )}
    </div>
  )
}
