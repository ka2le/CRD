import './CardButton.css'
import CardVisual from './CardVisual'

export default function CardButton({
  card,
  hidden = false,
  selected = false,
  active = false,
  masked = false,
  animationState = '',
  onToggle,
  disabled = false,
  targetable = false,
  battleValue = 0,
}) {
  if (!card) return null

  const image = card.images?.[card.imageIndex ?? 0] ?? card.images?.[0]
  const isDisabled = disabled || !onToggle

  return (
    <button
      type="button"
      className={[
        'card-button',
        selected ? 'card-button--selected' : '',
        hidden ? 'card-button--back' : '',
        active ? 'card-button--active' : '',
        masked ? 'card-button--masked' : '',
        targetable ? 'card-button--copy-targetable' : '',
        animationState ? `card-button--${animationState}` : '',
      ].filter(Boolean).join(' ')}
      onClick={() => onToggle?.(card.uid)}
      disabled={isDisabled}
      data-card-uid={card.uid}
    >
      <div className="card-button__image-wrap">
        {hidden ? (
          <CardVisual card={card} hidden />
        ) : image ? (
          <CardVisual card={card} />
        ) : (
          <div className="card-visual__placeholder" />
        )}
        {!hidden && battleValue > 0 ? <div className="card-button__battle-value">{battleValue}</div> : null}
      </div>
    </button>
  )
}
