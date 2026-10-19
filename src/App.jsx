import { useMemo, useState } from 'react'
import { CardMotionProvider, useCardMotion } from './components/animation/CardMotionContext'
import ImagePreloader from './components/card/ImagePreloader'
import './App.css'
import HandArea from './components/hand/HandArea'
import ScreenMenu from './components/menu/ScreenMenu'
import PackArea from './components/board/PackArea'
import Pile from './components/board/Pile'
import ShuffleIntro from './components/board/ShuffleIntro'
import BattleArena from './components/battle/BattleArena'
import BattleOverlay from './components/battle/BattleOverlay'
import InfoOverlay from './components/overlay/InfoOverlay'
import CardInspectProvider from './components/overlay/CardInspect'
import PileSheet from './components/overlay/PileSheet'
import HelpSheet from './components/overlay/HelpSheet'
import SideRail, { Pips, ThinkingDots } from './components/hud/SideRail'
import { GameIcon, SvgIcon } from './components/ui/GameIcon'
import useBattlePlayback from './hooks/useBattlePlayback'
import useGameSession from './hooks/useGameSession'
import { useElementSize } from './hooks/useFitLayout'
import { SHUFFLE_LEAD_MS, getPackDealMs } from './hooks/dealTiming'
import { getHandStats } from './game/engine'
import { getHandAverageDamage } from './game/cardEvaluator'

const BATTLE_HEALTH = 21
const RESULT_LABELS = { player: 'Victory', opponent: 'Defeat', tie: 'Draw' }
const DECK_SECTIONS = ['draft-deck', 'draw-deck']
const DISCARD_SECTIONS = ['draft-discard', 'player-discard']

