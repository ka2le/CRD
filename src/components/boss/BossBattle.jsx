import { useEffect, useReducer, useState } from 'react'
import { BOSSES, BOSS_SAVE_VERSION, BOSS_STORAGE, bossCard, bossDefinition, bossHand, bossReducer, createBossRun, matchesBossFilter, pocketCatalog, bossOptions, bossPackSize, bossDraftRows, bossToolCharges } from '../../game/bossBattle'
import BossOptions from './BossOptions'
import { getPreparationActions } from '../../game/preparationState'
import { chooseTabletopType, getCardTabletopTypes, getTabletopProfile, scoreTabletopHand } from '../../game/tabletop'
import HandArea from '../hand/HandArea'
import CardButton from '../card/CardButton'
import ScreenMenu from '../menu/ScreenMenu'
import Sheet from '../overlay/Sheet'
import PileSheet from '../overlay/PileSheet'
import ScoreSheet from '../overlay/ScoreSheet'
import CollectionSheet from '../overlay/CollectionSheet'
import { GameIcon, SvgIcon } from '../ui/GameIcon'
import { TabletopFormula } from '../battle/TabletopScore'
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
    <HandArea {...props} layout="row" slots={size.width < 360 ? Math.min(3, slots) : slots}
      maxCardHeight={Math.min(300, size.height)} />
  </div>
}

