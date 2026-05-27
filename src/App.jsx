import { CardMotionProvider, useCardMotion } from './components/animation/CardMotionContext'
import ImagePreloader from './components/card/ImagePreloader'
import './App.css'
import HandArea from './components/hand/HandArea'
import ScreenMenu from './components/menu/ScreenMenu'
import DrawBoard from './components/board/DrawBoard'
import DraftBoard from './components/board/DraftBoard'
import BattleView from './components/battle/BattleView'
import BattleOverlay from './components/battle/BattleOverlay'
import InfoOverlay from './components/overlay/InfoOverlay'
import useBattlePlayback from './hooks/useBattlePlayback'
import useGameSession, { getDrawActionLabel } from './hooks/useGameSession'

function mapBattleValues(bursts = []) {
  return bursts.reduce((acc, burst) => {
    if (!burst?.uid || !burst?.damage) return acc
    acc[burst.uid] = burst.damage
    return acc
  }, {})
}

function AppContent() {
  const { animateCardMove, getAnchorRect, maskSlot, unmaskSlot } = useCardMotion()
  const {
    settings,
    gameMode,
    game,
    selectedIds,
    battleStarted,
    battleLogOpen,
    toggleBattleLog,
    battleKey,
    battleDeck,
    discardPhase,
    canStartBattle,
    deckCount,
    pendingDraftPickUid,
    draftActivationTick,
    canPickDraftCard,
    suppressedHandCardIds,
    resetGame,
    handleGameModeChange,
    updateSettings,
    toggleSelected,
    submitDiscard,
    handleDraftPick,
    closeBattleOverlay,
    startBattle,
    isWaitingForPlayerChoice,
    highlightedPreBattleIds,
    playerTargetableIds,
    activatePlayerPreBattleCard,
    resolvePlayerRecyclePick,
    closePreBattleInfoOverlay,
    armedPlayerCopyUid,
    recycleSelectionCards,
    isRecyclePicking,
    recycleOverlay,
    resolvedPlayerHand,
    resolvedOpponentHand,
  } = useGameSession({
    animateCardMove,
    getAnchorRect,
    maskSlot,
    unmaskSlot,
  })

  const {
    battlePlayback,
    battleResult,
    showBattleResult,
    damageFlash,
  } = useBattlePlayback({
    battleStarted,
    battleInstance: battleKey,
    playerHand: resolvedPlayerHand,
    opponentHand: resolvedOpponentHand,
    deck: battleDeck,
  })

  const playerBattleValues = battleStarted ? mapBattleValues(battlePlayback?.playerBursts) : {}
  const opponentBattleValues = battleStarted ? mapBattleValues(battlePlayback?.opponentBursts) : {}

  const drawActionLabel = discardPhase ? getDrawActionLabel(selectedIds.length) : 'Battle'
  const drawActionHandler = discardPhase ? submitDiscard : startBattle
  const drawActionDisabled = discardPhase ? false : !canStartBattle

  return (
    <div className="app-shell">
      <ImagePreloader />
      <ScreenMenu
        onNewGame={() => resetGame()}
        gameMode={gameMode}
        onChangeGameMode={handleGameModeChange}
        settings={settings}
        onUpdateSettings={updateSettings}
      />

      <main className="table-layout">
        <HandArea
          hand={battleStarted ? (battlePlayback?.opponentHand ?? resolvedOpponentHand) : resolvedOpponentHand}
          hidden={game.mode === 'five-hand-discard' && !settings.showOpponentCards && !battleStarted}
          motionSection="opponent-hand"
          suppressedIds={battleStarted ? [] : (suppressedHandCardIds?.opponent ?? [])}
          activeCardIds={isWaitingForPlayerChoice ? highlightedPreBattleIds : (battleStarted ? (battlePlayback?.opponentTriggeredIds ?? []) : [])}
          activationTick={battleStarted ? (battlePlayback?.activationTick ?? 0) : 0}
          animateOnMount
          preserveSpace
          battleValuesById={opponentBattleValues}
          className="table-slot table-slot--top"
        />

        {battleStarted ? (
          <BattleView
            key={battleKey}
            battlePlayback={battlePlayback}
            battleLogOpen={battleLogOpen}
            onToggleBattleLog={toggleBattleLog}
            damageFlash={damageFlash}
          />
        ) : game.mode === 'draft' ? (
          <DraftBoard
            draftRow={game.draftRow}
            draftDiscardCount={game.draftDiscard.length}
            deckCount={deckCount}
            onPickCard={handleDraftPick}
            canPick={canPickDraftCard}
            showBattleButton={game.phase === 'battle-ready'}
            onStartBattle={startBattle}
            startBattleDisabled={!canStartBattle}
            pendingOpponentPickUid={pendingDraftPickUid}
            draftActivationTick={draftActivationTick}
            phase={game.phase}
            centerCards={isRecyclePicking ? recycleSelectionCards : null}
            centerLabel={isRecyclePicking ? 'Pick 1 Discarded Card' : ''}
            centerAction={isRecyclePicking ? resolvePlayerRecyclePick : null}
            centerCardsDisabled={!isRecyclePicking}
            tooltipContextHand={resolvedPlayerHand}
          />
        ) : (
          <DrawBoard
            deckCount={deckCount}
            discardCount={game.playerDiscards.length}
            onPrimaryAction={drawActionHandler}
            primaryActionLabel={drawActionLabel}
            primaryActionDisabled={drawActionDisabled || isRecyclePicking}
            centerCards={isRecyclePicking ? recycleSelectionCards : null}
            centerLabel={isRecyclePicking ? 'Pick 1 Discarded Card' : ''}
            centerAction={isRecyclePicking ? resolvePlayerRecyclePick : null}
            centerCardsDisabled={!isRecyclePicking}
            tooltipContextHand={resolvedPlayerHand}
          />
        )}

        <HandArea
          hand={battleStarted ? (battlePlayback?.playerHand ?? resolvedPlayerHand) : resolvedPlayerHand}
          motionSection="player-hand"
          suppressedIds={battleStarted ? [] : (suppressedHandCardIds?.player ?? [])}
          selectedIds={isWaitingForPlayerChoice && armedPlayerCopyUid ? [armedPlayerCopyUid] : selectedIds}
          onToggle={isWaitingForPlayerChoice ? activatePlayerPreBattleCard : toggleSelected}
          activeCardIds={isWaitingForPlayerChoice ? highlightedPreBattleIds : (battleStarted ? (battlePlayback?.playerTriggeredIds ?? []) : [])}
          activationTick={battleStarted ? (battlePlayback?.activationTick ?? 0) : 0}
          animateOnMount
          preserveSpace
          cardsDisabled={isWaitingForPlayerChoice ? false : battleStarted}
          targetableIds={isWaitingForPlayerChoice ? playerTargetableIds : []}
          battleValuesById={playerBattleValues}
          className="table-slot table-slot--bottom"
        />
      </main>

      <BattleOverlay
        visible={showBattleResult}
        battlePlayback={battlePlayback}
        battleResult={battleResult}
        onNewGame={() => resetGame()}
        onClose={closeBattleOverlay}
      />

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
      <AppContent />
    </CardMotionProvider>
  )
}

export default App
