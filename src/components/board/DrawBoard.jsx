import './DrawBoard.css'
import { MotionAnchor } from '../animation/CardMotionContext'
import HandArea from '../hand/HandArea'

export default function DrawBoard({
  deckCount,
  discardCount = 0,
  phaseLabel,
  onPrimaryAction,
  primaryActionLabel,
  primaryActionDisabled = false,
  centerCards = null,
  centerLabel = '',
  centerAction = null,
  centerCardsDisabled = false,
}) {
  const centerCount = centerCards?.length ?? 0
  const centerRowClassName = centerCount >= 9
    ? 'hand-area__row--center-grid-3'
    : centerCount >= 6
      ? 'hand-area__row--center-grid-4'
      : 'hand-area__row--center-few'
  return (
    <section className="draw-board ui-panel table-slot">
      <div className="draw-board__side draw-board__side--left">
        <MotionAnchor section="draw-deck" className="draw-board__deck-anchor">
          <div className="draw-board__deck-stack">
            <div className="draw-board__deck-top">Deck</div>
            <div className="draw-board__deck-count">{deckCount}</div>
          </div>
        </MotionAnchor>
      </div>

      <div className="draw-board__stage">
        {phaseLabel ? <div className="draw-board__phase-label">{phaseLabel}</div> : null}
        {centerCards ? (
          <div className="draw-board__table">
            <div className="draw-board__center-picker">
              {centerLabel ? <div className="draw-board__center-label">{centerLabel}</div> : null}
              <HandArea
                hand={centerCards}
                onToggle={centerAction}
                animateOnMount
                cardsDisabled={centerCardsDisabled}
                preserveSpace
                motionSection="draft-row"
                className="draw-board__center-row"
                rowClassName={centerRowClassName}
              />
            </div>
          </div>
        ) : (
          <div className="draw-board__primary-action">
            <button
              type="button"
              className="ui-button ui-button--primary"
              onClick={onPrimaryAction}
              disabled={primaryActionDisabled}
            >
              {primaryActionLabel}
            </button>
          </div>
        )}
      </div>

      <div className="draw-board__side draw-board__side--right">
        <MotionAnchor section="player-discard" className="draw-board__discard-anchor">
          <div className="draw-board__deck-stack draw-board__deck-stack--discard">
            <div className="draw-board__deck-top">Discard</div>
            <div className="draw-board__deck-count">{discardCount}</div>
          </div>
        </MotionAnchor>
      </div>
    </section>
  )
}
