import { SvgIcon } from '../ui/GameIcon'

export default function LocalHandoff({ name, onReveal }) {
  return <div className="local-handoff">
    <button type="button" className="local-handoff__reveal ui-button"
      aria-label={`Reveal ${name}’s hand`} title="Pass the device or look away, then reveal"
      onClick={onReveal}>
      <SvgIcon name="eye" />
      <span>{name}’s turn</span>
    </button>
  </div>
}
