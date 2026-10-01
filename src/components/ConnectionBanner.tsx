import { T } from '../text'
import { Icon } from './Icon'

export function ConnectionBanner() {
  return (
    <div className="banner" role="status">
      <Icon name="spin" size={18} className="spin" />
      {T.reconnecting}
    </div>
  )
}
