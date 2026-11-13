import { useEffect, useMemo, useReducer, useState } from 'react'
import { BOSSES, BOSS_SAVE_VERSION, BOSS_STORAGE, bossCard, bossDefinition, bossHand, bossReducer, createBossRun, matchesBossFilter, bossOptions, bossPackSize, bossDraftRows, bossToolCharges, bossCanSwitchLatest, bossPocketCard, bossPocketWindow } from '../../game/bossBattle'
import BossOptions from './BossOptions'
import BossScores from './BossScores'
import { getPreparationActions } from '../../game/preparationState'
import { chooseTabletopType, getCardTabletopTypes, getTabletopProfile, scoreTabletopHand } from '../../game/tabletop'
import HandArea from '../hand/HandArea'
import CardButton from '../card/CardButton'
import ScreenMenu from '../menu/ScreenMenu'
import Sheet from '../overlay/Sheet'
import PileSheet from '../overlay/PileSheet'
import ScoreSheet from '../overlay/ScoreSheet'
import CollectionSheet from '../overlay/CollectionSheet'
import { FactionChoices } from '../overlay/FactionPicker'
import { GameIcon, SvgIcon } from '../ui/GameIcon'
import { LiveTabletopLedger } from '../battle/TabletopResolution'
import Pile from '../board/Pile'
import useBattleAnimationSetting from '../../hooks/useBattleAnimationSetting'
import { useElementSize } from '../../hooks/useFitLayout'
import '../hud/SideRail.css'
import './BossBattle.css'

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(BOSS_STORAGE))
    if (saved?.version === BOSS_SAVE_VERSION && BOSSES.some(b => b.id === saved.bossId) &&
        ['setup', 'draft', 'collect', 'collected', 'prepare', 'result'].includes(saved.phase) && saved.hands?.length === 2 && saved.pockets?.length === 2) return saved
  } catch { /* A new encounter is safe when storage is unavailable or obsolete. */ }
  return createBossRun()
}

function Power({ value, type }) {
  return <span className="boss-power"><GameIcon name={type ?? 'damage'} /><strong>{value}</strong></span>
}

function BossHeroHand({ slots, ...props }) {
  const [measureRef, size] = useElementSize()
  return <div className="boss-hero-cards" ref={measureRef}>
    <HandArea {...props} layout={size.width < 360 ? 'grid' : 'row'} slots={slots}
      maxCardHeight={Math.min(300, Math.max(0, size.height - 20))} />
  </div>
}

