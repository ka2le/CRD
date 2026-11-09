import { useMemo, useState } from 'react'
import { CardMotionProvider, useCardMotion } from './components/animation/CardMotionContext'
import ImagePreloader from './components/card/ImagePreloader'
import './App.css'
import HandArea from './components/hand/HandArea'
import ScreenMenu from './components/menu/ScreenMenu'
import PackArea from './components/board/PackArea'
import TwentyCardsBoard from './components/board/TwentyCardsBoard'
import { twentyCardsScore } from './game/twentyCards'
import Pile from './components/board/Pile'
import ShuffleIntro from './components/board/ShuffleIntro'
import BattleArena from './components/battle/BattleArena'
import BattleOverlay from './components/battle/BattleOverlay'
import TabletopScore from './components/battle/TabletopScore'
import TabletopResolution from './components/battle/TabletopResolution'
import useBattleAnimationSetting from './hooks/useBattleAnimationSetting'
import { canAnimateTabletopResolution } from './game/tabletopResolution'
import InfoOverlay from './components/overlay/InfoOverlay'
import LocalHandoff from './components/overlay/LocalHandoff'
import CardInspectProvider from './components/overlay/CardInspect'
import PileSheet from './components/overlay/PileSheet'
import HelpSheet from './components/overlay/HelpSheet'
import ScoreSheet from './components/overlay/ScoreSheet'
import CollectionSheet from './components/overlay/CollectionSheet'
import FactionPicker from './components/overlay/FactionPicker'
import TestDeckSheet from './components/overlay/TestDeckSheet'
import SideRail, { Pips } from './components/hud/SideRail'
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
import { getLocalDisplaySeat, localPlayerName } from './game/localMultiplayer'
import BossBattle from './components/boss/BossBattle'
import { BOSS_MODE_STORAGE } from './game/bossBattle'

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

