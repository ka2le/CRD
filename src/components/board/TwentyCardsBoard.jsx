import { useMemo, useRef, useState } from 'react'
import CardButton from '../card/CardButton'
import CardVisual from '../card/CardVisual'
import { SvgIcon } from '../ui/GameIcon'
import { useElementSize } from '../../hooks/useFitLayout'
import { sortTwentyPool } from '../card/cardOrder'
import './TwentyCardsBoard.css'

export default function TwentyCardsBoard({ pool, lineup, locked, onPlace, onLock }) {
  const [measureRef, size] = useElementSize()
  const [selected, setSelected] = useState(null)
  const [drag, setDrag] = useState(null)
  const gesture = useRef(null)
  const suppressClick = useRef(false)
  const assigned = new Set(lineup.filter(Boolean))
  const sortedPool = useMemo(() => sortTwentyPool(pool), [pool])
  const compact = size.width < 650
  const landscape = !compact && size.height < 420
  const width = Math.max(25, Math.min((size.width - (landscape ? 90 : 54)) / (compact ? 5 : 10),
    ((size.height - (landscape ? 90 : 120)) / (landscape ? 4 : compact ? 7 : 5)) * 635 / 888, 130))
  const complete = assigned.size === 15

  function startDrag(event, uid) {
    if (locked || event.button !== 0) return
    gesture.current = { uid, x: event.clientX, y: event.clientY }
  }
  function moveDrag(event) {
    const initial = gesture.current
    if (!initial || Math.hypot(event.clientX - initial.x, event.clientY - initial.y) < 8) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setDrag({ uid: initial.uid, x: event.clientX, y: event.clientY })
  }
  function endDrag(event) {
    const initial = gesture.current
    gesture.current = null
    if (initial && Math.hypot(event.clientX - initial.x, event.clientY - initial.y) >= 8) {
      suppressClick.current = true
      window.setTimeout(() => { suppressClick.current = false }, 0)
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-lineup-slot]')
      if (target) onPlace(initial.uid, Number(target.dataset.lineupSlot))
      setSelected(null)
    }
    setDrag(null)
  }
  function pick(uid) {
    if (suppressClick.current) { suppressClick.current = false; return }
    if (!locked) setSelected(selected === uid ? null : uid)
  }
  function cardView(card) {
    return <div className="twenty-board__card" key={card.uid}
      onPointerDown={event => startDrag(event, card.uid)} onPointerMove={moveDrag} onPointerUp={endDrag}
      onPointerCancel={() => { gesture.current = null; setDrag(null) }}>
      <CardButton card={card} selected={selected === card.uid} onToggle={pick} disabled={locked} inspectContextHand={pool} animateMotion={false} />
    </div>
  }
  const draggedCard = pool.find(card => card.uid === drag?.uid)
  return <section ref={measureRef} className={`twenty-board${landscape ? ' twenty-board--landscape' : ''}`} style={{ '--lineup-w': `${width}px` }} aria-label="20Cards lineup">
    <div className="twenty-board__heading"><SvgIcon name="eye-off" /><strong>Your three hands</strong>
      <span>{assigned.size}/15</span></div>
    <div className="twenty-board__lanes">
      {[0, 1, 2].map(lane => <div key={lane} className="twenty-board__lane">
        <span className="twenty-board__round">{lane + 1}</span>
        {Array.from({ length: 5 }, (_, offset) => {
          const slot = lane * 5 + offset
          const card = pool.find(entry => entry.uid === lineup[slot])
          return <div className={`twenty-board__slot${selected ? ' is-target' : ''}`} key={slot} data-lineup-slot={slot}>
            {card ? cardView(card) : <button type="button" disabled={locked} className="twenty-board__empty"
              aria-label={`Round ${lane + 1}, slot ${offset + 1}`}
              onClick={() => { if (selected) { onPlace(selected, slot); setSelected(null) } }}><span>+</span></button>}
            {card && selected && selected !== card.uid ? <button type="button" className="twenty-board__replace"
              aria-label={`Place selected card in round ${lane + 1}, slot ${offset + 1}`}
              onClick={() => { onPlace(selected, slot); setSelected(null) }} /> : null}
          </div>
        })}
      </div>)}
    </div>
    <div className="twenty-board__pool" data-lineup-slot="-1">
      {sortedPool.filter(card => !assigned.has(card.uid)).map(cardView)}
      {selected && assigned.has(selected) ? <button type="button" className="twenty-board__return ui-button"
        onClick={() => { onPlace(selected, -1); setSelected(null) }}>Return to hand</button> : null}
    </div>
    <div className="twenty-board__footer"><span>{locked ? 'Waiting for opponent' : 'Drag cards into rounds · tap to place'}</span>
      <button type="button" className="ui-button ui-button--primary" disabled={!complete || locked} onClick={onLock}>
        <SvgIcon name="check" />{locked ? 'Locked in' : 'Lock all three'}</button></div>
    {draggedCard ? <div className="twenty-board__ghost" style={{ left: drag.x, top: drag.y }}><CardVisual card={draggedCard} /></div> : null}
  </section>
}