export default function BossBattle({ onExit }) {
  const [state, dispatch] = useReducer(bossReducer, undefined, restore)
  const [panel, setPanel] = useState(null)
  const [target, setTarget] = useState(null)
  const [selected, setSelected] = useState([])
  const [prepTargets, setPrepTargets] = useState([null, null])
  const [discardSelections, setDiscardSelections] = useState([[], []])
  const [factionChoice, setFactionChoice] = useState(null)
  const [factionCards, setFactionCards] = useState([null, null])
  const [countedResult, setCountedResult] = useState(null)
  const [animation, setAnimation] = useBattleAnimationSetting()
  const [saveFailed, setSaveFailed] = useState(false)
  useEffect(() => {
    try { localStorage.setItem(BOSS_STORAGE, JSON.stringify(state)) }
    catch { const timer = window.setTimeout(() => setSaveFailed(true), 0); return () => window.clearTimeout(timer) }
  }, [state])
  const boss = bossDefinition(state.bossId)
  const options = bossOptions(state)
  const separate = options.draftMode === 'separate'
  const rows = bossDraftRows(state)
  const ruleSummary = `${separate ? 'Separate 4-card packs' : 'Shared packs'} · ${options.rounds} rounds · ${options.absorption === 'all' ? 'all leftovers' : 'boss filter'} · ${options.weakerBonus ? 'lower ×2' : 'powers added'}`
  const drafting = state.phase === 'draft'
  const preparing = state.phase === 'prepare'
  const setup = state.phase === 'setup'
  const swapWindow = ['draft', 'collect', 'collected'].includes(state.phase)
  const powerWindow = swapWindow || preparing
  const result = state.result
  const counting = Boolean(result && animation && countedResult !== result)
  const seat = target?.seat ?? (preparing ? state.activeSeat : state.turns[0] ?? 0)
  const hands = useMemo(() => state.prep ? [state.prep.playerHand, state.prep.opponentHand] : state.hands, [state.prep, state.hands])
  const legalBySeat = [0, 1].map(i => preparing ? getPreparationActions(state.prep, i ? 'opponent' : 'player') : [])
  const pendingBySeat = [0, 1].map(i => preparing ? state.prep[`${i ? 'opponent' : 'player'}PendingDiscard`] : null)
  const pending = pendingBySeat[seat], prepTarget = prepTargets[seat]
  const needsType = preparing && getTabletopProfile(hands[seat]).types.length > 1 && !state.types[seat]
  const recycleSeat = prepTargets.findIndex(t => t?.kind === 'recycle')
  const monsterHand = useMemo(() => bossHand({ bossId: state.bossId, absorbed: state.absorbed }), [state.bossId, state.absorbed])
  const bp = getTabletopProfile(monsterHand)
  const discard = state.prep?.playerDiscard ?? state.discard
  const handProfiles = hands.map((h, i) => scoreTabletopHand(h, bp.shields, state.types[i] ?? chooseTabletopType(h)))
  const total = handProfiles.reduce((n, p) => n + p.score, 0) + (options.weakerBonus ? Math.min(...handProfiles.map(p => p.score)) : 0)
  const allCleared = state.cleared.length === BOSSES.length

  function send(action) {
    dispatch(action); setTarget(null); setSelected([])
    setFactionChoice(null); setFactionCards([null, null])
    setPrepTargets([null, null]); setDiscardSelections([[], []])
  }
  function newEncounter(id = state.bossId, cleared = state.cleared) {
    send({ type: 'new', options: { bossId: id, cleared, options, testMode: state.testMode } })
    setPanel(null)
  }
  function clearPrepInput(index) {
    setFactionChoice(old => old?.seat === index ? null : old)
    setPrepTargets(old => old.map((v, i) => i === index ? null : v))
    setDiscardSelections(old => old.map((v, i) => i === index ? [] : v))
  }
  function applyPrep(index, action) {
    dispatch({ type: 'prepare', seat: index, action })
    if (action.type !== 'finish-preparation') setFactionCards(old => old.map((uid, i) => i === index ? null : uid))
    clearPrepInput(index)
  }
  function openPower(kind, index) {
    if (kind === 'swap') { setPrepTargets([null, null]); setDiscardSelections([[], []]) }
    else if (preparing) clearPrepInput(index)
    setSelected([]); setTarget({ kind, seat: index })
  }
  function chooseFaction(index, faction, uid = null) {
    dispatch({ type: 'faction', seat: index, faction })
    setFactionCards(old => old.map((value, i) => i === index ? uid : value))
    setFactionChoice(null)
  }
  function cancelPrep(index) {
    if (pendingBySeat[index]?.cardId === 'discard_for_damage') dispatch({ type: 'cancel-sacrifice', seat: index })
    clearPrepInput(index)
  }
  function acceptPrep(index) {
    const pending = pendingBySeat[index]
    if (!pending && getTabletopProfile(hands[index]).types.length > 1 && !state.types[index]) {
      setFactionChoice({ seat: index, types: getTabletopProfile(hands[index]).types }); return
    }
    if (!pending) { applyPrep(index, { type: 'finish-preparation' }); return }
    // Each hand stages its own choices; committing one hand keeps the other's
    // selections and target intact. Sacrifice the source last, if selected.
    const selected = discardSelections[index]
    const ordered = [...selected].sort((a, b) => Number(a === pending.sourceUid) - Number(b === pending.sourceUid))
    ordered.forEach(uid => dispatch({ type: 'prepare', seat: index, action: { type: 'discard-preparation', sourceUid: pending.sourceUid, cardId: pending.cardId, targetUid: uid } }))
    if (pending.remaining === null && !selected.includes(pending.sourceUid)) dispatch({ type: 'prepare', seat: index, action: { type: 'finish-preparation-discard', sourceUid: pending.sourceUid, cardId: pending.cardId } })
    clearPrepInput(index)
  }
  function clickHand(index, uid) {
    if (target?.kind === 'swap') {
      setSelected(old => [...old.filter(id => !hands[index].some(c => c.uid === id)), uid]); return
    }
    if (target?.kind === 'pocket-exchange') {
      if (index === target.seat) send({ type: 'pocket', seat: index, uid })
      return
    }
    if (!preparing || state.prep[`${index ? 'opponent' : 'player'}Finished`]) return
    const pending = pendingBySeat[index], legal = legalBySeat[index], prepTarget = prepTargets[index]
    if (pending) {
      setDiscardSelections(old => old.map((selection, i) => i !== index ? selection : selection.includes(uid)
        ? selection.filter(id => id !== uid) : [...selection, uid].slice(-(pending.remaining ?? hands[index].length))))
      return
    }
    if (prepTarget?.kind === 'copy') {
      const action = legal.find(a => a.type === 'prepare' && a.sourceUid === prepTarget.uid && a.targetUid === uid)
      if (action) applyPrep(index, action)
      return
    }
    const actions = legal.filter(a => a.type === 'prepare' && a.sourceUid === uid)
    const card = hands[index].find(c => c.uid === uid)
    if (!actions.length) {
      if (legal.some(a => a.type === 'prepare') && card?.id !== 'chameleon') return
      const types = getCardTabletopTypes(card, getTabletopProfile(hands[index]))
      if (types.length === 1) chooseFaction(index, types[0], uid)
      else if (types.length > 1) setFactionChoice({ seat: index, types, uid })
      return
    }
    if (card.id === 'copy_card_in_hand' || card.id === 'recycle_card') {
      setPrepTargets(old => old.map((v, i) => i === index ? { kind: card.id === 'copy_card_in_hand' ? 'copy' : 'recycle', uid } : v)); return
    }
    applyPrep(index, actions[0])
  }
  function accept() {
    if (target?.kind === 'refresh') { send({ type: 'refresh', uid: selected[0], seat: target.seat }); return }
    if (target?.kind === 'swap') {
      send({ type: 'swap', seat: target.seat, a: selected.find(uid => hands[0].some(c => c.uid === uid)), b: selected.find(uid => hands[1].some(c => c.uid === uid)) }); return
    }
    if (preparing) { acceptPrep(seat); return }
    if (setup) { send({ type: 'start' }); return }
    if (state.phase === 'collect') { send({ type: 'collect' }); return }
    if (state.phase === 'collected') { send({ type: 'next' }); return }
    if (state.phase === 'result') {
      if (result.winner !== 'team') newEncounter()
      else newEncounter(BOSSES.find(b => !state.cleared.includes(b.id))?.id ?? BOSSES[0].id, allCleared ? [] : state.cleared)
    }
  }

  const accepting = pending || ['refresh', 'swap'].includes(target?.kind)
  const primaryLabel = accepting ? 'Accept' : setup ? 'Draft' : state.phase === 'collect' ? 'Absorb'
    : state.phase === 'collected' ? (state.pack === options.rounds ? 'Prepare' : 'Next pack')
      : preparing ? needsType ? 'Choose faction' : 'Ready' : state.phase === 'result' ? (result.winner !== 'team' ? 'Try again' : allCleared ? 'New run' : 'Next boss') : 'Pick a card'
  const primaryDisabled = counting || drafting && !target || target?.kind === 'refresh' && selected.length !== 1 ||
    target?.kind === 'swap' && selected.length !== 2 || preparing && !target && (Boolean(prepTarget)
      || (pending ? pending.remaining !== null && discardSelections[seat].length !== pending.remaining : false))
  const currentSeat = target ? seat : drafting ? state.turns[0] : preparing ? seat : null
  const turnLabel = currentSeat === null || currentSeat === undefined ? '' : `Player ${currentSeat + 1}’s Turn`
  const instruction = target?.kind === 'refresh' ? 'Choose a card to refresh' : target?.kind === 'swap' ? 'Choose one card from each hand'
    : target?.kind === 'pocket-exchange' ? bossPocketWindow(state, seat) === 'hand' ? 'Choose a hand card for Pocket' : 'Choose a pack card for Pocket'
    : prepTarget?.kind === 'copy' ? 'Choose a Copy target'
      : pending ? `Discard ${pending.remaining === null ? 'any cards' : pending.remaining}`
        : needsType ? 'Choose your main damage type: tap a highlighted card'
          : state.phase === 'collected' && state.pack === options.rounds && options.pockets ? 'Final Pocket exchanges' : ''
  const outcome = result?.winner === 'team' ? 'Victory' : result?.winner === 'boss' ? 'Defeat' : 'Draw'

  return <div className={`app-shell boss-shell${state.phase === 'result' ? ' boss-shell--result' : ''}`}>
    <header className="boss-header">
      <ScreenMenu bossMode onLeaveBoss={onExit} onNewGame={() => newEncounter()} settings={{ testing: true }}
        onBossOptions={() => setPanel('options')} onRestartBoss={() => send({ type: 'restart' })}
        onReplayPrep={state.prep ? () => send({ type: 'replay-prep' }) : undefined}
        onHelp={() => setPanel('help')} onScoreCard={() => setPanel('score')} onCollection={() => setPanel('collection')}
        battleAnimation={animation} onBattleAnimation={setAnimation} />
    </header>

    {setup ? <main className="boss-setup">
      <button className="boss-rule-summary" onClick={() => setPanel('options')}>{ruleSummary} <span>· Options</span></button>
      <div className="boss-choices" role="group" aria-label="Choose a boss">
        {BOSSES.map(b => <div key={b.id} className="boss-choice">
          <CardButton card={bossCard(b.id, options)} animateMotion={false} selected={b.id === state.bossId} onToggle={() => newEncounter(b.id)} />
          <span>{b.name}{state.cleared.includes(b.id) ? ' ✓' : ''}</span>
        </div>)}
      </div>
      {options.pockets ? <p className="boss-pocket-intro">Each player starts with an empty Pocket. Reserve a pack card without spending your pick; exchange it with your own hand before prep.</p> : null}
    </main> : <main className={`boss-table${preparing || state.phase === 'result' ? ' boss-table--resolve' : ''}${state.phase === 'result' ? ' boss-table--result' : ''}`}>
      <section className="boss-enemy" aria-label="Boss hand">
        {!result ? <LiveTabletopLedger hand={monsterHand} enemyHand={hands.flat()} name={boss.name} /> : null}
        <div className="boss-portrait"><CardButton card={bossCard(state.bossId, options)} animateMotion={false} onToggle={() => setPanel('help')} /></div>
        <div className="boss-acquisitions">
          <HandArea hand={state.absorbed} layout="grid" slots={Math.max(1, state.absorbed.length)} animateOnMount={false}
            activeCardIds={animation ? state.lastAbsorbed : []} activationKey={state.pack} inspectContextHand={monsterHand} />
        </div>
      </section>

      <section className="boss-center" aria-label={state.phase === 'result' ? 'Battle result' : 'Draft pack'}>
        {swapWindow ? <div key={`${state.seed}-${state.pack}`} className="local-turn-notice boss-round-notice" role="status">Round {state.pack}</div> : null}
        {state.phase === 'result' ? <div className={`boss-result${animation ? ' boss-result--animate' : ''}`}>
          <div className="boss-result-heading"><strong className="boss-result__title">{counting ? 'Battle' : outcome}</strong>
            <div className="boss-result-actions" style={{ visibility: counting ? 'hidden' : 'visible' }}><button className="ui-button ui-button--icon" aria-label="Battle scores" title="Battle scores" onClick={() => setPanel('result')}><SvgIcon name="eye" /></button><button className="ui-button ui-button--icon" aria-label="Replay prep" title="Replay prep" onClick={() => send({ type: 'replay-prep' })}><SvgIcon name="rewind" /></button></div>
          </div>
          <BossScores result={result} hands={hands} monsterHand={monsterHand} bossName={boss.name} weakerBonus={options.weakerBonus}
            animate={animation} finished={countedResult === result} onFinished={() => setCountedResult(result)} />
        </div> : rows.some(row => row.length) ? <div className={`boss-draft-packs${separate ? ' boss-draft-packs--separate' : ''}`}>
          {rows.map((row, i) => <div key={i} className={`boss-draft-pack${drafting && (!separate || state.turns.includes(i)) ? ' boss-draft-pack--active' : ''}`} data-draft-seat={separate ? i : 'shared'} role="group" aria-label={separate ? `Player ${i + 1} pack` : 'Shared pack'}>
            <HandArea hand={row} layout="grid" slots={bossPackSize(state)} maxCardHeight={380} animateOnMount={false}
              onToggle={(drafting && (!separate || state.turns.includes(i)) && !target || ['draft', 'collect'].includes(state.phase) && (target?.kind === 'refresh' || target?.kind === 'pocket-exchange' && bossPocketWindow(state, target.seat) === 'pack') && (!separate || target.seat === i)) ? uid => target?.kind === 'pocket-exchange' ? send({ type: 'pocket', seat: target.seat, uid }) : target ? setSelected([uid]) : send({ type: 'pick', uid, ...(separate ? { seat: i } : {}) }) : undefined}
              selectedIds={selected} readyIds={state.phase === 'collect' ? row.filter(c => options.absorption === 'all' || matchesBossFilter(c, boss.filter)).map(c => c.uid) : []}
              targetableIds={target && ['refresh', 'pocket-exchange'].includes(target.kind) && (!separate || target.seat === i) ? row.map(c => c.uid) : []}
              inspectContextHand={hands[separate ? i : seat]} />
          </div>)}
        </div> : <div className="boss-center-summary">
            <Power value={total} />
          </div>}
      </section>

      <section className="boss-heroes" aria-label="Team hands">{hands.map((hand, i) => {
        const ready = preparing && state.prep[`${i ? 'opponent' : 'player'}Finished`]
        const active = drafting ? separate ? state.turns.includes(i) : state.turns[0] === i : preparing && !ready
        const legal = legalBySeat[i], pending = pendingBySeat[i], prepTarget = prepTargets[i]
        const selection = discardSelections[i]
        const profile = getTabletopProfile(hand)
        const types = profile.types
        const hasSpecials = legal.some(a => a.type === 'prepare')
        const typeCards = hand.filter(c => getCardTabletopTypes(c, getTabletopProfile(hand)).length)
        const choosing = preparing && active && !pending && !prepTarget && !target && types.length > 1
        const neutralOnly = Object.values(profile.contributions).every(value => value === 0)
        const showFactions = choosing && (factionChoice?.seat === i || !state.types[i] && !hasSpecials && neutralOnly)
        const pocket = bossPocketCard(state, i)
        return <div key={i} className={`boss-hero${active ? ' boss-hero--active' : ''}${currentSeat === i ? ' boss-hero--current' : ''}${preparing && seat === i ? ' boss-hero--focus' : ''}`} data-seat={i} role="group" aria-label={`Player ${i + 1} hand`}
          onClick={() => { if (preparing && !ready) dispatch({ type: 'seat', seat: i }) }}>
          <div className={`boss-zone-label${preparing ? ' boss-zone-label--prepare' : ''}`}>
            {powerWindow ? <div className="boss-player-powers" role="group" aria-label={`Player ${i + 1} powers`}>
              {options.refresh && !preparing ? <button className="ui-button ui-button--icon" aria-label={`Player ${i + 1} Refresh`} title="Refresh your pack" disabled={!['draft', 'collect'].includes(state.phase) || !rows[separate ? i : 0]?.length || !state.deck.length || !bossToolCharges(state, i).refresh || Boolean(target)} onClick={() => openPower('refresh', i)}><GameIcon name="redraw" /></button> : null}
              {options.double && !preparing ? <button className="ui-button ui-button--icon" aria-label={`Player ${i + 1} 2 now`} title="Pick twice now; pass next round" disabled={!['draft', 'collect'].includes(state.phase) || !rows[separate ? i : 0]?.length || !bossToolCharges(state, i).double || state.debt[i] || state.pack === options.rounds || Boolean(target)} onClick={() => send({ type: 'double', seat: i })}><span className="boss-double-icon">2</span><GameIcon name="draw" /></button> : null}
              {options.swap ? <button className="ui-button ui-button--icon" aria-label={`Player ${i + 1} Swap`} title="Swap one card between hands" disabled={!bossToolCharges(state, i).swap || !hands[0].length || !hands[1].length || pendingBySeat.some(Boolean) || Boolean(target)} onClick={() => openPower('swap', i)}><SvgIcon name="swap" /></button> : null}
            </div> : null}
            <div className="boss-player-identity">
            <span className="boss-player-name">
              <span>Player {i + 1} </span><Power value={result?.heroes[i].score ?? handProfiles[i].score} type={result?.heroes[i].damageType ?? handProfiles[i].damageType} />{ready ? ' ✓' : ''}
            </span>
            {options.pockets ? <div className="boss-pocket" data-pocket-seat={i}>
              <Pile kind="discard" sections={`boss-pocket-${i}`} count={pocket ? 1 : 0} topCard={pocket}
                label={`Player ${i + 1} Pocket`} title={`Pocket: ${pocket?.name ?? 'empty'}`}
                selected={target?.kind === 'pocket-exchange' && target.seat === i}
                disabled={!bossPocketWindow(state, i) || !pocket && !state.deck.length || Boolean(target)}
                onOpen={() => openPower('pocket-exchange', i)} />
              <span>Pocket</span>
            </div> : null}
            </div>
          </div>
          {choosing ? <div className="boss-faction-status">
            <button className="ui-button" aria-label={`Player ${i + 1} · Choose your main faction`}
              onClick={() => setFactionChoice(factionChoice?.seat === i ? null : { seat: i, types })}>
              {state.types[i] ? <>Main type <GameIcon name={state.types[i]} /></> : 'Choose faction'}
            </button>
          </div> : null}
          {showFactions ? <div className="boss-faction-prompt" role="group" aria-label={`Player ${i + 1} · Main faction`}>
            <FactionChoices types={factionChoice?.seat === i ? factionChoice.types : types} selectedType={state.types[i]}
              onChoose={faction => chooseFaction(i, faction, factionChoice?.seat === i ? factionChoice.uid : null)} />
          </div> : null}
          <BossHeroHand hand={hand} slots={options.rounds} animateOnMount={false}
            selectedIds={['swap', 'pocket-exchange'].includes(target?.kind) ? selected : preparing && !pending ? [factionCards[i]].filter(Boolean) : []}
            discardIds={preparing ? selection : []}
            onToggle={preparing && !ready || target?.kind === 'swap' || target?.kind === 'pocket-exchange' && target.seat === i && bossPocketWindow(state, i) === 'hand' ? uid => clickHand(i, uid) : undefined} inspectContextHand={hand}
            readyIds={preparing && active && !pending ? legal.some(a => a.type === 'prepare')
              ? [...new Set(legal.filter(a => a.type === 'prepare').map(a => a.sourceUid))]
              : types.length > 1 ? typeCards.map(c => c.uid) : [] : []}
            targetableIds={target?.kind === 'swap' || target?.kind === 'pocket-exchange' && target.seat === i && bossPocketWindow(state, i) === 'hand' ? hand.map(c => c.uid) : preparing && active && prepTarget?.kind === 'copy' ? legal.filter(a => a.sourceUid === prepTarget.uid && a.type === 'prepare').map(a => a.targetUid) : []}
            showEmptySlots />
        </div>
      })}</section>
    </main>}

    <footer className={`boss-dock side-rail side-rail--player${turnLabel ? ' side-rail--turn boss-dock--turn' : ''}`}>
      <div className="boss-dock-context">
        <div className="boss-tools">
          {target ? <button className="ui-button" onClick={() => { setTarget(null); setSelected([]) }}>Cancel</button> : null}
          {preparing && (prepTarget || pending?.cardId === 'discard_for_damage') ? <button className="ui-button" onClick={() => cancelPrep(seat)}>Cancel</button> : null}
        </div>
        <span className="boss-instruction" role="status">{instruction ? <span>{instruction}</span> : null}{saveFailed ? <span>Saving unavailable</span> : null}</span>
      </div>
      {turnLabel ? <div className="side-rail__turn boss-turn" role="status" aria-live="polite" aria-atomic="true"><strong>{turnLabel}</strong></div> : null}
      <div className="boss-dock-end">
        {!setup ? <div className="table__piles boss-piles">
          <Pile kind="deck" sections="boss-deck" count={state.prep?.deck.length ?? state.deck.length}
            label="Deck" onOpen={() => setPanel('collection')} />
          <Pile kind="discard" sections="boss-discard" count={discard.length} topCard={discard.at(-1) ?? null}
            label="Discard pile" onOpen={() => setPanel('discard')} />
        </div> : null}
        <div className="boss-actions">
          {state.phase === 'collect' && bossCanSwitchLatest(state) && !target ? <button className="ui-button boss-switch-latest" onClick={() => send({ type: 'switch-latest' })}><SvgIcon name="swap" />Switch latests</button> : null}
          {target?.kind !== 'pocket-exchange' && (!drafting || target) ? <button className="ui-button ui-button--primary table__action" title={preparing ? `${primaryLabel}: ${seat ? 'right' : 'left'} hand` : undefined} disabled={Boolean(primaryDisabled)} onClick={accept}><SvgIcon name="check" />{primaryLabel}</button> : null}
        </div>
      </div>
    </footer>

    <PileSheet open={recycleSeat >= 0} cards={state.prep?.playerDiscard ?? []} contextHand={hands[recycleSeat] ?? []} onClose={() => clearPrepInput(recycleSeat)}
      onPick={uid => { const action = legalBySeat[recycleSeat]?.find(a => a.type === 'prepare' && a.sourceUid === prepTargets[recycleSeat]?.uid && a.targetUid === uid); if (action) applyPrep(recycleSeat, action) }} />
    <PileSheet open={panel === 'discard'} cards={state.prep?.playerDiscard ?? state.discard} contextHand={hands[seat]} onClose={() => setPanel(null)} />
    {panel === 'options' ? <BossOptions state={state} onClose={() => setPanel(null)} onAction={send}
      onApply={value => { send({ type: 'options', options: value }); setPanel(null) }}
      onNewDeal={() => newEncounter()} onChooseBoss={() => setPanel('bosses')} onExit={onExit}
      animation={animation} onAnimation={setAnimation} /> : null}
    <Sheet open={panel === 'bosses'} title="Choose boss" onClose={() => setPanel(null)}><div className="boss-choices boss-choices--sheet">{BOSSES.map(b => <div className="boss-choice" key={b.id}><CardButton card={bossCard(b.id, options)} animateMotion={false} onToggle={() => newEncounter(b.id)} /><span>{b.name}</span></div>)}</div></Sheet>
    <Sheet open={panel === 'help'} title={`${boss.name} · Co-op`} onClose={() => setPanel(null)}><div className="boss-help">
      <p>{ruleSummary}</p>
      <p>{options.absorption === 'all' ? 'The boss absorbs every leftover from both packs. Its printed filter is overridden in this version.' : boss.rule}</p>
      <p>{options.rounds} rounds. {separate ? 'Both players can pick from their own four-card packs in either order. After both finish picking, the boss collects the leftovers.' : 'Players pick from one shared pack. Alternate first picker.'} Both hands stay open. Before absorption, freely exchange the two latest picks with Switch latests. Earlier cards require Swap. Unabsorbed leftovers enter your shared Recycle pile. Boss specials do not activate. Hold any card to inspect.</p>
      <p>Enabled tools: {[options.pockets && 'Pocket', options.refresh && 'Refresh', options.swap && 'Swap', options.double && '2 now'].filter(Boolean).join(', ') || 'none'}. Pocket reserves a pack card during your turn or before absorption, without spending your pick. An empty Pocket draws a replacement; otherwise the held card returns to the pack. After the final absorption and before Prepare, exchange Pocket with one of your own hand cards. Refresh replaces one card from the active pack and sets the old card aside; it is unavailable during prep. Swap exchanges a card between hands, including during prep. “2 now” borrows your next round’s pick. Tool charges reset and Pockets start empty for a new encounter.</p>
      <p>Each player has a reusable Pocket and their own Refresh, Swap and “2 now” charge. Refresh changes the shared pack or your own separate pack; borrowing only skips your next-round pick. Swap uses the initiating player’s charge. Pocket closes when prep begins. During prep, Swap reopens both hands so damage types can be confirmed again. Finish required discards before changing those cards.</p>
      <p>Both hands prepare independently. Use either hand’s specials at any time. Touch a hand or choose its damage type, then confirm with the large bottom-right Accept/Ready button. Multiple eligible damage types require a choice before locking. Each hand handles its own discards; draws and Recycle update the shared piles immediately. Either hand may lock first; battle resolves when both are Ready.</p>
      <p>Each hero applies the boss’s shields using normal faction costs. Your shields add together against the boss. Team power = {options.weakerBonus ? 'higher score + twice the lower score' : 'Player 1 score + Player 2 score'}. Either hero can supply the Critter tiebreak; a Critter boss cancels it. All usual Robot and Dragon abilities apply.</p>
      <p>Pocket sits beside your name. Tap it, then tap a highlighted card to exchange immediately; Cancel leaves the cards in place. The other tools stay in your power strip. The round number appears briefly when a new round starts. Boss options holds presets, rules, replay controls and Jump to prep, which starts sample hands with Copy, Draw 2 and faction cards.</p>
      <p>These four encounters are a first prototype. Boss starting engines and difficulty are provisional.</p>
    </div></Sheet>
    <ScoreSheet open={panel === 'score'} onClose={() => setPanel(null)} />
    <Sheet open={panel === 'result' && Boolean(result)} title="Battle scores" onClose={() => setPanel(null)}>
      {result ? <BossScores result={result} hands={hands} monsterHand={monsterHand} bossName={boss.name} weakerBonus={options.weakerBonus} /> : null}
    </Sheet>
    <CollectionSheet open={panel === 'collection'} tabletop="abilities-new-cards" wildDeck={false} onClose={() => setPanel(null)} />
  </div>
}