function mapBattleValues(bursts = []) {
  return bursts.reduce((acc, burst) => {
    if (!burst?.uid || !burst?.damage) return acc
    acc[burst.uid] = burst.damage
    return acc
  }, {})
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function AppContent() {
  const { animateCardMove, getAnchorRect, maskSlot, unmaskSlot } = useCardMotion()
  const session = useGameSession({ animateCardMove, getAnchorRect, maskSlot, unmaskSlot })
  const {
    settings,
    gameMode,
    game,
    selectedIds,
    battleStarted,
    battleKey,
    dealId,
    battleDeck,
    discardPhase,
    canStartBattle,
    deckCount,
    pendingDraftPickUid,
    canPickDraftCard,
    suppressedHandCardIds,
    resetGame,
    handleGameModeChange,
    updateSettings,
    toggleSelected,
    submitDiscard,
    handleDraftPick,
    startBattle,
    isWaitingForPlayerChoice,
    activatePlayerPreBattleCard,
    resolvePlayerRecyclePick,
    cancelPlayerRecyclePick,
    closePreBattleInfoOverlay,
    armedPlayerCopyUid,
    recycleSelectionCards,
    isRecyclePicking,
    recycleOverlay,
    resolvedPlayerHand,
    resolvedOpponentHand,
    activatablePreBattleIds,
    copyCandidateIds,
    isPreBattleReady,
    discardCards,
  } = session

  const {
    battlePlayback,
    battleResult,
    showBattleResult,
    damageFlash,
    speed,
    setSpeed,
    skipToEnd,
    roundIntervalMs,
  } = useBattlePlayback({
    battleStarted,
    battleInstance: battleKey,
    playerHand: resolvedPlayerHand,
    opponentHand: resolvedOpponentHand,
    deck: battleDeck,
  })

  const [tableRef, tableSize] = useElementSize()
  const [dismissedResultKey, setDismissedResultKey] = useState(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [pileOpen, setPileOpen] = useState(false)

  const layout = battleStarted
    ? 'battle'
    : (game.mode === 'draft' && game.phase !== 'battle-ready' ? 'draft' : 'focus')

  const playerHand = battleStarted ? (battlePlayback?.playerHand ?? resolvedPlayerHand) : resolvedPlayerHand
  const opponentHand = battleStarted ? (battlePlayback?.opponentHand ?? resolvedOpponentHand) : resolvedOpponentHand
  const playerStats = useMemo(() => getHandStats(playerHand), [playerHand])
  const opponentStats = useMemo(() => getHandStats(opponentHand), [opponentHand])
  const playerAverage = useMemo(() => getHandAverageDamage(playerHand), [playerHand])
  const opponentAverage = useMemo(() => getHandAverageDamage(opponentHand), [opponentHand])

  const opponentHidden = game.mode === 'five-hand-discard' && !settings.showOpponentCards && !battleStarted
  const opponentThinking = game.mode === 'draft' && game.phase === 'draft-opponent-thinking'
  const playerTurn = layout === 'draft' ? canPickDraftCard : layout === 'focus'
  const battleFinished = battleStarted && showBattleResult
  const resultDismissed = dismissedResultKey === battleKey
  const winner = battleFinished ? battleResult?.winner : null
  const dealLeadMs = game.mode === 'draft' ? (game.packNumber === 1 ? SHUFFLE_LEAD_MS : 0) : SHUFFLE_LEAD_MS

  // Row hands are capped relative to the table so the centre keeps the space.
  const tableHeight = tableSize.height || 700
  const rowHandCap = Math.round(tableHeight * (layout === 'draft' ? 0.165 : 0.2))
  const impactMs = clamp(Math.round(roundIntervalMs * 0.9), 320, 900)

  const playerBattleValues = battleStarted ? mapBattleValues(battlePlayback?.playerBursts) : null
  const opponentBattleValues = battleStarted ? mapBattleValues(battlePlayback?.opponentBursts) : null
  const battleRound = battleStarted ? (battlePlayback?.round ?? 0) : null

  const opponentLost = damageFlash?.opponent ?? 0
  const playerLost = damageFlash?.player ?? 0

  function handlePrimaryAction() {
    if (discardPhase) submitDiscard()
    else startBattle()
  }

  function handleNewGame() {
    setPileOpen(false)
    resetGame()
  }

  const piles = (
    <div className="table__piles">
      <Pile
        kind="deck"
        sections={DECK_SECTIONS}
        count={deckCount}
        pulse={game.phase === 'draft-pack-dealing'}
        label="Deck"
      />
      <Pile
        kind="discard"
        sections={DISCARD_SECTIONS}
        count={discardCards?.length ?? 0}
        topCard={discardCards?.[discardCards.length - 1] ?? null}
        pulse={game.phase === 'draft-pack-clearing'}
        onOpen={() => setPileOpen(true)}
        label="Discard pile"
      />
    </div>
  )

  let primaryAction = null
  if (layout === 'focus') {
    if (discardPhase) {
      const count = selectedIds.length
      primaryAction = (
        <button type="button" className="ui-button ui-button--primary table__action" onClick={handlePrimaryAction}>
          {count > 0 ? <GameIcon name="redraw" /> : <SvgIcon name="check" />}
          <span>{count > 0 ? `Redraw ${count}` : 'Keep'}</span>
        </button>
      )
    } else {
      primaryAction = (
        <button
          type="button"
          className="ui-button ui-button--primary table__action table__action--battle"
          onClick={handlePrimaryAction}
          disabled={!canStartBattle || isRecyclePicking}
        >
          <SvgIcon name="swords" />
          <span>Battle</span>
        </button>
      )
    }
  }

  const phasePips = game.mode === 'draft'
    ? <Pips total={5} current={game.phase === 'battle-ready' ? 6 : game.packNumber} done={game.phase === 'battle-ready' ? 5 : game.packNumber - 1} />
    : <Pips total={2} current={discardPhase ? game.playerDiscardsUsed + 1 : 3} done={game.playerDiscardsUsed} />

  const opponentHandProps = {
    hand: opponentHand,
    side: 'opponent',
    hidden: opponentHidden,
    motionSection: 'opponent-hand',
    suppressedIds: battleStarted ? [] : (suppressedHandCardIds?.opponent ?? []),
    activeCardIds: battleStarted ? (battlePlayback?.opponentTriggeredIds ?? []) : [],
    activationKey: battleStarted ? (battlePlayback?.activationTick ?? 0) : 0,
    battleValuesById: opponentBattleValues,
    battleRound,
    defeated: winner === 'player',
    cardsDisabled: true,
    animateOnMount: true,
    enterFromSection: 'draw-deck',
    enterBaseDelayMs: dealLeadMs + 300,
    inspectContextHand: opponentHand,
  }

  const playerInteractive = !battleStarted
  const playerHandProps = {
    hand: playerHand,
    side: 'player',
    motionSection: 'player-hand',
    suppressedIds: battleStarted ? [] : (suppressedHandCardIds?.player ?? []),
    onToggle: playerInteractive ? (isWaitingForPlayerChoice ? activatePlayerPreBattleCard : toggleSelected) : undefined,
    cardsDisabled: !playerInteractive || !(discardPhase || isWaitingForPlayerChoice),
    discardIds: discardPhase ? selectedIds : [],
    selectedIds: isPreBattleReady && armedPlayerCopyUid ? [armedPlayerCopyUid] : [],
    readyIds: isPreBattleReady ? activatablePreBattleIds : [],
    targetableIds: isPreBattleReady ? copyCandidateIds : [],
    activeCardIds: battleStarted ? (battlePlayback?.playerTriggeredIds ?? []) : [],
    activationKey: battleStarted ? (battlePlayback?.activationTick ?? 0) : 0,
    battleValuesById: playerBattleValues,
    battleRound,
    defeated: winner === 'opponent',
    animateOnMount: true,
    enterFromSection: 'draw-deck',
    enterBaseDelayMs: dealLeadMs,
  }

  return (
    <div
      className={['app-shell', `app-shell--${layout}`].join(' ')}
      style={{ '--impact-ms': `${impactMs}ms`, '--burst-ms': `${Math.max(600, impactMs + 200)}ms` }}
    >
      <ImagePreloader />

      <main ref={tableRef} className={['table', `table--${layout}`].join(' ')}>
        <SideRail
          side="opponent"
          stats={opponentHidden ? {} : opponentStats}
          average={layout === 'battle' || opponentHidden ? null : opponentAverage}
          health={battleStarted ? (battlePlayback?.opponentHealth ?? BATTLE_HEALTH) : null}
          lost={opponentLost}
          hitTick={damageFlash?.tick ?? null}
          shield={battleStarted ? (battlePlayback?.opponentShield ?? 0) : 0}
          blocked={damageFlash?.opponentBlocked ?? 0}
          turn={opponentThinking}
          winner={winner}
        >
          {opponentThinking ? <ThinkingDots /> : null}
          {layout !== 'battle' ? phasePips : null}
          <ScreenMenu
            onNewGame={handleNewGame}
            gameMode={gameMode}
            onChangeGameMode={handleGameModeChange}
            settings={settings}
            onUpdateSettings={updateSettings}
            onHelp={() => setHelpOpen(true)}
          />
        </SideRail>

        <div className="table__zone table__zone--opponent">
          <HandArea
            key={`opp-${layout === 'battle' ? 'grid' : 'row'}`}
            {...opponentHandProps}
            layout={layout === 'battle' ? 'grid' : 'row'}
            maxCardHeight={layout === 'battle' ? Infinity : rowHandCap}
            showEmptySlots={layout === 'draft'}
          />
        </div>

        <div className="table__zone table__zone--center">
          <ShuffleIntro key={dealId} />
          {layout === 'draft' ? (
            <PackArea
              packKey={`${dealId}-${game.packNumber}`}
              row={game.draftRow}
              onPick={handleDraftPick}
              canPick={canPickDraftCard}
              eyedUid={opponentThinking ? pendingDraftPickUid : null}
              eyedDelayMs={game.picksThisPack === 0 ? getPackDealMs(game.draftRow.length, game.packNumber === 1) : 250}
              playerHand={playerHand}
              dealDelayMs={dealLeadMs}
              turn={canPickDraftCard ? 'player' : (opponentThinking ? 'opponent' : null)}
            />
          ) : null}
          {layout === 'focus' ? (
            <HandArea key="player-focus" {...playerHandProps} layout="grid" />
          ) : null}
          {layout === 'battle' ? (
            <BattleArena
              battlePlayback={battlePlayback}
              impactMs={impactMs}
              speed={speed}
              onToggleSpeed={() => setSpeed(speed > 1 ? 1 : 2.5)}
              onSkip={skipToEnd}
              finished={battleFinished}
              resultLabel={RESULT_LABELS[winner] ?? ''}
              onShowResult={() => setDismissedResultKey(null)}
            />
          ) : null}
        </div>

        {layout !== 'focus' ? (
          <div className="table__zone table__zone--player">
            <HandArea
              key={`player-${layout}`}
              {...playerHandProps}
              layout={layout === 'battle' ? 'grid' : 'row'}
              maxCardHeight={layout === 'battle' ? Infinity : rowHandCap}
              showEmptySlots={layout === 'draft'}
            />
          </div>
        ) : null}

        <SideRail
          side="player"
          stats={playerStats}
          average={layout === 'battle' ? null : playerAverage}
          health={battleStarted ? (battlePlayback?.playerHealth ?? BATTLE_HEALTH) : null}
          lost={playerLost}
          hitTick={damageFlash?.tick ?? null}
          shield={battleStarted ? (battlePlayback?.playerShield ?? 0) : 0}
          blocked={damageFlash?.playerBlocked ?? 0}
          turn={playerTurn}
          winner={winner}
          crowded={Boolean(primaryAction)}
        >
          {layout !== 'battle' ? piles : null}
          {primaryAction}
          {battleFinished ? (
            <button type="button" className="ui-button ui-button--primary table__action" onClick={handleNewGame}>
              <SvgIcon name="replay" />
              <span>Again</span>
            </button>
          ) : null}
        </SideRail>
      </main>

      <BattleOverlay
        visible={battleFinished && !resultDismissed}
        battlePlayback={battlePlayback}
        battleResult={battleResult}
        onNewGame={handleNewGame}
        onClose={() => setDismissedResultKey(battleKey)}
      />

      <PileSheet
        open={pileOpen && !isRecyclePicking}
        cards={discardCards ?? []}
        onClose={() => setPileOpen(false)}
        contextHand={playerHand}
      />

      <PileSheet
        open={isRecyclePicking}
        cards={recycleSelectionCards}
        onPick={resolvePlayerRecyclePick}
        onClose={cancelPlayerRecyclePick}
        contextHand={playerHand}
      />

      <HelpSheet open={helpOpen} onClose={() => setHelpOpen(false)} />

      <InfoOverlay
        visible={Boolean(recycleOverlay)}
        title={recycleOverlay?.title ?? 'Notice'}
        message={recycleOverlay?.message ?? ''}
        onClose={closePreBattleInfoOverlay}
      />
    </div>
  )
}

function App() {
  return (
    <CardMotionProvider>
      <CardInspectProvider>
        <AppContent />
      </CardInspectProvider>
    </CardMotionProvider>
  )
}

export default App
