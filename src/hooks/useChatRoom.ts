import { useCallback, useEffect, useRef, useState } from 'react'
import { KEEP_COUNT, RECENT_COUNT } from '../config'
import type { ChatBackend, ConnectionState, Member, Message, SessionLostReason } from '../backend/types'

/**
 * 聊天室的資料：訊息、線上名單、連線狀態。
 * 進入流程依架構文件 6.1：先開始監聽，再讀最近 50 則與名單（避免兩步之間漏掉訊息，重複的用 id 去掉）。
 * 斷線重連依 6.4：連回來後補漏掉的訊息並重讀名單。
 */
export function useChatRoom(backend: ChatBackend, onSessionLost: (reason: SessionLostReason) => void) {
  const [messages, setMessages] = useState<Message[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [connection, setConnection] = useState<ConnectionState>('online')
  const [loaded, setLoaded] = useState(false)
  const lastIdRef = useRef(0)
  const lostRef = useRef(onSessionLost)
  lostRef.current = onSessionLost

  const merge = useCallback((incoming: Message[]) => {
    if (incoming.length === 0) return
    lastIdRef.current = Math.max(lastIdRef.current, ...incoming.map((m) => m.id))
    setMessages((prev) => {
      const byId = new Map(prev.map((m) => [m.id, m]))
      for (const m of incoming) byId.set(m.id, m)
      return [...byId.values()].sort((a, b) => a.id - b.id).slice(-KEEP_COUNT)
    })
  }, [])

  useEffect(() => {
    let alive = true
    const refresh = async () => {
      const [missed, list] = await Promise.all([backend.loadSince(lastIdRef.current), backend.loadMembers()])
      if (!alive) return
      merge(missed)
      setMembers(list)
    }
    const offs = [
      backend.on('message_received', (m) => merge([m])),
      backend.on('member_joined', (m) =>
        setMembers((prev) => (prev.some((p) => p.nickname_key === m.nickname_key) ? prev : [...prev, m])),
      ),
      backend.on('member_left', (key) => setMembers((prev) => prev.filter((p) => p.nickname_key !== key))),
      backend.on('connection_changed', (state) => {
        setConnection(state)
        if (state === 'online') void refresh()
      }),
      backend.on('session_lost', (reason) => lostRef.current(reason)),
    ]
    void (async () => {
      const [recent, list] = await Promise.all([backend.loadRecent(RECENT_COUNT), backend.loadMembers()])
      if (!alive) return
      merge(recent)
      setMembers(list)
      setLoaded(true)
    })()
    return () => {
      alive = false
      offs.forEach((off) => off())
    }
  }, [backend, merge])

  return { messages, members, connection, loaded }
}