function AppContent({ onBossBattle }) {
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
  const [battleAnimation, setBattleAnimation] = useBattleAnimationSetting()

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
    animate: battleAnimation,
  })
  // Tabletop scores count up on the table first; the result waits for that.
  const [tabletopCountedKey, setTabletopCountedKey] = useState(null)
  const tabletopLedger = Boolean(settings.tabletop && canAnimateTabletopResolution(battleResult))
  const tabletopCounting = tabletopLedger && battleAnimation && tabletopCountedKey !== battleKey

  const [tableRef, tableSize] = useElementSize()
  const [dismissedResultKey, setDismissedResultKey] = useState(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [scoreOpen, setScoreOpen] = useState(false)
  const [pileOpen, setPileOpen] = useState(false)
  // Deck browser: 'collection' (every card in the game) or 'test' (testing: the live deck/zones).
  const [deckView, setDeckView] = useState(null)

  const testDeckAvailable = Boolean(settings.testing && !battleStarted && !session.localMultiplayer && game.mode !== '20cards' && !game.secretCard)
  const lineupPhase = game.mode === '20cards' && game.phase === 'lineup'

  const layout = battleStarted
    ? 'battle'
    : lineupPhase ? 'lineup' : (game.mode === 'draft' && game.phase !== 'battle-ready' ? 'draft' : 'focus')

  const playerHand = battleStarted ? (battlePlayback?.playerHand ?? resolvedPlayerHand) : resolvedPlayerHand
  const opponentHand = battleStarted ? (battlePlayback?.opponentHand ?? resolvedOpponentHand) : resolvedOpponentHand
  const playerStats = useMemo(() => getHandStats(playerHand), [playerHand])
  const opponentVisibleHand = !battleStarted && game.secretCard ? opponentHand.filter(card => !card.secret) : opponentHand
  const opponentStats = getHandStats(opponentVisibleHand)
  const playerAverage = useMemo(() => getHandAverageDamage(playerHand), [playerHand])
  const opponentAverage = getHandAverageDamage(opponentVisibleHand)

  const privateLocalTurn = session.localMultiplayer && !battleStarted && !session.localPlay.showAll
    && (game.mode === 'five-hand-discard' || game.mode === '20cards' || game.secretOpening || game.phase === 'battle-ready')
  const localHandoff = Boolean(session.localPlay?.handoff)
  const opponentHidden = localHandoff || privateLocalTurn || (!battleStarted && (game.mode === '20cards' || (game.mode === 'five-hand-discard' && !settings.showOpponentCards)))
  const opponentThinking = (game.mode === 'draft' && game.phase === 'draft-opponent-thinking') || opponentDiscarding
    || opponentPreparing
  const playerTurn = !session.onlineBlocked && (layout === 'draft' ? canPickDraftCard : layout === 'focus')
  const battleFinished = battleStarted && showBattleResult && !tabletopCounting
  const resultDismissed = dismissedResultKey === battleKey
  const winner = battleFinished ? battleResult?.winner : null
  const matchScore = game.mode === '20cards' ? twentyCardsScore([...game.roundResults,
    ...(battleFinished && battleResult && !game.optionalRound ? [battleResult.winner] : [])]) : null
  const nextRoundAvailable = matchScore && battleFinished && !matchScore.complete
  const thirdRoundAvailable = matchScore?.complete && battleFinished && game.roundIndex === 1
  function handleMatchContinue() {
    if (nextRoundAvailable) session.nextMatchRound()
    else handleNewGame()
  }
  const roster = room.presence ?? room.record?.roster
  const spectating = session.online && room.record?.role === 'viewer'
  const guestSeat = room.record?.role === 'guest'
  const ownMember = session.online ? (guestSeat ? roster?.guest : roster?.host) : null
  const rivalMember = session.online ? (guestSeat ? roster?.host : roster?.guest) : null
  const localSeat = session.localPlay?.seat
  const displayLocalSeat = session.localMultiplayer ? getLocalDisplaySeat(session.rawSession) : localSeat
  const rivalLocalSeat = displayLocalSeat === 'host' ? 'guest' : 'host'
  const playerName = session.localMultiplayer ? localPlayerName(session.rawSession, displayLocalSeat) : ownMember?.name ?? room.profile.name
  const opponentName = session.localMultiplayer ? localPlayerName(session.rawSession, rivalLocalSeat)
    : rivalMember?.name ?? (session.online ? 'Player two' : getOpponentAiName(settings.opponentAi))
  const draftTurn = game.phase === 'draft-player-pick' && (canPickDraftCard || spectating)
    ? 'player' : game.phase === 'draft-opponent-thinking' ? 'opponent' : null
  const draftTurnLabel = draftTurn === 'player'
    ? (spectating || session.localMultiplayer ? `${playerName}'s turn` : 'Your turn')
    : draftTurn === 'opponent' ? `${opponentName}'s turn`
      : game.phase === 'draft-player-pick' ? 'Waiting to connect' : 'Next pack'
  const winnerName = winner === 'player' ? playerName : winner === 'opponent' ? opponentName : ''
  const resultLabel = winner === 'tie' ? 'Draw' : winnerName ? `${spectating || session.localMultiplayer ? '' : `${RESULT_LABELS[winner]} · `}${winnerName} wins` : ''
  function winsFor(member) {
    if (!member) return null
    const score = room.record?.scores?.[member.id] ?? 0
    return score - (battleStarted && !battleFinished && session.rawSession.roomResult?.winnerId === member.id ? 1 : 0)
  }
  // Emotes: online players only. Viewers see the host at the bottom, like the host does.
  const seated = session.online && ['host', 'guest'].includes(room.record?.role)
  const bottomSeat = guestSeat ? 'guest' : 'host'
  const emote = session.online ? room.emote : null
  const emoteSide = emote ? (emote.seat === bottomSeat ? 'player' : 'opponent') : null
  const bottomIdentity = <>
    <PlayerIdentity name={playerName} wins={winsFor(ownMember)}
      connected={!session.online || (room.connection === 'connected' && Boolean(ownMember?.connected))}
      editable={!spectating} label={session.localMultiplayer ? 'Player name' : undefined}
      onRename={(name) => session.localMultiplayer ? session.renameLocalPlayer(displayLocalSeat, name) : room.client.rename(name)} />
    {seated ? <EmotePicker onSend={(id) => room.client.sendEmote(id)} disabled={room.connection !== 'connected'} /> : null}
  </>
  const topIdentity = <PlayerIdentity name={opponentName} wins={winsFor(rivalMember)}
    editable={session.localMultiplayer} label="Player name" onRename={(name) => session.renameLocalPlayer(rivalLocalSeat, name)}
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

  const preparationDiscardPending = isPreBattleReady ? session.pendingPreparationDiscard : null
  const damageDiscard = preparationDiscardPending?.cardId === 'discard_for_damage'
  const preparationDiscardSelected = preparationDiscardPending?.selectedIds ?? []

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
        count={privateLocalTurn ? 0 : discardCards?.length ?? 0}
        topCard={privateLocalTurn ? null : discardCards?.[discardCards.length - 1] ?? null}
        pulse={game.phase === 'draft-pack-clearing'}
        onOpen={privateLocalTurn ? undefined : () => setPileOpen(true)}
        label="Discard pile"
      />
    </div>
  )

  let primaryAction = null
  if (layout === 'focus' && !localHandoff) {
    if (preparationDiscardPending) {
      primaryAction = <div className="table__discard-actions">
        {damageDiscard ? <button type="button" className="ui-button table__action" disabled={session.onlineBlocked} onClick={session.cancelPreparationDiscard}>Cancel</button> : null}
        <button type="button" className="ui-button ui-button--primary table__action"
          disabled={session.onlineBlocked || (!damageDiscard && preparationDiscardSelected.length !== preparationDiscardPending.remaining)}
          onClick={session.submitPreparationDiscard}>
          <SvgIcon name="check" /><span>Accept {damageDiscard && preparationDiscardSelected.includes(preparationDiscardPending.sourceUid) ? 0 : preparationDiscardSelected.length}{!damageDiscard ? `/${preparationDiscardPending.remaining}` : null}</span>
          {damageDiscard ? <GameIcon name="damage" /> : null}
        </button>
      </div>
    } else if (opponentDiscarding) {
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
          <span>{choosingTabletopType && tabletopChoice.needsChoice ? 'Choose type' : (opponentPreparing ? 'Waiting' : session.localMultiplayer ? 'Ready' : 'Battle')}</span>
        </button>
      )
    }
  }

  if (lineupPhase && !localHandoff) {
    const lineupComplete = new Set(game.playerLineup.filter(Boolean)).size === game.playerLineup.length
    primaryAction = (
      <button type="button" className="ui-button ui-button--primary table__action table__action--lock"
        disabled={!lineupComplete || game.playerLocked || session.onlineBlocked} onClick={session.lockLineup}>
        <SvgIcon name="check" /><span>{game.playerLocked ? 'Waiting' : 'Lock in'}</span>
      </button>
    )
  }

  const phasePips = game.mode === 'draft'
    ? <Pips total={game.handSize ?? 5} current={game.phase === 'battle-ready' ? (game.handSize ?? 5) + 1 : game.packNumber} done={game.phase === 'battle-ready' ? (game.handSize ?? 5) : game.packNumber - 1} />
    : game.mode === '20cards' ? <span className="match-score">Round {game.roundIndex + 1} · {matchScore.player} – {matchScore.opponent}</span>
    : <Pips total={2} current={discardPhase ? game.playerDiscardsUsed + 1 : (opponentDiscarding ? game.playerDiscardsUsed : 3)} done={opponentDiscarding ? game.playerDiscardsUsed - 1 : game.playerDiscardsUsed} />

  const opponentHandProps = {
    hand: privateLocalTurn && isPreBattleReady ? game.opponentHand : opponentHand,
    side: 'opponent',
    hidden: opponentHidden,
    hiddenIds: !battleStarted && game.secretCard && !(session.localMultiplayer && !game.secretOpening && localSeat === 'guest') ? opponentHand.filter(card => card.secret).map(card => card.uid) : [],
    secretIds: !battleStarted && game.secretCard ? opponentHand.filter(card => card.secret).map(card => card.uid) : [],
    motionSection: 'opponent-hand',
    suppressedIds: battleStarted ? [] : (suppressedHandCardIds?.opponent ?? []),
    activeCardIds: battleStarted ? (battlePlayback?.opponentTriggeredIds ?? []) : [],
    activationKey: battleStarted ? (battlePlayback?.activationTick ?? 0) : 0,
    battleValuesById: opponentBattleValues,
    battleRound,
    defeated: winner === 'player' && !resultDismissed,
    cardsDisabled: true,
    animateOnMount: !game.devScenario && !session.localMultiplayer,
    enterFromSection: game.devScenario || session.localMultiplayer ? null : 'draw-deck',
    enterBaseDelayMs: dealLeadMs + 300,
    inspectContextHand: opponentVisibleHand,
  }

  const playerInteractive = !battleStarted && !session.onlineBlocked && !opponentPreparing
  const chameleonIds = settings.tabletop && isPreBattleReady && !opponentPreparing
    ? playerHand.filter((card) => card.id === 'chameleon').map((card) => card.uid) : []
  function handlePlayerCardClick(uid) {
    if (preparationDiscardPending) session.togglePreparationDiscard(uid)
    else if (discardPhase) toggleSelected(uid)
    else if (!armedPlayerCopyUid && !isRecyclePicking && (chameleonIds.includes(uid) || choosingTabletopType)) choosePlayerTabletopType(uid)
    else if (isWaitingForPlayerChoice) activatePlayerPreBattleCard(uid)
  }
  const factionPickerCard = playerHand.find((card) => card.uid === tabletopTypeCardUid)
  const playerHandProps = {
    slots: game.handSize ?? 5,
    hand: playerHand,
    hidden: localHandoff,
    hiddenIds: !battleStarted && game.secretCard && session.localMultiplayer && !game.secretOpening && localSeat === 'guest' ? playerHand.filter(card => card.secret).map(card => card.uid) : [],
    secretIds: !battleStarted && game.secretCard ? playerHand.filter(card => card.secret).map(card => card.uid) : [],
    side: 'player',
    motionSection: 'player-hand',
    suppressedIds: battleStarted ? [] : (suppressedHandCardIds?.player ?? []),
    onToggle: playerInteractive && !localHandoff ? handlePlayerCardClick : undefined,
    cardsDisabled: localHandoff || !playerInteractive || opponentPreparing || !(preparationDiscardPending || discardPhase || isWaitingForPlayerChoice || choosingTabletopType || chameleonIds.length),
    discardIds: localHandoff ? [] : preparationDiscardPending ? preparationDiscardSelected : discardPhase ? selectedIds : [],
    selectedIds: localHandoff ? [] : isPreBattleReady && armedPlayerCopyUid ? [armedPlayerCopyUid] : (isPreBattleReady && tabletopSelectedCardUid ? [tabletopSelectedCardUid] : []),
    readyIds: !localHandoff && isPreBattleReady && !preparationDiscardPending ? [...activatablePreBattleIds, ...chameleonIds] : [],
    targetableIds: localHandoff ? [] : choosingTabletopType ? playerHand.filter((card) => getCardTabletopTypes(card, tabletopChoice).length).map((card) => card.uid) : (isPreBattleReady ? copyCandidateIds : []),
    dimmedIds: !localHandoff && choosingTabletopType ? playerHand.filter((card) => !getCardTabletopTypes(card, tabletopChoice).length).map((card) => card.uid) : [],
    activeCardIds: battleStarted ? (battlePlayback?.playerTriggeredIds ?? []) : [],
    activationKey: battleStarted ? (battlePlayback?.activationTick ?? 0) : 0,
    battleValuesById: playerBattleValues,
    battleRound,
    defeated: winner === 'opponent' && !resultDismissed,
    animateOnMount: !game.devScenario && !session.localMultiplayer,
    enterFromSection: game.devScenario || session.localMultiplayer ? null : 'draw-deck',
    enterBaseDelayMs: dealLeadMs,
  }

  return (
    <div
      className={['app-shell', `app-shell--${layout}`].join(' ')}
      style={{ '--impact-ms': `${impactMs}ms`, '--burst-ms': `${Math.max(600, impactMs + 200)}ms` }}
    >
      <ImagePreloader tabletop={settings.tabletop} />
      <div className="local-table-content">
      {room.entry ? <RoomEntry key={room.entry.key} room={room} /> : null}
      {roomStatus && !roomSheetOpen ? <button type="button" className={`room-status${room.error ? ' room-status--error' : room.presence?.pending?.length ? ' room-status--request' : ''}`} onClick={() => setRoomOpen(true)}>
        {roomStatus}
      </button> : null}
        {session.opponentAiFeedback?.error ? <div className="ai-status" role="alert">
          {session.opponentAiFeedback.error}
          <button type="button" onClick={session.retryOpponentAi}>Retry</button>
        </div> : null}

      <main ref={tableRef} className={['table', `table--${layout}`].join(' ')}>
        <SideRail
          side="opponent"
          identity={topIdentity}
          stats={opponentHidden ? {} : opponentStats}
          hideStats={opponentHidden}
          average={layout === 'battle' || opponentHidden ? null : opponentAverage}
          tabletop={settings.tabletop}
          health={battleStarted && !settings.tabletop ? (battlePlayback?.opponentHealth ?? BATTLE_HEALTH) : null}
          lost={opponentLost}
          hitTick={damageFlash?.tick ?? null}
          shield={battleStarted ? (battlePlayback?.opponentShield ?? 0) : 0}
          blocked={damageFlash?.opponentBlocked ?? 0}
          turn={layout === 'draft' ? draftTurn === 'opponent' : opponentThinking}
          turnLabel={layout === 'draft' && draftTurn === 'opponent' ? draftTurnLabel : null}
          winner={winner}
        >
          <EmoteBubble emote={emoteSide === 'opponent' ? emote : null} side="opponent" />
          {layout !== 'battle' || matchScore ? phasePips : null}
          {!session.localMultiplayer ? <RoomButtons room={room} onOpenRoom={() => setRoomOpen(true)} /> : null}
          {session.localMultiplayer && layout === 'focus' ? <button type="button" className="ui-button local-visibility"
            onClick={session.toggleLocalShowAll} aria-pressed={session.localPlay.showAll}>
            <SvgIcon name="eye" /><span>{session.localPlay.showAll ? 'Hide' : 'Show all'}</span>
          </button> : null}
          <ScreenMenu
            onBossBattle={onBossBattle}
            onNewGame={handleNewGame}
            gameMode={gameMode}
            onChangeGameMode={handleGameModeChange}
            settings={settings}
            onUpdateSettings={updateSettings}
            battleAnimation={battleAnimation}
            onBattleAnimation={(next) => {
              // Turning it on mid-battle keeps the result already on the table.
              if (next && battleStarted) setTabletopCountedKey(battleKey)
              setBattleAnimation(next)
            }}
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
            slots={game.handSize ?? 5}
            key={`opp-${layout === 'battle' ? 'grid' : 'row'}`}
            {...opponentHandProps}
            layout={layout === 'battle' ? 'grid' : 'row'}
            maxCardHeight={layout === 'battle' ? Infinity : rowHandCap}
            showEmptySlots={layout === 'draft'}
          />
        </div>

        <div className="table__zone table__zone--center">
          {session.localMultiplayer && layout === 'draft' ? <div className="local-turn-notice" role="status"
            key={`${dealId}-${game.packNumber}-${game.picksThisPack}-${localSeat}`}>
            <GameIcon name="copy" /><span>{draftTurn === 'opponent' ? opponentName : playerName}’s turn</span>
          </div> : null}
          {localHandoff ? <LocalHandoff name={playerName} onReveal={session.revealLocalTurn} /> : null}
          {!game.devScenario ? <ShuffleIntro key={dealId} /> : null}
          {lineupPhase && !localHandoff ? <TwentyCardsBoard key={`${dealId}-${localSeat ?? 'solo'}`}
            pool={game.playerPool} lineup={game.playerLineup} locked={game.playerLocked}
            onPlace={session.placeLineupCard} /> : null}
          {layout === 'draft' && !localHandoff && !(game.secretOpening && opponentThinking) ? (
            <PackArea
              packKey={`${dealId}-${game.packNumber}-${game.secretOpening ? localSeat ?? 'secret' : 'public'}`}
              packSize={game.secretOpening ? 5 : game.packSize ?? 5}
              row={game.draftRow}
              onPick={handleDraftPick}
              canPick={canPickDraftCard}
              eyedUid={opponentThinking ? pendingDraftPickUid : null}
              eyedDelayMs={game.picksThisPack === 0 ? getPackDealMs(game.draftRow.length, game.packNumber === 1) : 250}
              playerHand={session.localMultiplayer && draftTurn === 'opponent' ? opponentHand : playerHand}
              dealDelayMs={dealLeadMs}
              turn={draftTurn}
            />
          ) : null}
          {game.secretOpening && opponentThinking && !localHandoff ? <div className="secret-pick-wait" role="status"><SvgIcon name="eye-off" />Opponent choosing a secret card</div> : null}
          {layout === 'focus' ? (
            <HandArea key="player-focus" {...playerHandProps} layout="grid" />
          ) : null}
          {choosingTabletopType && !localHandoff ? (
            <div className="tabletop-choice" role="status">
              {tabletopChoice.selectedType ? <span className="tabletop-choice__selected">Main type <GameIcon name={tabletopChoice.selectedType} /></span> : <span>Choose your main damage type: tap a highlighted card</span>}
            </div>
          ) : null}
          {layout === 'battle' && settings.tabletop && tabletopLedger ? (
            <TabletopResolution
              key={battleKey}
              result={battleResult}
              animate={battleAnimation}
              finished={battleFinished}
              playerName={playerName}
              opponentName={opponentName}
              resultLabel={resultLabel}
              onShowResult={() => setDismissedResultKey(null)}
              onFinished={() => setTabletopCountedKey(battleKey)}
            />
          ) : null}
          {layout === 'battle' && settings.tabletop && !tabletopLedger ? (
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

        {layout !== 'focus' && layout !== 'lineup' ? (
          <div className="table__zone table__zone--player">
            <HandArea
              slots={game.handSize ?? 5}
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
          hideStats={localHandoff}
          average={layout === 'battle' || localHandoff ? null : playerAverage}
          tabletop={settings.tabletop}
          health={battleStarted && !settings.tabletop ? (battlePlayback?.playerHealth ?? BATTLE_HEALTH) : null}
          lost={playerLost}
          hitTick={damageFlash?.tick ?? null}
          shield={battleStarted ? (battlePlayback?.playerShield ?? 0) : 0}
          blocked={damageFlash?.playerBlocked ?? 0}
          turn={layout === 'draft' ? draftTurn === 'player' : playerTurn}
          turnLabel={layout === 'draft' && draftTurn !== 'opponent' ? draftTurnLabel : null}
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
          {thirdRoundAvailable && (!session.online || room.record?.role === 'host') ? (
            <button type="button" className="ui-button table__action" onClick={session.seeThirdRound}>
              <SvgIcon name="eye" /><span>See round 3</span>
            </button>
          ) : null}
          {battleFinished && (!session.online || room.record?.role === 'host') ? (
            <button type="button" className="ui-button ui-button--primary table__action" onClick={handleMatchContinue}>
              <SvgIcon name="replay" />
              <span>{nextRoundAvailable ? 'Next round' : 'Again'}</span>
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
        spectating={spectating || session.localMultiplayer}
        newGameLabel={nextRoundAvailable ? `Round ${game.roundIndex + 2}` : session.online && room.record?.role !== 'host' ? 'Room controls' : 'Play again'}
        onNewGame={handleMatchContinue}
        matchScore={matchScore}
        optionalRound={game.optionalRound}
        onSeeThirdRound={thirdRoundAvailable ? session.seeThirdRound : null}
        onReplayPreparation={session.replayPreparation}
        onClose={() => setDismissedResultKey(battleKey)}
      />

      <PileSheet
        open={pileOpen && !isRecyclePicking && !privateLocalTurn}
        cards={discardCards ?? []}
        onClose={() => setPileOpen(false)}
        contextHand={playerHand}
      />

      <PileSheet
        open={isRecyclePicking && !localHandoff}
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
      <FactionPicker open={Boolean(isPreBattleReady && session.monsterTransformUid && !localHandoff)} title="Transform Monster stats into…"
        types={['critter', 'robot', 'dragon']} selectedType={null}
        onChoose={session.chooseMonsterTransform} onClose={session.cancelMonsterTransform} />
      <FactionPicker open={Boolean(isPreBattleReady && factionPickerCard && !localHandoff)}
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
        testing={settings.testing}
        monsterDeck={settings.monsterDeck}
        onUpdateSettings={updateSettings}
      />

      <InfoOverlay
        visible={Boolean(recycleOverlay && !localHandoff)}
        title={recycleOverlay?.title ?? 'Notice'}
        message={recycleOverlay?.message ?? ''}
        onClose={closePreBattleInfoOverlay}
      />
      </div>
    </div>
  )
}

function App() {
  const [bossMode, setBossMode] = useState(() => {
    try { return !new URLSearchParams(window.location.hash.slice(1)).has('room') && localStorage.getItem(BOSS_MODE_STORAGE) === 'true' } catch { return false }
  })
  function changeBossMode(value) {
    try { localStorage.setItem(BOSS_MODE_STORAGE, String(value)) } catch { /* Storage may be unavailable. */ }
    setBossMode(value)
  }
  return (
    <CardMotionProvider>
      <CardInspectProvider>
        {bossMode ? <BossBattle onExit={() => changeBossMode(false)} /> : <AppContent onBossBattle={() => changeBossMode(true)} />}
      </CardInspectProvider>
    </CardMotionProvider>
  )
}

export default App
