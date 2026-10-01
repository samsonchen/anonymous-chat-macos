import { T } from '../text'
import { Icon, Logo } from './Icon'

interface Props {
  count: number
  mobile: boolean
  drawerOpen: boolean
  onToggleDrawer: () => void
  onLeave: () => void
}

export function Header({ count, mobile, drawerOpen, onToggleDrawer, onLeave }: Props) {
  return (
    <header className="header">
      <Logo size={mobile ? 32 : 40} />
      <div className="header__title">
        <h1>{T.appName}</h1>
        {!mobile && <p>{T.tagline}</p>}
      </div>
      <div className="header__spacer" />
      {mobile ? (
        <button
          type="button"
          className="pill pill--button"
          aria-expanded={drawerOpen}
          aria-controls="member-drawer"
          aria-label={`${T.onlineMobile(count)}，${drawerOpen ? T.collapseMembers : T.expandMembers}`}
          onClick={onToggleDrawer}
        >
          <span className="pill__dot" aria-hidden="true" />
          {T.onlineMobile(count)}
          <Icon name={drawerOpen ? 'up' : 'down'} size={18} />
        </button>
      ) : (
        <div className="pill" role="status">
          <span className="pill__dot" aria-hidden="true" />
          {T.onlineDesktop(count)}
        </div>
      )}
      <button type="button" className="leave" onClick={onLeave}>
        <Icon name="logout" size={18} />
        {T.leave}
      </button>
    </header>
  )
}
