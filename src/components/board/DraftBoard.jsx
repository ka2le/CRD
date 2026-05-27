import './DraftBoard.css'
import HandArea from '../hand/HandArea'
import { MotionAnchor } from '../animation/CardMotionContext'

export default function DraftBoard({
  draftRow,
  draftDiscardCount,
  deckCount,
  onPickCard,
  canPick,
  phaseLabel,
  showBattleButton,
  onStartBattle,
  startBattleDisabled = false,
  pendingOpponentPickUid = null,
  draftActivationTick = 0,
  phase = '',
  centerCards = null,
  centerLabel = '',
  centerAction = null,
  centerCardsDisabled = false,
  tooltipContextHand = [],
}) {
  const activeCardIds = pendingOpponentPickUid ? [pendingOpponentPickUid] : []
  const isDiscarding = phase === 'draft-pack-clearing'
  const isDealing = phase === 'draft-pack-dealing'
  const centerCount = centerCards?.length ?? 0
  const centerRowClassName = centerCount >= 9
    ? 'hand-area__row--center-grid-5'
    : centerCount >= 6
      ? 'hand-area__row--center-grid-5'
      : 'hand-area__row--center-few'

  return (
    <section className="draft-board ui-panel table-slot">
      <div className="draft-board__stage">
        {phaseLabel ? <div className="draft-board__phase-label">{phaseLabel}</div> : null}

        <div className="draft-board__table">
          <MotionAnchor section="draft-deck" className="draft-board__anchor">
            <div className={["draft-board__stack", "draft-board__stack--deck", isDealing ? 'draft-board__stack--pulse' : ''].filter(Boolean).join(' ')}>
              <div className="draft-board__stack-label">Deck</div>
              <div className="draft-board__stack-count">{deckCount}</div>
            </div>
          </MotionAnchor>

          <div className="draft-board__center">
            {centerCards ? (
              <div className="draft-board__center-picker">
                {centerLabel ? <div className="draft-board__center-label">{centerLabel}</div> : null}
                <HandArea
                  hand={centerCards}
                  onToggle={centerAction}
                  animateOnMount
                  cardsDisabled={centerCardsDisabled}
                  preserveSpace
                  motionSection="draft-row"
                  className="draft-board__row draft-board__row--center-picker"
                  rowClassName={centerRowClassName}
                  tooltipContextHand={tooltipContextHand}
                />
              </div>
            ) : showBattleButton ? (
              <div className="draft-board__battle-action">
                <button
                  type="button"
                  className="ui-button ui-button--primary"
                  onClick={onStartBattle}
                  disabled={startBattleDisabled}
                >
                  Battle
                </button>
              </div>
            ) : (
              <HandArea
                hand={draftRow}
                onToggle={onPickCard}
                animateOnMount
                cardsDisabled={!canPick}
                activeCardIds={activeCardIds}
                activationTick={draftActivationTick}
                preserveSpace
                motionSection="draft-row"
                className={["draft-board__row", isDiscarding ? 'draft-board__row--discarding' : '', isDealing ? 'draft-board__row--dealing' : ''].filter(Boolean).join(' ')}
                tooltipContextHand={tooltipContextHand}
              />
            )}
          </div>

          <MotionAnchor section="draft-discard" className="draft-board__anchor">
            <div className={["draft-board__stack", "draft-board__stack--discard", isDiscarding ? 'draft-board__stack--pulse' : ''].filter(Boolean).join(' ')}>
              <div className="draft-board__stack-label">Discard</div>
              <div className="draft-board__stack-count">{draftDiscardCount}</div>
            </div>
          </MotionAnchor>
        </div>
      </div>
    </section>
  )
}