export default function BossBattle({ onExit }) {
  const [state, dispatch] = useReducer(bossReducer, undefined, restore)
  const [panel, setPanel] = useState(null)
  const [target, setTarget] = useState(null)
  const [selected, setSelected] = useState([])
  const [prepTargets, setPrepTargets] = useState([null, null])
  const [discardSelections, setDiscardSelections] = useState([[], []])
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
  const seat = target?.seat ?? (preparing ? state.activeSeat : state.turns[0] ?? 0)
  const hands = state.prep ? [state.prep.playerHand, state.prep.opponentHand] : state.hands
  const legalBySeat = [0, 1].map(i => preparing ? getPreparationActions(state.prep, i ? 'opponent' : 'player') : [])
  const pendingBySeat = [0, 1].map(i => preparing ? state.prep[`${i ? 'opponent' : 'player'}PendingDiscard`] : null)
  const pending = pendingBySeat[seat], prepTarget = prepTargets[seat]
  const needsType = preparing && getTabletopProfile(hands[seat]).types.length > 1 && !state.types[seat]
  const recycleSeat = prepTargets.findIndex(t => t?.kind === 'recycle')
  const monsterHand = bossHand(state)
  const bp = getTabletopProfile(monsterHand)
  const discard = state.prep?.playerDiscard ?? state.discard
  const handProfiles = hands.map((h, i) => scoreTabletopHand(h, bp.shields, state.types[i] ?? chooseTabletopType(h)))
  const total = handProfiles.reduce((n, p) => n + p.score, 0) + (options.weakerBonus ? Math.min(...handProfiles.map(p => p.score)) : 0)
  const allCleared = state.cleared.length === BOSSES.length

  function send(action) {
    dispatch(action); setTarget(null); setSelected([])
    setPrepTargets([null, null]); setDiscardSelections([[], []])
  }
  function newEncounter(id = state.bossId, cleared = state.cleared) {
    send({ type: 'new', options: { bossId: id, pockets: state.pockets.map(c => c.id), cleared, options, testMode: state.testMode } })
    setPanel(null)
  }
  function clearPrepInput(index) {
    setPrepTargets(old => old.map((v, i) => i === index ? null : v))
    setDiscardSelections(old => old.map((v, i) => i === index ? [] : v))
  }
  function applyPrep(index, action) {
    dispatch({ type: 'prepare', seat: index, action })
    clearPrepInput(index)
  }
  function openPower(kind, index) {
    if (kind === 'swap') { setPrepTargets([null, null]); setDiscardSelections([[], []]) }
    else if (preparing) clearPrepInput(index)
    setSelected([]); setTarget({ kind, seat: index })
  }
  function takePocket() {
    if (drafting && state.turns.includes(seat)) send({ type: 'pocket', seat })
    else { setTarget({ kind: 'pocket-exchange', seat }); setSelected([]) }
  }
  function cancelPrep(index) {
    if (pendingBySeat[index]?.cardId === 'discard_for_damage') dispatch({ type: 'cancel-sacrifice', seat: index })
    clearPrepInput(index)
  }
  function acceptPrep(index) {
    const pending = pendingBySeat[index]
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
      if (index === target.seat) setSelected([uid])
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
      const types = getCardTabletopTypes(card, getTabletopProfile(hands[index]))
      if (types.length === 1) dispatch({ type: 'faction', seat: index, faction: types[0] })
      return
    }
    if (card.id === 'copy_card_in_hand' || card.id === 'recycle_card') {
      setPrepTargets(old => old.map((v, i) => i === index ? { kind: card.id === 'copy_card_in_hand' ? 'copy' : 'recycle', uid } : v)); return
    }
    applyPrep(index, actions[0])
  }
  function accept() {
    if (target?.kind === 'pocket-exchange') {
      const action = { type: 'pocket', seat, uid: selected[0] }
      if (preparing) { dispatch(action); clearPrepInput(seat); setTarget(null); setSelected([]) }
      else send(action)
      return
    }
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

  const accepting = pending || ['refresh', 'swap', 'pocket-exchange'].includes(target?.kind)
  const primaryLabel = accepting ? 'Accept' : setup ? 'Draft' : state.phase === 'collect' ? 'Absorb'
    : state.phase === 'collected' ? (state.pack === options.rounds ? 'Prepare' : 'Next pack')
      : preparing ? 'Ready' : state.phase === 'result' ? (result.winner !== 'team' ? 'Try again' : allCleared ? 'New run' : 'Next boss') : 'Pick a card'
  const primaryDisabled = drafting && !target || target?.kind === 'refresh' && selected.length !== 1 ||
    target?.kind === 'swap' && selected.length !== 2 || target?.kind === 'pocket-exchange' && selected.length !== 1 || preparing && !target && (Boolean(prepTarget)
      || (pending ? pending.remaining !== null && discardSelections[seat].length !== pending.remaining : needsType))
  const instruction = target?.kind === 'refresh' ? 'Choose a card to refresh' : target?.kind === 'swap' ? 'Choose one card from each hand'
    : target?.kind === 'pocket-exchange' ? 'Choose a card to replace with Pocket'
    : prepTarget?.kind === 'copy' ? 'Choose a Copy target'
      : pending ? `Discard ${pending.remaining === null ? 'any cards' : pending.remaining}`
        : needsType ? 'Choose damage type'
        : ''
  const outcome = result?.winner === 'team' ? 'Victory' : result?.winner === 'boss' ? 'Defeat' : 'Draw'

  return <div className={`app-shell boss-shell${state.phase === 'result' ? ' boss-shell--result' : ''}`}>
    <header className="boss-header">
      <button className="ui-button ui-button--icon" aria-label="Boss rules" onClick={() => setPanel('help')}><SvgIcon name="help" /></button>
      <button className="boss-heading" onClick={() => setPanel('bosses')} aria-label="Choose boss"><GameIcon name="monster" />{boss.name}<span>{state.cleared.length}/4</span></button>
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
      {options.pockets ? <div className="boss-pocket-setup">{[0, 1].map(i => <div key={i}>
        <span>Player {i + 1} · Pocket</span>
        <div className="boss-pocket-options">{pocketCatalog().map(c => <div key={c.id}>
          <CardButton card={{ ...c, uid: `equip_${i}_${c.id}` }} animateMotion={false} selected={state.pockets[i].id === c.id}
            onToggle={() => send({ type: 'pocket-choice', seat: i, id: c.id })} />
        </div>)}</div>
      </div>)}</div> : null}
    </main> : <main className={`boss-table${preparing || state.phase === 'result' ? ' boss-table--resolve' : ''}${state.phase === 'result' ? ' boss-table--result' : ''}`}>
      <section className="boss-enemy" aria-label="Boss hand">
        <LiveTabletopLedger hand={monsterHand} enemyHand={hands.flat()} name={boss.name} />
        <div className="boss-portrait"><CardButton card={bossCard(state.bossId, options)} animateMotion={false} onToggle={() => setPanel('help')} /></div>
        <div className="boss-acquisitions">
          <HandArea hand={state.absorbed} layout="grid" slots={Math.max(1, state.absorbed.length)} animateOnMount={false}
            activeCardIds={animation ? state.lastAbsorbed : []} activationKey={state.pack} inspectContextHand={monsterHand} />
        </div>
      </section>

      <section className="boss-center" aria-label={state.phase === 'result' ? 'Battle result' : 'Draft pack'}>
        {swapWindow ? <div key={`${state.seed}-${state.pack}`} className="local-turn-notice boss-round-notice" role="status">Round {state.pack}</div> : null}
        {state.phase === 'result' ? <div className={`boss-result${animation ? ' boss-result--animate' : ''}`}>
          <strong className="boss-result__title">{outcome}</strong>
          <div className="boss-result__equation"><span>{result.heroes[0].score}</span><span>+</span><span>{result.heroes[1].score}</span>{options.weakerBonus ? <><span>+</span><span className="boss-result__bonus">{result.weakerBonus}<small>weaker hand</small></span></> : null}<span>=</span><strong>{result.teamPower}</strong><span>vs</span><strong>{result.boss.score}</strong></div>
          {result.teamPower === result.boss.score ? <span>{result.winner === 'draw' ? 'Equal power' : 'Critter tiebreak'}</span> : null}
          <div className="boss-result-actions"><button className="ui-button" onClick={() => setPanel('result')}>Details</button><button className="ui-button" onClick={() => send({ type: 'replay-prep' })}>Replay prep</button></div>
        </div> : rows.some(row => row.length) ? <div className={`boss-draft-packs${separate ? ' boss-draft-packs--separate' : ''}`}>
          {rows.map((row, i) => <div key={i} className={`boss-draft-pack${drafting && (!separate || state.turns.includes(i)) ? ' boss-draft-pack--active' : ''}`} data-draft-seat={separate ? i : 'shared'} role="group" aria-label={separate ? `Player ${i + 1} pack` : 'Shared pack'}>
            <HandArea hand={row} layout="grid" slots={bossPackSize(state)} maxCardHeight={380} animateOnMount={false}
              onToggle={(drafting && (!separate || state.turns.includes(i)) && !target || ['draft', 'collect'].includes(state.phase) && target?.kind === 'refresh' && (!separate || target.seat === i)) ? uid => target?.kind === 'refresh' ? setSelected([uid]) : send({ type: 'pick', uid, ...(separate ? { seat: i } : {}) }) : undefined}
              selectedIds={selected} readyIds={state.phase === 'collect' ? row.filter(c => options.absorption === 'all' || matchesBossFilter(c, boss.filter)).map(c => c.uid) : []}
              inspectContextHand={hands[separate ? i : seat]} />
          </div>)}
        </div> : <div className="boss-center-summary">
            <Power value={total} />
          </div>}
      </section>

      <section className="boss-heroes" aria-label="Team hands">{hands.map((hand, i) => {
        const ready = preparing && state.prep[`${i ? 'opponent' : 'player'}Finished`]
        const active = drafting ? separate ? state.turns.includes(i) : seat === i : preparing && !ready
        const legal = legalBySeat[i], pending = pendingBySeat[i], prepTarget = prepTargets[i]
        const selection = discardSelections[i]
        const types = getTabletopProfile(hand).types
        return <div key={i} className={`boss-hero${active ? ' boss-hero--active' : ''}${preparing && seat === i ? ' boss-hero--focus' : ''}`} data-seat={i} role="group" aria-label={`Player ${i + 1} hand`}
          onClick={() => { if (preparing && !ready) dispatch({ type: 'seat', seat: i }) }}>
          <div className={`boss-zone-label${preparing ? ' boss-zone-label--prepare' : ''}`}>
            {separate && powerWindow ? <div className="boss-player-powers" role="group" aria-label={`Player ${i + 1} powers`}>
              {options.pockets ? <button className="ui-button ui-button--icon" aria-label={`Player ${i + 1} Pocket`} title="Pocket" disabled={state.pocketUsed[i] || Boolean(pending) || !hands[i].length && !state.turns.includes(i) || Boolean(target)} onClick={() => openPower('pocket', i)}><GameIcon name="draw" /></button> : null}
              {options.refresh && !preparing ? <button className="ui-button ui-button--icon" aria-label={`Player ${i + 1} Refresh`} title="Refresh your pack" disabled={!['draft', 'collect'].includes(state.phase) || !rows[i]?.length || !state.deck.length || !bossToolCharges(state, i).refresh || Boolean(target)} onClick={() => openPower('refresh', i)}><GameIcon name="redraw" /></button> : null}
              {options.double && !preparing ? <button className="ui-button ui-button--icon" aria-label={`Player ${i + 1} 2 now`} title="Pick twice now; pass next round" disabled={!['draft', 'collect'].includes(state.phase) || !rows[i]?.length || !bossToolCharges(state, i).double || state.debt[i] || state.pack === options.rounds || Boolean(target)} onClick={() => send({ type: 'double', seat: i })}><span className="boss-double-icon">2</span><GameIcon name="draw" /></button> : null}
              {options.swap ? <button className="ui-button ui-button--icon" aria-label={`Player ${i + 1} Swap`} title="Swap one card between hands" disabled={!bossToolCharges(state, i).swap || !hands[0].length || !hands[1].length || pendingBySeat.some(Boolean) || Boolean(target)} onClick={() => openPower('swap', i)}><SvgIcon name="swap" /></button> : null}
            </div> : null}
            <div className="boss-factions">{preparing && active && !pending && !prepTarget && !target && types.length > 1 ? types.map(f => <button key={f} aria-label={`Player ${i + 1} ${f}`} aria-pressed={state.types[i] === f} className="ui-button ui-button--icon" onClick={() => dispatch({ type: 'faction', seat: i, faction: f })}><GameIcon name={f} /></button>) : null}</div>
            <span className="boss-player-name">
              {!separate ? <span>Player {i + 1} </span> : null}<Power value={result?.heroes[i].score ?? handProfiles[i].score} type={result?.heroes[i].damageType ?? handProfiles[i].damageType} />{ready ? ' ✓' : ''}
            </span>
          </div>
          <BossHeroHand hand={hand} slots={options.rounds} animateOnMount={false} selectedIds={['swap', 'pocket-exchange'].includes(target?.kind) ? selected : preparing ? selection : selected}
            onToggle={preparing && !ready || target?.kind === 'swap' || target?.kind === 'pocket-exchange' && target.seat === i ? uid => clickHand(i, uid) : undefined} inspectContextHand={hand}
            readyIds={preparing && active && !pending ? legal.some(a => a.type === 'prepare')
              ? [...new Set(legal.filter(a => a.type === 'prepare').map(a => a.sourceUid))]
              : types.length > 1 ? hand.filter(c => getCardTabletopTypes(c, getTabletopProfile(hand)).length).map(c => c.uid) : [] : []}
            targetableIds={target?.kind === 'swap' || target?.kind === 'pocket-exchange' && target.seat === i ? hand.map(c => c.uid) : preparing && active && prepTarget?.kind === 'copy' ? legal.filter(a => a.sourceUid === prepTarget.uid && a.type === 'prepare').map(a => a.targetUid) : []}
            showEmptySlots />
        </div>
      })}</section>
    </main>}

    <footer className="boss-dock side-rail side-rail--player">
      {!setup ? <div className="table__piles boss-piles">
        <Pile kind="deck" sections="boss-deck" count={state.prep?.deck.length ?? state.deck.length}
          label="Deck" onOpen={() => setPanel('collection')} />
        <Pile kind="discard" sections="boss-discard" count={discard.length} topCard={discard.at(-1) ?? null}
          label="Discard pile" onOpen={() => setPanel('discard')} />
      </div> : <span />}
      <div className="boss-tools">
        {drafting ? <>
          {options.pockets && !separate ? <button className="ui-button" disabled={state.pocketUsed[seat] || Boolean(target)} title="Take your pocket card instead of a row card; uses this pick" onClick={() => setTarget({ kind: 'pocket' })}><GameIcon name="draw" /><span>Pocket</span></button> : null}
          {options.refresh && !separate ? <button className="ui-button" disabled={!state.tools.refresh || Boolean(target)} title="Replace one row card; removed cards are set aside" onClick={() => { setTarget({ kind: 'refresh' }); setSelected([]) }}><GameIcon name="redraw" /><span>Refresh</span></button> : null}
          {options.double && !separate ? <button className="ui-button" disabled={!state.tools.double || state.pack === options.rounds || Boolean(target)} title="Take two picks this pack; skip your next pack's pick" onClick={() => send({ type: 'double' })}><GameIcon name="draw" /><span>2 now</span></button> : null}
        </> : null}
        {preparing && !separate && options.pockets ? <button className="ui-button" disabled={state.pocketUsed[seat] || Boolean(pending) || Boolean(target)} onClick={() => openPower('pocket', seat)}><GameIcon name="draw" /><span>Pocket</span></button> : null}
        {options.swap && !separate && powerWindow ? <button className="ui-button" disabled={!state.tools.swap || !hands[0].length || !hands[1].length || pendingBySeat.some(Boolean) || Boolean(target)} title="Exchange one card between hands, including during preparation" onClick={() => openPower('swap', seat)}><SvgIcon name="swap" /><span>Swap</span></button> : null}
        {target ? <button className="ui-button" onClick={() => { setTarget(null); setSelected([]) }}>Cancel</button> : null}
        {preparing && (prepTarget || pending?.cardId === 'discard_for_damage') ? <button className="ui-button" onClick={() => cancelPrep(seat)}>Cancel</button> : null}
      </div>
      <span className="boss-instruction" role="status">{saveFailed ? 'Saving unavailable' : instruction}</span>
      {!drafting || target && target.kind !== 'pocket' ? <button className="ui-button ui-button--primary table__action" title={preparing ? `${primaryLabel}: ${seat ? 'right' : 'left'} hand` : undefined} disabled={Boolean(primaryDisabled)} onClick={accept}><SvgIcon name="check" />{primaryLabel}</button> : null}
    </footer>

    <Sheet open={target?.kind === 'pocket'} title={`Player ${seat + 1} · Pocket`} onClose={() => setTarget(null)}>
      <div className="boss-pocket-preview"><CardButton card={state.pockets[seat]} animateMotion={false} onToggle={takePocket} /></div>
      <p className="boss-help">{drafting && state.turns.includes(seat) ? 'Take this instead of your row pick. The boss still receives eligible leftovers.' : 'Tap this Pocket card, then choose which hand card to replace.'}</p>
    </Sheet>
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
      <p>{options.rounds} rounds. {separate ? 'Both players can pick from their own four-card packs in either order. After both finish picking, the boss collects the leftovers.' : 'Players pick from one shared pack. Alternate first picker.'} Both hands stay open. Unabsorbed leftovers enter your shared Recycle pile. Boss specials do not activate. Hold any card to inspect.</p>
      <p>Enabled tools: {[options.pockets && 'Pocket', options.refresh && 'Refresh', options.swap && 'Swap', options.double && '2 now'].filter(Boolean).join(', ') || 'none'}. Pocket replaces a normal pick, or a card in your hand after picking and during prep. Refresh replaces one card from the active pack and sets the old card aside; it is unavailable during prep. Swap exchanges a card between hands, including during prep. “2 now” borrows your next round’s pick. Tool charges reset for a new encounter; pocket choices carry forward.</p>
      {separate ? <p>Each player has their own Pocket, Refresh, Swap and “2 now” charge. Refresh only changes your pack; borrowing only skips your next-round pick. Swap uses the initiating player’s charge. During prep, Pocket reopens your hand and Swap reopens both hands so damage types can be confirmed again. Finish required discards before changing those cards.</p> : null}
      <p>Both hands prepare independently. Use either hand’s specials at any time. Touch a hand or choose its damage type, then confirm with the large bottom-right Accept/Ready button. Multiple eligible damage types require a choice before locking. Each hand handles its own discards; draws and Recycle update the shared piles immediately. Either hand may lock first; battle resolves when both are Ready.</p>
      <p>Each hero applies the boss’s shields using normal faction costs. Your shields add together against the boss. Team power = {options.weakerBonus ? 'higher score + twice the lower score' : 'Player 1 score + Player 2 score'}. Either hero can supply the Critter tiebreak; a Critter boss cancels it. All usual Robot and Dragon abilities apply.</p>
      <p>Each column has its own power strip. The round number appears briefly when a new round starts. Boss options holds presets, rules, replay controls and test shortcuts; jumping to prep fills remaining picks with the first card in each pack.</p>
      <p>These four encounters are a first prototype. Boss starting engines and difficulty are provisional.</p>
    </div></Sheet>
    <ScoreSheet open={panel === 'score'} onClose={() => setPanel(null)} />
    <Sheet open={panel === 'result' && Boolean(result)} title="Battle scores" onClose={() => setPanel(null)}>
      {result ? <div className="boss-result-details"><TabletopFormula score={result.boss} label={boss.name} />
        {result.heroes.map((h, i) => <TabletopFormula key={i} score={h} label={`Player ${i + 1}`} />)}
        <p className="boss-help">Team: {result.heroes[0].score} + {result.heroes[1].score}{options.weakerBonus ? ` + ${result.weakerBonus} weaker-hand bonus` : ''} = {result.teamPower}.</p></div> : null}
    </Sheet>
    <CollectionSheet open={panel === 'collection'} tabletop="abilities-new-cards" wildDeck={false} onClose={() => setPanel(null)} />
  </div>
}
