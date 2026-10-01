import { useEffect, useState } from 'react'
import type { ChatBackend, SessionLostReason } from '../backend/types'
import { Composer } from '../components/Composer'
import { ConnectionBanner } from '../components/ConnectionBanner'
import { Header } from '../components/Header'
import { MemberDrawer, MemberSidebar } from '../components/MemberList'
import { MessageList } from '../components/MessageList'
import { MOBILE_QUERY, useMediaQuery } from '../hooks/useMediaQuery'
import { useChatRoom } from '../hooks/useChatRoom'

interface Props {
  backend: ChatBackend
  nickname: string
  onLeft: () => void
  onSessionLost: (reason: SessionLostReason) => void
}

export function ChatScreen({ backend, nickname, onLeft, onSessionLost }: Props) {
  const mobile = useMediaQuery(MOBILE_QUERY)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { messages, members, connection } = useChatRoom(backend, onSessionLost)

  // 切到電腦版面時名單改成側邊欄，抽屜要收起來。
  useEffect(() => {
    if (!mobile) setDrawerOpen(false)
  }, [mobile])

  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  const leave = async () => {
    await backend.leave()
    onLeft()
  }

  return (
    <div className="chat">
      <Header
        count={members.length}
        mobile={mobile}
        drawerOpen={drawerOpen}
        onToggleDrawer={() => setDrawerOpen((open) => !open)}
        onLeave={leave}
      />
      <div className="chat__body">
        <div className="chat__main">
          {connection === 'reconnecting' && <ConnectionBanner />}
          <MessageList messages={messages} myNickname={nickname} />
          <Composer
            locked={connection === 'reconnecting'}
            showHint={!mobile}
            onSend={(body) => backend.send(body)}
          />
        </div>
        {!mobile && <MemberSidebar members={members} myNickname={nickname} />}
      </div>
      {mobile && drawerOpen && (
        <MemberDrawer members={members} myNickname={nickname} onClose={() => setDrawerOpen(false)} />
      )}
    </div>
  )
}
