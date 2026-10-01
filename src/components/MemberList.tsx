import { nameColor } from '../lib/color'
import { nicknameKey } from '../lib/nickname'
import { T } from '../text'
import type { Member } from '../backend/types'

export function MemberList({ members, myNickname }: { members: Member[]; myNickname: string }) {
  const myKey = nicknameKey(myNickname)
  return (
    <ul className="members">
      {members.map((m) => {
        const mine = m.nickname_key === myKey
        return (
          <li key={m.nickname_key} className={mine ? 'members__item members__item--me' : 'members__item'}>
            <span
              className="avatar"
              style={{ background: mine ? 'var(--primary)' : nameColor(m.nickname) }}
              aria-hidden="true"
            >
              {Array.from(m.nickname)[0]}
            </span>
            <span className="members__name">{m.nickname}</span>
            {mine && <span className="members__you">{T.you}</span>}
          </li>
        )
      })}
    </ul>
  )
}

export function MemberSidebar({ members, myNickname }: { members: Member[]; myNickname: string }) {
  return (
    <aside className="sidebar" aria-label={T.membersTitle}>
      <div className="sidebar__head">
        <h2>{T.membersTitle}</h2>
        <span>{T.membersCount(members.length)}</span>
      </div>
      <MemberList members={members} myNickname={myNickname} />
    </aside>
  )
}

export function MemberDrawer({
  members,
  myNickname,
  onClose,
}: {
  members: Member[]
  myNickname: string
  onClose: () => void
}) {
  return (
    <>
      <button type="button" className="scrim" aria-label={T.collapseMembers} tabIndex={-1} onClick={onClose} />
      <section className="drawer" id="member-drawer" aria-label={T.membersTitle}>
        <div className="sidebar__head">
          <h2>{T.membersTitle}</h2>
          <span>{T.membersCount(members.length)}</span>
        </div>
        <MemberList members={members} myNickname={myNickname} />
        <button type="button" className="drawer__close" onClick={onClose}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="18 15 12 9 6 15" />
          </svg>
          {T.collapseMembers}
        </button>
      </section>
    </>
  )
}
