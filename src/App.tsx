import { useState } from 'react'
import { backend } from './backend'
import { DevPanel } from './components/DevPanel'
import { ChatScreen } from './screens/ChatScreen'
import { JoinScreen } from './screens/JoinScreen'

type Screen = { name: 'join'; lostNotice: boolean } | { name: 'chat'; nickname: string }

const showDev = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('dev')

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'join', lostNotice: false })
  return (
    <>
      {screen.name === 'join' ? (
        <JoinScreen
          backend={backend}
          lostNotice={screen.lostNotice}
          onJoined={(nickname) => setScreen({ name: 'chat', nickname })}
        />
      ) : (
        <ChatScreen
          backend={backend}
          nickname={screen.nickname}
          onLeft={() => setScreen({ name: 'join', lostNotice: false })}
          onSessionLost={() => setScreen({ name: 'join', lostNotice: true })}
        />
      )}
      {showDev && backend.dev && <DevPanel dev={backend.dev} />}
    </>
  )
}
