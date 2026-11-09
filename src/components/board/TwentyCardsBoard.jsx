import { useMemo, useRef, useState } from 'react'
import CardButton from '../card/CardButton'
import CardVisual from '../card/CardVisual'
import { SvgIcon } from '../ui/GameIcon'
import { sortTwentyPool } from '../card/cardOrder'
import { useElementSize } from '../../hooks/useFitLayout'
import './TwentyCardsBoard.css'

const CARD_RATIO = 888 / 635
const LANES = [0, 1, 2]
const OFFSETS = [0, 1, 2, 3, 4]
const DRAG_THRESHOLD = 8
const DOUBLE_TAP_MS = 360

// Same two pieces in every shape: the 5x3 rounds and the 5x4 pool, stacked or side by side,
// whichever leaves the cards larger.
function fitBoard({ width, height }) {
  const gap = width < 520 || height < 420 ? 4 : 6
  const label = width < 520 || height < 420 ? 22 : 30
  const divider = gap * 3
  const stackedByWidth = (width - label * 2 - gap * 4) / 5
  const stackedByHeight = (height - gap * 5 - divider) / 7 / CARD_RATIO
  const sideByWidth = (width - label - divider - gap * 8) / 10
  const sideByHeight = (height - gap * 3) / 4 / CARD_RATIO
  const stacked = Math.min(stackedByWidth, stackedByHeight)
  const side = Math.min(sideByWidth, sideByHeight)
  const sideBySide = side > stacked
  return { gap, label, divider, sideBySide, cardWidth: Math.floor(Math.max(24, Math.min(sideBySide ? side : stacked, 180))) }
}

