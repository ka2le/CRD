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
  tooltip = '',
}) {
  if (!card) return null

  const image = card.images?.[card.imageIndex ?? 0] ?? card.images?.[0]
  const isDisabled = disabled || !onToggle
  const isNativeDisabled = card.uid === '__dummy_card__'
  const tooltipLabel = typeof tooltip === 'string' ? tooltip : (tooltip?.ariaLabel ?? tooltip?.text ?? '')

  function handleClick() {
    if (isDisabled) return
    onToggle?.(card.uid)
  }

  return (
    <button
      type="button"
      className={[
        'card-button',
        selected ? 'card-button--selected' : '',
        hidden ? 'card-button--back' : '',
        active ? 'card-button--active' : '',
        masked ? 'card-button--masked' : '',
        isDisabled ? 'card-button--disabled' : '',
        targetable ? 'card-button--copy-targetable' : '',
        animationState ? `card-button--${animationState}` : '',
      ].filter(Boolean).join(' ')}
      onClick={handleClick}
      disabled={isNativeDisabled}
      aria-disabled={isDisabled}
      data-card-uid={card.uid}
      data-tooltip={tooltipLabel}
      aria-label={tooltipLabel ? `${card.name}. ${tooltipLabel}` : card.name}
      title={tooltipLabel}
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
      {!hidden && tooltip ? (
        <span className="card-button__tooltip">
          {typeof tooltip === 'string' ? tooltip : (
            <>
              <span>{tooltip.text}</span>
              <img src={tooltip.icon} alt={tooltip.alt ?? ''} className="card-button__tooltip-icon" />
            </>
          )}
        </span>
      ) : null}
    </button>
  )
}
