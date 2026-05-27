import './HandArea.css'
import CardButton from '../card/CardButton'
import useHandAnimation from '../../hooks/useHandAnimation'
import { MotionAnchor, useCardMotion } from '../animation/CardMotionContext'

const DUMMY_CARD = {
  uid: '__dummy_card__',
  id: '__dummy_card__',
  name: '',
  type: 'stat',
  stats: [],
  images: [],
  draftAnimation: 'dummy',
}

export default function HandArea({
  hand,
  hidden = false,
  selectedIds = [],
  onToggle,
  className = '',
  rowClassName = '',
  activeCardIds = [],
  activationTick = 0,
  animateOnMount = true,
  cardsDisabled = false,
  preserveSpace = true,
  motionSection = '',
  suppressedIds = [],
  targetableIds = [],
  battleValuesById = {},
}) {
  const displayHand = hand.length === 0 && preserveSpace ? [DUMMY_CARD] : hand
  const { cardStates } = useHandAnimation(displayHand, { animateOnMount })
  const activeIds = new Set(activeCardIds)
  const suppressedSet = new Set(suppressedIds)
  const targetableSet = new Set(targetableIds)
  const { hiddenSlots } = useCardMotion()

  return (
    <section className={[
      'hand-area',
      'ui-panel',
      preserveSpace ? 'hand-area--preserve-space' : '',
      className,
    ].filter(Boolean).join(' ')}>
      <div className={['hand-area__row', rowClassName].filter(Boolean).join(' ')}>
        {displayHand.map((card, index) => {
          const slotKey = motionSection ? `${motionSection}::${card.uid}` : ''
          const isSuppressed = card.uid !== '__dummy_card__' && suppressedSet.has(card.uid)
          const isMasked = card.uid === '__dummy_card__' ? false : (isSuppressed || Boolean(slotKey && (hiddenSlots[slotKey] ?? 0) > 0))
          const animationState = isSuppressed ? '' : (card.draftAnimation || cardStates[card.uid])
          const button = (
            <CardButton
              key={`${card.uid}-${activeIds.has(card.uid) ? activationTick : 'idle'}-${card.draftAnimation ?? 'none'}`}
              card={card}
              hidden={card.uid === '__dummy_card__' ? false : hidden}
              selected={card.uid === '__dummy_card__' ? false : selectedIds.includes(card.uid)}
              active={card.uid === '__dummy_card__' ? false : activeIds.has(card.uid)}
              masked={isMasked}
              animationState={animationState}
              onToggle={card.uid === '__dummy_card__' ? undefined : onToggle}
              disabled={card.uid === '__dummy_card__' ? true : cardsDisabled}
              targetable={card.uid !== '__dummy_card__' && targetableSet.has(card.uid)}
              battleValue={card.uid === '__dummy_card__' ? 0 : (battleValuesById?.[card.uid] ?? 0)}
            />
          )

          if (!motionSection || card.uid === '__dummy_card__') return button

          return (
            <MotionAnchor key={`anchor-${card.uid}`} section={motionSection} slot={card.uid} className="hand-area__motion-anchor">
              {button}
            </MotionAnchor>
          )
        })}
      </div>
    </section>
  )
}