export default function TwentyCardsBoard({ pool, lineup, locked, onPlace }) {
  const [measureRef, size] = useElementSize()
  const [selected, setSelected] = useState(null)
  const [selectedLane, setSelectedLane] = useState(null)
  const [drag, setDrag] = useState(null)
  // Double-tapped cards fill the round you placed into last, then the next round with space.
  const [activeLane, setActiveLane] = useState(0)
  const lastTap = useRef(null)
  const gesture = useRef(null)
  const boardRef = useRef(null)
  const suppressClick = useRef(false)
  const sortedPool = useMemo(() => sortTwentyPool(pool), [pool])
  const cardsByUid = useMemo(() => new Map(pool.map(card => [card.uid, card])), [pool])
  const assigned = new Set(lineup.filter(Boolean))
  const layout = fitBoard(size)
  const selectedPlaced = selected && assigned.has(selected)
  const firstEmpty = lane => { const offset = OFFSETS.find(index => !lineup[lane * 5 + index]); return offset === undefined ? null : lane * 5 + offset }
  const nextSlot = [0, 1, 2].map(step => firstEmpty((activeLane + step) % 3)).find(slot => slot !== null) ?? null

  function clearSelection() { setSelected(null); setSelectedLane(null) }

  function swapLanes(from, to) {
    if (locked || from === to) return
    // Uses the existing per-card placement action, so local, bot and room games all accept it.
    for (const offset of OFFSETS) {
      const a = lineup[from * 5 + offset]
      const b = lineup[to * 5 + offset]
      if (a) onPlace(a, to * 5 + offset)
      else if (b) onPlace(b, from * 5 + offset)
    }
    // The round you were filling follows its cards.
    if (activeLane === from) setActiveLane(to)
    else if (activeLane === to) setActiveLane(from)
  }

  function place(uid, slot) {
    onPlace(uid, slot)
    if (slot >= 0) setActiveLane(Math.floor(slot / 5))
    clearSelection()
  }

  function startGesture(event, payload) {
    if (locked || event.button !== 0) return
    // Lanes move with the pointer, so drop targets come from where the lanes were when the drag began.
    const laneRects = payload.lane === undefined ? null
      : [...boardRef.current.querySelectorAll('[data-lane]')].map(element => element.getBoundingClientRect())
    gesture.current = { ...payload, laneRects, startY: event.clientY, x: event.clientX, y: event.clientY, pointerId: event.pointerId }
  }
  function laneAt(initial, x, y) {
    const index = initial.laneRects.findIndex(rect => y >= rect.top - 4 && y <= rect.bottom + 4 && x >= rect.left - 40 && x <= rect.right + 40)
    return index < 0 ? null : index
  }
  function moveGesture(event) {
    const initial = gesture.current
    if (!initial || Math.hypot(event.clientX - initial.x, event.clientY - initial.y) < DRAG_THRESHOLD) return
    if (!event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.setPointerCapture(event.pointerId)
    setDrag({ ...initial, x: event.clientX, y: event.clientY, overLane: initial.lane !== undefined ? laneAt(initial, event.clientX, event.clientY) : null })
  }
  function endGesture(event) {
    const initial = gesture.current
    gesture.current = null
    setDrag(null)
    if (!initial || Math.hypot(event.clientX - initial.x, event.clientY - initial.y) < DRAG_THRESHOLD) return
    suppressClick.current = true
    window.setTimeout(() => { suppressClick.current = false }, 0)
    if (initial.lane !== undefined) {
      const lane = laneAt(initial, event.clientX, event.clientY)
      if (lane !== null) swapLanes(initial.lane, lane)
    } else {
      const target = document.elementFromPoint(event.clientX, event.clientY)
      const slot = target?.closest('[data-lineup-slot]')?.dataset.lineupSlot
      if (slot !== undefined) place(initial.uid, Number(slot))
    }
    clearSelection()
  }
  function cancelGesture() { gesture.current = null; setDrag(null) }
  const gestureHandlers = { onPointerMove: moveGesture, onPointerUp: endGesture, onPointerCancel: cancelGesture }

  function toggleCard(uid) {
    if (suppressClick.current) { suppressClick.current = false; return }
    if (locked) return
    setSelectedLane(null)
    const now = performance.now()
    const doubleTap = lastTap.current?.uid === uid && now - lastTap.current.time < DOUBLE_TAP_MS
    lastTap.current = null
    if (doubleTap) {
      // Pool card: fill the next free slot. Placed card: send it back to the pool.
      if (assigned.has(uid)) place(uid, -1)
      else if (nextSlot !== null) place(uid, nextSlot)
      return
    }
    // A selected card tapped onto a placed card takes its slot; the placed card goes home.
    const slot = lineup.indexOf(uid)
    if (selected && selected !== uid && slot >= 0) { place(selected, slot); return }
    // A selected placed card is replaced by the pool card tapped next.
    if (selected && selected !== uid && assigned.has(selected)) { place(uid, lineup.indexOf(selected)); return }
    if (selected !== uid) lastTap.current = { uid, time: now }
    setSelected(selected === uid ? null : uid)
  }
  function tapLaneHandle(lane) {
    if (suppressClick.current) { suppressClick.current = false; return }
    if (locked) return
    // With a card selected, tapping a round number drops it into that round's first free slot.
    if (selected) {
      const slot = firstEmpty(lane)
      if (slot !== null) place(selected, slot)
      return
    }
    if (selectedLane === null || selectedLane === lane) { setSelectedLane(selectedLane === lane ? null : lane); return }
    swapLanes(selectedLane, lane)
    setSelectedLane(null)
  }

  function cardView(card) {
    return <div className="twenty-board__card" onPointerDown={event => startGesture(event, { uid: card.uid })} {...gestureHandlers}>
      <CardButton card={card} selected={selected === card.uid} onToggle={toggleCard} disabled={locked}
        inspectContextHand={pool} animateMotion={false} />
    </div>
  }

  const draggedCard = drag?.uid ? cardsByUid.get(drag.uid) : null
  const style = { '--lineup-w': `${layout.cardWidth}px`, '--lineup-gap': `${layout.gap}px`, '--lineup-label': `${layout.label}px`, '--lineup-divider': `${layout.divider}px` }
  const className = ['twenty-board', layout.sideBySide ? 'twenty-board--side' : 'twenty-board--stacked',
    locked ? 'is-locked' : '', drag?.lane !== undefined ? 'is-lane-dragging' : ''].filter(Boolean).join(' ')

  function setBoard(element) { boardRef.current = element; measureRef(element) }

  return <section ref={setBoard} className={className} style={style} aria-label="20Cards lineup">
    <div className="twenty-board__layout">
      <div className="twenty-board__lanes">
        {LANES.map(lane => {
          const laneClass = ['twenty-board__lane',
            selectedLane === lane || drag?.lane === lane ? 'is-lifted' : '',
            (selectedLane !== null && selectedLane !== lane) || (drag?.overLane === lane && drag.lane !== lane) ? 'is-lane-target' : ''].filter(Boolean).join(' ')
          const lift = drag?.lane === lane ? { transform: `translateY(${drag.y - drag.startY}px)`, zIndex: 3, transition: 'none' } : undefined
          return <div key={lane} className={laneClass} data-lane={lane} style={lift}>
            <button type="button" className="twenty-board__handle" disabled={locked}
              aria-label={`Round ${lane + 1}. Drag or tap, then tap another round to swap`}
              aria-pressed={selectedLane === lane}
              onPointerDown={event => startGesture(event, { lane })} {...gestureHandlers}
              onClick={() => tapLaneHandle(lane)}>
              <span className="twenty-board__round">{lane + 1}</span>
              {!locked ? <SvgIcon name="grip" className="twenty-board__grip" /> : null}
            </button>
            {OFFSETS.map(offset => {
              const slot = lane * 5 + offset
              const card = cardsByUid.get(lineup[slot])
              const target = selected && !card
              const next = !locked && !card && slot === nextSlot
              return <div className={`twenty-board__slot${target ? ' is-target' : ''}${next ? ' is-next' : ''}`} key={slot} data-lineup-slot={slot}>
                {card ? cardView(card) : <button type="button" disabled={locked} className="twenty-board__empty"
                  aria-label={`Round ${lane + 1}, slot ${offset + 1}`}
                  onClick={() => { if (selected) place(selected, slot) }} />}
              </div>
            })}
          </div>
        })}
      </div>
      <div className={`twenty-board__pool${selectedPlaced ? ' is-return-target' : ''}`} data-lineup-slot="-1"
        onClick={event => { if (selectedPlaced && !event.target.closest('.twenty-board__card')) place(selected, -1) }}>
        {sortedPool.map(card => assigned.has(card.uid)
          ? <div key={card.uid} className={`twenty-board__used${selected === card.uid ? ' is-home' : ''}`} aria-hidden="true">
            <CardVisual card={card} />
          </div>
          : <div key={card.uid} className="twenty-board__pool-slot">{cardView(card)}</div>)}
      </div>
    </div>
    {draggedCard ? <div className="twenty-board__ghost" style={{ left: drag.x, top: drag.y }}><CardVisual card={draggedCard} /></div> : null}
  </section>
}
