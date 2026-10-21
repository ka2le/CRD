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
import TabletopScore from './components/battle/TabletopScore'
import InfoOverlay from './components/overlay/InfoOverlay'
import CardInspectProvider from './components/overlay/CardInspect'
import PileSheet from './components/overlay/PileSheet'
import HelpSheet from './components/overlay/HelpSheet'
import ScoreSheet from './components/overlay/ScoreSheet'
import CollectionSheet from './components/overlay/CollectionSheet'
import FactionPicker from './components/overlay/FactionPicker'
import TestDeckSheet from './components/overlay/TestDeckSheet'
import SideRail, { Pips, ThinkingDots } from './components/hud/SideRail'
import { GameIcon, SvgIcon } from './components/ui/GameIcon'
import useBattlePlayback from './hooks/useBattlePlayback'
import useGameSession from './hooks/useGameSession'
import useRoom from './hooks/useRoom'
import RoomSheet from './components/overlay/RoomSheet'
import RoomEntry from './components/overlay/RoomEntry'
import PlayerIdentity from './components/hud/PlayerIdentity'
import RoomButtons from './components/hud/RoomButtons'
import { EmoteBubble, EmotePicker } from './components/hud/Emotes'
import { useElementSize } from './hooks/useFitLayout'
import { SHUFFLE_LEAD_MS, getPackDealMs } from './hooks/dealTiming'
import { getHandStats } from './game/engine'
import { getHandAverageDamage } from './game/cardEvaluator'
import { getCardTabletopTypes } from './game/tabletop'
import { getOpponentAiName } from './game/opponentAi'

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
  const room = useRoom()
  const session = useGameSession({ animateCardMove, getAnchorRect, maskSlot, unmaskSlot, room })
  const [roomOpen, setRoomOpen] = useState(false)
  // A failed automatic copy (no clipboard permission) opens the room sheet so the link can be copied by hand.
  const [copyFailureSeen, setCopyFailureSeen] = useState(0)
  const roomSheetOpen = roomOpen || room.copyFailedAt > copyFailureSeen
  function closeRoomSheet() {
    setRoomOpen(false)
    setCopyFailureSeen(room.copyFailedAt)
  }
  const roomRequest = room.presence?.pending?.[0]
  const roomStatus = room.error
    || (roomRequest ? `${roomRequest.name} wants to ${roomRequest.desired === 'viewer' ? 'watch' : 'play'} · tap to answer`
      : room.record?.role === 'pending' ? 'Waiting for the host to let you in' : room.notice)
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
    opponentDiscarding,
    opponentPreparing,
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
    tabletopChoice,
    choosingTabletopType,
    choosePlayerTabletopType,
    cancelTabletopTypeChoice,
    tabletopTypeCardUid,
    tabletopSelectedCardUid,
    testEditable,
    testDeckZones,
    swapTestDeckCards,
    moveTestDeckCardToTop,
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
    tabletop: settings.tabletop,
    playerType: tabletopChoice.selectedType,
    opponentType: session.opponentTabletopType,
  })

  const [tableRef, tableSize] = useElementSize()
  const [dismissedResultKey, setDismissedResultKey] = useState(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [scoreOpen, setScoreOpen] = useState(false)
  const [pileOpen, setPileOpen] = useState(false)
  // Deck browser: 'collection' (every card in the game) or 'test' (testing: the live deck/zones).
  const [deckView, setDeckView] = useState(null)

  const testDeckAvailable = Boolean(settings.testing && !battleStarted)

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
  const opponentThinking = (game.mode === 'draft' && game.phase === 'draft-opponent-thinking') || opponentDiscarding
    || opponentPreparing
  const playerTurn = !session.onlineBlocked && (layout === 'draft' ? canPickDraftCard : layout === 'focus')
  const battleFinished = battleStarted && showBattleResult
  const resultDismissed = dismissedResultKey === battleKey
  const winner = battleFinished ? battleResult?.winner : null
  const roster = room.presence ?? room.record?.roster
  const spectating = session.online && room.record?.role === 'viewer'
  const guestSeat = room.record?.role === 'guest'
  const ownMember = session.online ? (guestSeat ? roster?.guest : roster?.host) : null
  const rivalMember = session.online ? (guestSeat ? roster?.host : roster?.guest) : null
  const playerName = ownMember?.name ?? room.profile.name
  const opponentName = rivalMember?.name ?? (session.online ? 'Player two' : getOpponentAiName(settings.opponentAi))
  const winnerName = winner === 'player' ? playerName : winner === 'opponent' ? opponentName : ''
  const resultLabel = winner === 'tie' ? 'Draw' : winnerName ? `${spectating ? '' : `${RESULT_LABELS[winner]} · `}${winnerName} wins` : ''
  function winsFor(member) {
    if (!member) return null
    const score = room.record?.scores?.[member.id] ?? 0
    return score - (battleStarted && !showBattleResult && session.rawSession.roomResult?.winnerId === member.id ? 1 : 0)
  }
  // Emotes: online players only. Viewers see the host at the bottom, like the host does.
  const seated = session.online && ['host', 'guest'].includes(room.record?.role)
  const bottomSeat = guestSeat ? 'guest' : 'host'
  const emote = session.online ? room.emote : null
  const emoteSide = emote ? (emote.seat === bottomSeat ? 'player' : 'opponent') : null
  const bottomIdentity = <>
    <PlayerIdentity name={playerName} wins={winsFor(ownMember)}
      connected={!session.online || (room.connection === 'connected' && Boolean(ownMember?.connected))}
      editable={!spectating} onRename={(name) => room.client.rename(name)} />
    {seated ? <EmotePicker onSend={(id) => room.client.sendEmote(id)} disabled={room.connection !== 'connected'} /> : null}
  </>
  const topIdentity = <PlayerIdentity name={opponentName} wins={winsFor(rivalMember)}
    connected={!session.online || (room.connection === 'connected' && Boolean(rivalMember?.connected))} />
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
    if (session.online && room.record?.role !== 'host') { setRoomOpen(true); return }
    setPileOpen(false)
    if (deckView === 'test') setDeckView(null)
    resetGame()
  }

  const piles = (
    <div className="table__piles">
      <Pile
        kind="deck"
        sections={DECK_SECTIONS}
        count={deckCount}
        pulse={game.phase === 'draft-pack-dealing'}
        onOpen={() => setDeckView(testDeckAvailable ? 'test' : 'collection')}
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
    if (opponentDiscarding) {
      primaryAction = (
        <button type="button" className="ui-button ui-button--primary table__action" disabled>
          <GameIcon name="redraw" />
          <span>Waiting</span>
        </button>
      )
    } else if (discardPhase) {
      const count = selectedIds.length
      primaryAction = (
        <button type="button" className="ui-button ui-button--primary table__action" disabled={session.onlineBlocked} onClick={handlePrimaryAction}>
          {count > 0 ? <GameIcon name="redraw" /> : <SvgIcon name="check" />}
          <span>{session.onlineDiscardSubmitted ? 'Waiting' : count > 0 ? `Redraw ${count}` : 'Keep'}</span>
        </button>
      )
    } else {
      primaryAction = (
        <button
          type="button"
          className="ui-button ui-button--primary table__action table__action--battle"
          onClick={handlePrimaryAction}
          disabled={!canStartBattle || isRecyclePicking || (choosingTabletopType && tabletopChoice.needsChoice)}
        >
          <SvgIcon name="swords" />
          <span>{choosingTabletopType && tabletopChoice.needsChoice ? 'Choose type' : (opponentPreparing ? 'Waiting' : 'Battle')}</span>
        </button>
      )
    }
  }

  const phasePips = game.mode === 'draft'
    ? <Pips total={5} current={game.phase === 'battle-ready' ? 6 : game.packNumber} done={game.phase === 'battle-ready' ? 5 : game.packNumber - 1} />
    : <Pips total={2} current={discardPhase ? game.playerDiscardsUsed + 1 : (opponentDiscarding ? game.playerDiscardsUsed : 3)} done={opponentDiscarding ? game.playerDiscardsUsed - 1 : game.playerDiscardsUsed} />

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
    defeated: winner === 'player' && !resultDismissed,
    cardsDisabled: true,
    animateOnMount: !game.devScenario,
    enterFromSection: game.devScenario ? null : 'draw-deck',
    enterBaseDelayMs: dealLeadMs + 300,
    inspectContextHand: opponentHand,
  }

  const playerInteractive = !battleStarted && !session.onlineBlocked && !opponentPreparing
  const chameleonIds = settings.tabletop && isPreBattleReady && !opponentPreparing
    ? playerHand.filter((card) => card.id === 'chameleon').map((card) => card.uid) : []
  function handlePlayerCardClick(uid) {
    if (discardPhase) toggleSelected(uid)
    else if (!armedPlayerCopyUid && !isRecyclePicking && (chameleonIds.includes(uid) || choosingTabletopType)) choosePlayerTabletopType(uid)
    else if (isWaitingForPlayerChoice) activatePlayerPreBattleCard(uid)
  }
  const factionPickerCard = playerHand.find((card) => card.uid === tabletopTypeCardUid)
  const playerHandProps = {
    hand: playerHand,
    side: 'player',
    motionSection: 'player-hand',
    suppressedIds: battleStarted ? [] : (suppressedHandCardIds?.player ?? []),
    onToggle: playerInteractive ? handlePlayerCardClick : undefined,
    cardsDisabled: !playerInteractive || opponentPreparing || !(discardPhase || isWaitingForPlayerChoice || choosingTabletopType || chameleonIds.length),
    discardIds: discardPhase ? selectedIds : [],
    selectedIds: isPreBattleReady && armedPlayerCopyUid ? [armedPlayerCopyUid] : (isPreBattleReady && tabletopSelectedCardUid ? [tabletopSelectedCardUid] : []),
    readyIds: isPreBattleReady ? [...activatablePreBattleIds, ...chameleonIds] : [],
    targetableIds: choosingTabletopType ? playerHand.filter((card) => getCardTabletopTypes(card, tabletopChoice).length).map((card) => card.uid) : (isPreBattleReady ? copyCandidateIds : []),
    dimmedIds: choosingTabletopType ? playerHand.filter((card) => !getCardTabletopTypes(card, tabletopChoice).length).map((card) => card.uid) : [],
    activeCardIds: battleStarted ? (battlePlayback?.playerTriggeredIds ?? []) : [],
    activationKey: battleStarted ? (battlePlayback?.activationTick ?? 0) : 0,
    battleValuesById: playerBattleValues,
    battleRound,
    defeated: winner === 'opponent' && !resultDismissed,
    animateOnMount: !game.devScenario,
    enterFromSection: game.devScenario ? null : 'draw-deck',
    enterBaseDelayMs: dealLeadMs,
  }

  return (
    <div
      className={['app-shell', `app-shell--${layout}`].join(' ')}
      style={{ '--impact-ms': `${impactMs}ms`, '--burst-ms': `${Math.max(600, impactMs + 200)}ms` }}
    >
      <ImagePreloader />
      {room.entry ? <RoomEntry key={room.entry.key} room={room} /> : null}
      {roomStatus && !roomSheetOpen ? <button type="button" className={`room-status${room.error ? ' room-status--error' : room.presence?.pending?.length ? ' room-status--request' : ''}`} onClick={() => setRoomOpen(true)}>
        {roomStatus}
      </button> : null}

      <main ref={tableRef} className={['table', `table--${layout}`].join(' ')}>
        <SideRail
          side="opponent"
          identity={topIdentity}
          stats={opponentHidden ? {} : opponentStats}
          average={layout === 'battle' || opponentHidden ? null : opponentAverage}
          tabletop={settings.tabletop}
          health={battleStarted && !settings.tabletop ? (battlePlayback?.opponentHealth ?? BATTLE_HEALTH) : null}
          lost={opponentLost}
          hitTick={damageFlash?.tick ?? null}
          shield={battleStarted ? (battlePlayback?.opponentShield ?? 0) : 0}
          blocked={damageFlash?.opponentBlocked ?? 0}
          turn={opponentThinking}
          winner={winner}
        >
          <EmoteBubble emote={emoteSide === 'opponent' ? emote : null} side="opponent" />
          {opponentThinking ? <ThinkingDots /> : null}
          {layout !== 'battle' ? phasePips : null}
          <RoomButtons room={room} onOpenRoom={() => setRoomOpen(true)} />
          <ScreenMenu
            onNewGame={handleNewGame}
            gameMode={gameMode}
            onChangeGameMode={handleGameModeChange}
            settings={settings}
            onUpdateSettings={updateSettings}
            onHelp={() => setHelpOpen(true)}
            onScoreCard={() => setScoreOpen(true)}
            onCollection={() => setDeckView('collection')}
            onTestDeck={() => setDeckView('test')}
            onRoom={() => setRoomOpen(true)}
            inRoom={Boolean(room.record)}
            canConfigure={!session.online || room.record?.role === 'host'}
            humanOpponent={session.online}
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
          {!game.devScenario ? <ShuffleIntro key={dealId} /> : null}
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
          {choosingTabletopType ? (
            <div className="tabletop-choice" role="status">
              {tabletopChoice.selectedType ? <span className="tabletop-choice__selected">Main type <GameIcon name={tabletopChoice.selectedType} /></span> : <span>Choose your main damage type: tap a highlighted card</span>}
            </div>
          ) : null}
          {layout === 'battle' && settings.tabletop ? (
            <TabletopScore result={battleResult} resultLabel={resultLabel} onShowResult={() => setDismissedResultKey(null)} />
          ) : null}
          {layout === 'battle' && !settings.tabletop ? (
            <BattleArena
              battlePlayback={battlePlayback}
              impactMs={impactMs}
              speed={speed}
              onToggleSpeed={() => setSpeed(speed > 1 ? 1 : 2.5)}
              onSkip={skipToEnd}
              finished={battleFinished}
              resultLabel={resultLabel}
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
          identity={bottomIdentity}
          stats={playerStats}
          average={layout === 'battle' ? null : playerAverage}
          tabletop={settings.tabletop}
          health={battleStarted && !settings.tabletop ? (battlePlayback?.playerHealth ?? BATTLE_HEALTH) : null}
          lost={playerLost}
          hitTick={damageFlash?.tick ?? null}
          shield={battleStarted ? (battlePlayback?.playerShield ?? 0) : 0}
          blocked={damageFlash?.playerBlocked ?? 0}
          turn={playerTurn}
          winner={winner}
          crowded={Boolean(primaryAction)}
        >
          <EmoteBubble emote={emoteSide === 'player' ? emote : null} side="player" />
          {layout !== 'battle' ? piles : null}
          {primaryAction}
          {battleFinished && session.replayPreparation ? (
            <button type="button" className="ui-button ui-button--icon table__action" onClick={session.replayPreparation}
              aria-label="Replay from preparation" title="Replay from preparation (testing)">
              <SvgIcon name="rewind" />
            </button>
          ) : null}
          {battleFinished && (!session.online || room.record?.role === 'host') ? (
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
        playerName={playerName}
        opponentName={opponentName}
        spectating={spectating}
        newGameLabel={session.online && room.record?.role !== 'host' ? 'Room controls' : 'Play again'}
        onNewGame={handleNewGame}
        onReplayPreparation={session.replayPreparation}
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

      <TestDeckSheet
        open={testDeckAvailable && deckView === 'test'}
        zones={testDeckZones}
        editable={testEditable}
        onSwap={swapTestDeckCards}
        onToTop={moveTestDeckCardToTop}
        onClose={() => setDeckView(null)}
        onSwitch={setDeckView}
        contextHand={playerHand}
      />

      <HelpSheet open={helpOpen} onClose={() => setHelpOpen(false)} tabletop={settings.tabletop} />
      <RoomSheet open={roomSheetOpen} onClose={closeRoomSheet} room={room} />
      <FactionPicker open={Boolean(isPreBattleReady && factionPickerCard)}
        types={factionPickerCard ? getCardTabletopTypes(factionPickerCard, tabletopChoice) : []}
        selectedType={tabletopChoice.selectedType}
        onChoose={(type) => choosePlayerTabletopType(tabletopTypeCardUid, type)}
        onClose={cancelTabletopTypeChoice} />
      <ScoreSheet open={scoreOpen} onClose={() => setScoreOpen(false)} />
      <CollectionSheet
        open={deckView === 'collection'}
        onClose={() => setDeckView(null)}
        onSwitch={testDeckAvailable ? setDeckView : null}
        tabletop={settings.tabletop}
        wildDeck={Boolean(settings.wildDeck)}
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
      <CardInspectProvider>
        <AppContent />
      </CardInspectProvider>
    </CardMotionProvider>
  )
}

export default App
