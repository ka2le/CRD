import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import { createFiveHandDiscardGame, applyDiscardPhase } from '../game/fiveHandDiscard'
import {
  createDraftGame,
  applyDraftPick,
  resolveOpponentDraftPick,
  commitDraftDiscard,
  revealNextDraftPack,
} from '../game/draftMode'
import useDraftFlowEffects from './useDraftFlowEffects'
import { startDraftPickFlight } from './draftMotion'
import {
  getActivatablePreBattleCards,
  getPreBattleCopyCandidates,
  resolvePreBattleActivation,
} from '../game/preBattle'
import { pickBestCardForHand } from '../game/cardEvaluator'

const STORAGE_KEY = 'crd-dev-settings-v1'

const DEFAULT_SETTINGS = {
  gameMode: 'draft',
  showOpponentCards: true,
  wildDeck: true,
}

const DEFAULT_SESSION_TIMING = {
  opponentPreBattleDelayMs: 420,
  drawAllNewDiscardStaggerMs: 110,
  drawAllNewDiscardDurationMs: 320,
  drawAllNewRevealDelayMs: 80,
}

function createSessionTiming(overrides = {}) {
  return {
    ...DEFAULT_SESSION_TIMING,
    ...overrides,
  }
}

function loadStoredSettings() {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS

    const parsed = JSON.parse(raw)
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

function createGameForMode(mode, draftFirstPicker = 'player', settings = DEFAULT_SETTINGS) {
  if (mode === 'five-hand-discard') return createFiveHandDiscardGame({ wildDeck: settings.wildDeck })
  return createDraftGame({ firstPicker: draftFirstPicker, wildDeck: settings.wildDeck })
}

function getNextDraftStartingPicker(current) {
  return current === 'player' ? 'opponent' : 'player'
}

function getMoveRect(getAnchorRect, point) {
  return getAnchorRect(point.section, point.slot) ?? getAnchorRect(point.section, 'default') ?? null
}

function createTransitionResult(state, patch = {}, transition = null) {
  return {
    ...state,
    ...patch,
    lastTransition: transition,
  }
}

function serializeRect(rect) {
  if (!rect) return null
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    right: rect.right,
    bottom: rect.bottom,
    x: rect.x,
    y: rect.y,
  }
}

function createPreBattleState(game) {
  const sharedDraftDiscard = Array.isArray(game.draftDiscard) ? [...game.draftDiscard] : []

  return {
    playerHand: game.playerHand,
    opponentHand: game.opponentHand,
    deck: Array.isArray(game.deck) ? [...game.deck] : [],
    playerDiscard: Array.isArray(game.playerDiscards) ? [...game.playerDiscards] : sharedDraftDiscard,
    opponentDiscard: Array.isArray(game.opponentDiscards) ? [...game.opponentDiscards] : sharedDraftDiscard,
    playerActivated: [],
    opponentActivated: [],
    armedPlayerCopyUid: null,
    recycleSelection: null,
    infoOverlay: null,
    pendingAnimation: null,
    pendingResolution: null,
    activationTick: 0,
  }
}

function getPlayerPreBattleView(state) {
  const cards = getActivatablePreBattleCards(state.playerHand, state.playerActivated)
  const armedCopyCard = cards.find((card) => card.uid === state.armedPlayerCopyUid) ?? null
  const copyCandidates = armedCopyCard ? getPreBattleCopyCandidates(state.playerHand, armedCopyCard.uid) : []

  return {
    cards,
    armedCopyCard,
    copyCandidates,
  }
}

function getOpponentPreBattleView(state) {
  return {
    cards: getActivatablePreBattleCards(state.opponentHand, state.opponentActivated),
  }
}

function getRecycleSelectionCards(preBattle, side = 'player') {
  if (!preBattle?.recycleSelection || preBattle.recycleSelection.side !== side) return []
  return side === 'player' ? preBattle.playerDiscard : preBattle.opponentDiscard
}

export function getDrawActionLabel(selectedCount) {
  if (selectedCount <= 0) return 'Skip Drawing'
  if (selectedCount === 1) return 'Draw 1 New'
  return `Draw ${selectedCount} New`
}

export function getDiscardPhaseLabel(game) {
  const currentPass = Math.min(game.playerDiscardsUsed + 1, 2)
  return `Discard ${currentPass}/2`
}

export function getDraftPhaseLabel(game) {
  if (game.phase === 'battle-ready') return 'Draft Complete'
  if (game.phase === 'draft-opponent-thinking') return 'Opponent Picking'
  if (game.phase === 'draft-pack-clearing') return 'Clearing the Row'
  if (game.phase === 'draft-pack-dealing') return 'Dealing New Cards'
  if (game.phase === 'draft-player-pick') return 'Pick 1 Card'
  return 'Draft'
}

function withDraftDealingAnimation(game) {
  return {
    ...game,
    draftRow: game.draftRow.map((card) => ({
      ...card,
      draftAnimation: 'dealing',
    })),
  }
}

function createDraftGameWithDealing(firstPicker = 'player', settings = DEFAULT_SETTINGS) {
  return withDraftDealingAnimation(createGameForMode('draft', firstPicker, settings))
}

function createInitialSessionState() {
  const settings = loadStoredSettings()
  const game = createGameForMode(settings.gameMode, 'player', settings)

  return {
    settings,
    gameMode: settings.gameMode,
    nextDraftStartingPicker: 'player',
    game,
    preBattle: createPreBattleState(game),
    selectedIds: [],
    battleStarted: false,
    battleLogOpen: false,
    battleInstance: 0,
    gameSessionKey: 0,
    lastTransition: null,
    pendingPlayerDraftPickAnimation: null,
    suppressedHandCardIds: {
      player: [],
      opponent: [],
    },
  }
}

function sessionReducer(state, action) {
  switch (action.type) {
    case 'RESET_GAME': {
      const nextMode = action.nextMode ?? state.gameMode
      const nextBattleInstance = state.battleInstance + 1
      const nextGameSessionKey = state.gameSessionKey + 1

      if (nextMode === 'draft') {
        const startingPicker = state.nextDraftStartingPicker
        const game = createDraftGameWithDealing(startingPicker, {
          ...state.settings,
          gameMode: nextMode,
        })

        return createTransitionResult(state, {
          gameMode: nextMode,
          settings: {
            ...state.settings,
            gameMode: nextMode,
          },
          nextDraftStartingPicker: getNextDraftStartingPicker(startingPicker),
          game,
          preBattle: createPreBattleState(game),
          selectedIds: [],
          battleStarted: false,
          battleLogOpen: false,
          battleInstance: nextBattleInstance,
          gameSessionKey: nextGameSessionKey,
        }, {
          type: 'game-reset',
          mode: nextMode,
        })
      }

      const game = createGameForMode(nextMode, state.nextDraftStartingPicker, {
        ...state.settings,
        gameMode: nextMode,
      })

      return createTransitionResult(state, {
        gameMode: nextMode,
        settings: {
          ...state.settings,
          gameMode: nextMode,
        },
        game,
        preBattle: createPreBattleState(game),
        selectedIds: [],
        battleStarted: false,
        battleLogOpen: false,
        battleInstance: nextBattleInstance,
        gameSessionKey: nextGameSessionKey,
      }, {
        type: 'game-reset',
        mode: nextMode,
      })
    }

    case 'CLEAR_TRANSITION':
      return {
        ...state,
        lastTransition: null,
      }

    case 'CLEAR_PENDING_PLAYER_DRAFT_PICK_ANIMATION':
      return {
        ...state,
        pendingPlayerDraftPickAnimation: null,
      }

    case 'SUPPRESS_HAND_CARD': {
      const { side, uid } = action
      const currentIds = state.suppressedHandCardIds[side] ?? []
      if (currentIds.includes(uid)) return state

      return {
        ...state,
        suppressedHandCardIds: {
          ...state.suppressedHandCardIds,
          [side]: [...currentIds, uid],
        },
      }
    }

    case 'REVEAL_HAND_CARD': {
      const { side, uid } = action
      const currentIds = state.suppressedHandCardIds[side] ?? []

      return {
        ...state,
        suppressedHandCardIds: {
          ...state.suppressedHandCardIds,
          [side]: currentIds.filter((id) => id !== uid),
        },
      }
    }

    case 'TOGGLE_SELECTED': {
      const { uid } = action
      const nextSelectedIds = state.selectedIds.includes(uid)
        ? state.selectedIds.filter((id) => id !== uid)
        : [...state.selectedIds, uid]

      return createTransitionResult(state, {
        selectedIds: nextSelectedIds,
      })
    }

    case 'SUBMIT_DISCARD': {
      const nextGame = applyDiscardPhase(state.game, state.selectedIds)
      return createTransitionResult(state, {
        game: nextGame,
        preBattle: createPreBattleState(nextGame),
        selectedIds: [],
      }, {
        type: 'discard-submitted',
        moves: nextGame.recentMoves ?? [],
      })
    }

    case 'PLAYER_DRAFT_PICK': {
      const nextGame = applyDraftPick(state.game, action.uid)
      return createTransitionResult(state, {
        game: nextGame,
        preBattle: createPreBattleState(nextGame),
        pendingPlayerDraftPickAnimation: {
          uid: action.uid,
          sourceRect: action.sourceRect ?? null,
        },
        suppressedHandCardIds: {
          ...state.suppressedHandCardIds,
          player: state.suppressedHandCardIds.player.includes(action.uid)
            ? state.suppressedHandCardIds.player
            : [...state.suppressedHandCardIds.player, action.uid],
        },
      }, {
        type: 'player-draft-pick',
        uid: action.uid,
        moves: nextGame.recentMoves ?? [],
      })
    }

    case 'RESOLVE_OPPONENT_DRAFT_PICK': {
      const pickedUid = state.game.pendingOpponentPickUid ?? null
      const nextGame = resolveOpponentDraftPick(state.game)
      return createTransitionResult(state, {
        game: nextGame,
        preBattle: createPreBattleState(nextGame),
        suppressedHandCardIds: pickedUid ? {
          ...state.suppressedHandCardIds,
          opponent: state.suppressedHandCardIds.opponent.includes(pickedUid)
            ? state.suppressedHandCardIds.opponent
            : [...state.suppressedHandCardIds.opponent, pickedUid],
        } : state.suppressedHandCardIds,
      }, {
        type: 'opponent-draft-pick',
        uid: state.game.pendingOpponentPickUid ?? null,
        moves: nextGame.recentMoves ?? [],
      })
    }

    case 'COMMIT_DRAFT_DISCARD': {
      const nextGame = commitDraftDiscard(state.game)
      return createTransitionResult(state, {
        game: nextGame,
        preBattle: createPreBattleState(nextGame),
      }, {
        type: 'draft-discard-committed',
        moves: nextGame.recentMoves ?? [],
      })
    }

    case 'REVEAL_NEXT_DRAFT_PACK': {
      const nextGame = withDraftDealingAnimation(revealNextDraftPack(state.game))
      return createTransitionResult(state, {
        game: nextGame,
        preBattle: createPreBattleState(nextGame),
      }, {
        type: 'draft-pack-revealed',
        moves: nextGame.recentMoves ?? [],
      })
    }

    case 'ACTIVATE_PLAYER_PRE_BATTLE_CARD': {
      const current = state.preBattle
      const { cards, armedCopyCard, copyCandidates } = getPlayerPreBattleView(current)
      const uid = action.uid
      const directCard = cards.find((card) => card.uid === uid)

      if (directCard?.id === 'copy_card_in_hand') {
        return createTransitionResult(state, {
          preBattle: {
            ...current,
            armedPlayerCopyUid: current.armedPlayerCopyUid === directCard.uid ? null : directCard.uid,
            recycleSelection: null,
            activationTick: current.activationTick + 1,
          },
        })
      }

      const copyTarget = armedCopyCard ? copyCandidates.find((card) => card.uid === uid) : null
      if (copyTarget && armedCopyCard) {
        const result = resolvePreBattleActivation({
          hand: current.playerHand,
          deck: current.deck,
          discard: current.playerDiscard,
          cardUid: armedCopyCard.uid,
          selectionUid: uid,
        })

        const previousHandIds = new Set(current.playerHand.map((card) => card.uid))
        const copiedNewCards = result.hand.filter((card) => !previousHandIds.has(card.uid))
        const copiedNewCardIds = new Set(copiedNewCards.map((card) => card.uid))
        const nextPlayerActivated = [...current.playerActivated, armedCopyCard.uid].filter((activatedUid) => !copiedNewCardIds.has(activatedUid))

        return createTransitionResult(state, {
          preBattle: {
            ...current,
            playerHand: result.hand,
            deck: result.deck,
            playerDiscard: result.discard,
            playerActivated: nextPlayerActivated,
            armedPlayerCopyUid: null,
            recycleSelection: null,
            activationTick: current.activationTick + 1,
          },
        })
      }

      if (!directCard) return state

      const result = resolvePreBattleActivation({
        hand: current.playerHand,
        deck: current.deck,
        discard: current.playerDiscard,
        cardUid: directCard.uid,
      })

      if (directCard.id === 'recycle_card') {
        if ((current.playerDiscard?.length ?? 0) <= 0) {
          return createTransitionResult(state, {
            preBattle: {
              ...current,
              infoOverlay: {
                title: 'Nothing to Recycle',
                message: 'You have no discarded cards to bring back.',
              },
              armedPlayerCopyUid: null,
              recycleSelection: null,
              activationTick: current.activationTick + 1,
            },
          })
        }

        return createTransitionResult(state, {
          preBattle: {
            ...current,
            recycleSelection: {
              side: 'player',
              sourceUid: directCard.uid,
            },
            armedPlayerCopyUid: null,
            activationTick: current.activationTick + 1,
          },
        })
      }

      if (directCard.id === 'draw_all_new_1') {
        return createTransitionResult(state, {
          preBattle: {
            ...current,
            playerActivated: [...current.playerActivated, directCard.uid],
            armedPlayerCopyUid: null,
            recycleSelection: null,
            pendingAnimation: {
              kind: 'draw-all-new-1',
              discardedCards: current.playerHand,
            },
            pendingResolution: {
              hand: result.hand,
              deck: result.deck,
              discard: result.discard,
            },
            activationTick: current.activationTick + 1,
          },
        })
      }

      return createTransitionResult(state, {
        preBattle: {
          ...current,
          playerHand: result.hand,
          deck: result.deck,
          playerDiscard: result.discard,
          playerActivated: [...current.playerActivated, directCard.uid],
          armedPlayerCopyUid: null,
          recycleSelection: null,
          pendingAnimation: null,
          pendingResolution: null,
          activationTick: current.activationTick + 1,
        },
      })
    }

    case 'ACTIVATE_OPPONENT_PRE_BATTLE_CARD': {
      const current = state.preBattle
      const { cards } = getOpponentPreBattleView(current)
      const nextOpponentCard = cards[0]
      if (!nextOpponentCard) return state

      if (nextOpponentCard.id === 'recycle_card') {
        const opponentDiscard = current.opponentDiscard ?? []
        if (!opponentDiscard.length) {
          return createTransitionResult(state, {
            preBattle: {
              ...current,
              activationTick: current.activationTick + 1,
            },
          })
        }

        const recycledCard = pickBestCardForHand(opponentDiscard, current.opponentHand) ?? opponentDiscard[0]
        return createTransitionResult(state, {
          preBattle: {
            ...current,
            opponentHand: [...current.opponentHand, recycledCard],
            opponentDiscard: opponentDiscard.filter((card) => card.uid !== recycledCard.uid),
            opponentActivated: [...current.opponentActivated, nextOpponentCard.uid],
            activationTick: current.activationTick + 1,
          },
        })
      }

      const selectionUid = nextOpponentCard.id === 'copy_card_in_hand'
        ? (pickBestCardForHand(getPreBattleCopyCandidates(current.opponentHand, nextOpponentCard.uid), current.opponentHand.filter((card) => card.uid !== nextOpponentCard.uid))?.uid
          ?? getPreBattleCopyCandidates(current.opponentHand, nextOpponentCard.uid)[0]?.uid
          ?? null)
        : null

      const result = resolvePreBattleActivation({
        hand: current.opponentHand,
        deck: current.deck,
        discard: current.opponentDiscard,
        cardUid: nextOpponentCard.uid,
        selectionUid,
      })

      return createTransitionResult(state, {
        preBattle: {
          ...current,
          opponentHand: result.hand,
          deck: result.deck,
          opponentDiscard: result.discard,
          opponentActivated: [...current.opponentActivated, nextOpponentCard.uid],
          activationTick: current.activationTick + 1,
        },
      })
    }

    case 'RESOLVE_PLAYER_RECYCLE_PICK': {
      const current = state.preBattle
      if (!current.recycleSelection || current.recycleSelection.side !== 'player') return state

      const pickedCard = (current.playerDiscard ?? []).find((card) => card.uid === action.uid)
      if (!pickedCard) return state

      return createTransitionResult(state, {
        preBattle: {
          ...current,
          playerHand: [...current.playerHand, pickedCard],
          playerDiscard: current.playerDiscard.filter((card) => card.uid !== pickedCard.uid),
          playerActivated: [...current.playerActivated, current.recycleSelection.sourceUid],
          recycleSelection: null,
          activationTick: current.activationTick + 1,
        },
      })
    }

    case 'RESOLVE_PRE_BATTLE_PENDING_DRAW_ALL_NEW_1': {
      const current = state.preBattle
      const resolution = current.pendingResolution
      if (!resolution) return state

      return {
        ...state,
        preBattle: {
          ...current,
          playerHand: resolution.hand,
          deck: resolution.deck,
          playerDiscard: resolution.discard,
          pendingAnimation: null,
          pendingResolution: null,
        },
        suppressedHandCardIds: {
          ...state.suppressedHandCardIds,
          player: [
            ...new Set([
              ...state.suppressedHandCardIds.player,
              ...resolution.hand.map((card) => card.uid),
            ]),
          ],
        },
      }
    }

    case 'CLEAR_PRE_BATTLE_PENDING_ANIMATION':
      return {
        ...state,
        preBattle: {
          ...state.preBattle,
          pendingAnimation: null,
          pendingResolution: null,
        },
      }

    case 'CLOSE_PRE_BATTLE_INFO_OVERLAY':
      return {
        ...state,
        preBattle: {
          ...state.preBattle,
          infoOverlay: null,
        },
      }

    case 'START_BATTLE':
      return createTransitionResult(state, {
        battleStarted: true,
        battleInstance: state.battleInstance + 1,
        gameSessionKey: state.gameSessionKey + 1,
      }, {
        type: 'battle-started',
      })

    case 'CLOSE_BATTLE_OVERLAY':
      return createTransitionResult(state, {
        battleStarted: false,
        battleLogOpen: false,
        selectedIds: [],
        battleInstance: state.battleInstance + 1,
        gameSessionKey: state.gameSessionKey + 1,
        preBattle: createPreBattleState(state.game),
      }, {
        type: 'battle-closed',
      })

    case 'TOGGLE_BATTLE_LOG':
      return createTransitionResult(state, {
        battleLogOpen: !state.battleLogOpen,
      })

    case 'UPDATE_SETTINGS': {
      const nextSettings = {
        ...state.settings,
        ...action.patch,
      }

      const nextMode = nextSettings.gameMode ?? state.gameMode
      const nextGame = nextMode === 'draft'
        ? createDraftGameWithDealing(state.nextDraftStartingPicker, nextSettings)
        : createGameForMode(nextMode, state.nextDraftStartingPicker, nextSettings)

      return createTransitionResult(state, {
        settings: nextSettings,
        gameMode: nextMode,
        game: nextGame,
        preBattle: createPreBattleState(nextGame),
        selectedIds: [],
        battleStarted: false,
        battleLogOpen: false,
        battleInstance: state.battleInstance + 1,
        gameSessionKey: state.gameSessionKey + 1,
      }, {
        type: 'settings-updated',
      })
    }

    default:
      return state
  }
}

export default function useGameSession({ animateCardMove, getAnchorRect, maskSlot, unmaskSlot, timing = {} }) {
  const sessionTiming = createSessionTiming(timing)
  const [session, dispatch] = useReducer(sessionReducer, undefined, createInitialSessionState)
  const sequenceTimeoutsRef = useRef([])

  const {
    settings,
    gameMode,
    nextDraftStartingPicker,
    game,
    preBattle,
    selectedIds,
    battleStarted,
    battleLogOpen,
    battleInstance,
    gameSessionKey,
    lastTransition,
    pendingPlayerDraftPickAnimation,
    suppressedHandCardIds,
  } = session

  const discardPhase = game.mode === 'five-hand-discard' && game.phase.startsWith('player-discard')
  const canStartBattle = !battleStarted && game.phase === 'battle-ready'
  const pendingDraftPickUid = game.pendingOpponentPickUid ?? null
  const draftActivationTick = pendingDraftPickUid ? `${pendingDraftPickUid}-${game.phase}-${game.playerHand.length}-${game.opponentHand.length}` : 'draft-idle'
  const canPickDraftCard = game.phase === 'draft-player-pick' && game.currentPicker === 'player'

  const playerPreBattleView = useMemo(() => getPlayerPreBattleView(preBattle), [preBattle])
  const opponentPreBattleView = useMemo(() => getOpponentPreBattleView(preBattle), [preBattle])
  const recycleSelectionCards = useMemo(() => getRecycleSelectionCards(preBattle, 'player'), [preBattle])
  const isPreBattleReady = game.phase === 'battle-ready' && !battleStarted
  const isRecyclePicking = isPreBattleReady && Boolean(preBattle.recycleSelection?.side === 'player')
  const isWaitingForPlayerChoice = isPreBattleReady && (playerPreBattleView.cards.length > 0 || isRecyclePicking)
  const highlightedPreBattleIds = useMemo(() => {
    const ids = [
      ...playerPreBattleView.cards.map((card) => card.uid),
      ...opponentPreBattleView.cards.map((card) => card.uid),
    ]

    if (playerPreBattleView.armedCopyCard) {
      ids.push(...playerPreBattleView.copyCandidates.map((card) => card.uid))
    }

    return [...new Set(ids)]
  }, [opponentPreBattleView.cards, playerPreBattleView.armedCopyCard, playerPreBattleView.cards, playerPreBattleView.copyCandidates])

  const playerTargetableIds = useMemo(() => {
    const ids = [...playerPreBattleView.cards.map((card) => card.uid)]
    if (playerPreBattleView.armedCopyCard) {
      ids.push(...playerPreBattleView.copyCandidates.map((card) => card.uid))
    }
    return [...new Set(ids)]
  }, [playerPreBattleView.armedCopyCard, playerPreBattleView.cards, playerPreBattleView.copyCandidates])

  const recycleOverlay = preBattle.infoOverlay
  const pendingPreBattleAnimation = preBattle.pendingAnimation
  const pendingPreBattleResolution = preBattle.pendingResolution

  const resolvedPlayerHand = battleStarted ? preBattle.playerHand : (isPreBattleReady ? preBattle.playerHand : game.playerHand)
  const resolvedOpponentHand = battleStarted ? preBattle.opponentHand : (isPreBattleReady ? preBattle.opponentHand : game.opponentHand)
  const resolvedDeckCount = isPreBattleReady ? preBattle.deck.length : game.deck.length
  const battleDeck = preBattle.deck
  const battleResult = useMemo(() => {
    if (!battleStarted || game.phase !== 'battle-ready') return null
    return null
  }, [battleStarted, game.phase])

  const battleKey = `${battleInstance}-${gameSessionKey}`

  useEffect(() => {
    if (typeof window === 'undefined') return

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...settings,
      gameMode,
    }))
  }, [settings, gameMode])

  const clearSequenceTimeouts = useCallback(() => {
    sequenceTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId))
    sequenceTimeoutsRef.current = []
  }, [])

  const scheduleTimeout = useCallback((callback, delayMs) => {
    const timeoutId = window.setTimeout(() => {
      sequenceTimeoutsRef.current = sequenceTimeoutsRef.current.filter((id) => id !== timeoutId)
      callback()
    }, delayMs)

    sequenceTimeoutsRef.current.push(timeoutId)
    return timeoutId
  }, [])

  const animateMovesFromCurrentLayout = useCallback((moves) => {
    moves.forEach((move) => {
      const fromRect = getMoveRect(getAnchorRect, move.from)
      const toRect = getMoveRect(getAnchorRect, move.to)
      if (!fromRect || !toRect) return

      animateCardMove({
        ...move,
        fromRect,
        toRect,
      })
    })
  }, [animateCardMove, getAnchorRect])

  const clearTransition = useCallback(() => {
    dispatch({ type: 'CLEAR_TRANSITION' })
  }, [])

  const clearPendingPlayerDraftPickAnimation = useCallback(() => {
    dispatch({ type: 'CLEAR_PENDING_PLAYER_DRAFT_PICK_ANIMATION' })
  }, [])

  const clearPreBattlePendingAnimation = useCallback(() => {
    dispatch({ type: 'CLEAR_PRE_BATTLE_PENDING_ANIMATION' })
  }, [])

  const resolvePreBattlePendingDrawAllNew = useCallback(() => {
    dispatch({ type: 'RESOLVE_PRE_BATTLE_PENDING_DRAW_ALL_NEW_1' })
  }, [])

  const revealHandCard = useCallback((side, uid) => {
    dispatch({ type: 'REVEAL_HAND_CARD', side, uid })
  }, [])

  const resetGame = useCallback((nextMode = gameMode) => {
    clearSequenceTimeouts()
    dispatch({ type: 'RESET_GAME', nextMode, nextDraftStartingPicker })
  }, [clearSequenceTimeouts, gameMode, nextDraftStartingPicker])

  const handleGameModeChange = useCallback((nextMode) => {
    dispatch({ type: 'UPDATE_SETTINGS', patch: { gameMode: nextMode } })
  }, [])

  const updateSettings = useCallback((patch) => {
    dispatch({ type: 'UPDATE_SETTINGS', patch })
  }, [])

  const toggleSelected = useCallback((uid) => {
    if (!discardPhase) return
    dispatch({ type: 'TOGGLE_SELECTED', uid })
  }, [discardPhase])

  const submitDiscard = useCallback(() => {
    if (!discardPhase) return
    dispatch({ type: 'SUBMIT_DISCARD' })
  }, [discardPhase])

  const handleDraftPick = useCallback((uid) => {
    if (!canPickDraftCard) return
    const sourceRect = serializeRect(getAnchorRect('draft-row', uid))
    dispatch({ type: 'PLAYER_DRAFT_PICK', uid, sourceRect })
  }, [canPickDraftCard, getAnchorRect])

  const closeBattleOverlay = useCallback(() => {
    dispatch({ type: 'CLOSE_BATTLE_OVERLAY' })
  }, [])

  const startBattle = useCallback(() => {
    if (!canStartBattle) return
    dispatch({ type: 'START_BATTLE' })
  }, [canStartBattle])

  const toggleBattleLog = useCallback(() => {
    dispatch({ type: 'TOGGLE_BATTLE_LOG' })
  }, [])

  const activatePlayerPreBattleCard = useCallback((uid) => {
    if (!isPreBattleReady) return
    dispatch({ type: 'ACTIVATE_PLAYER_PRE_BATTLE_CARD', uid })
  }, [isPreBattleReady])

  const resolvePlayerRecyclePick = useCallback((uid) => {
    if (!isRecyclePicking) return
    dispatch({ type: 'RESOLVE_PLAYER_RECYCLE_PICK', uid })
  }, [isRecyclePicking])

  const closePreBattleInfoOverlay = useCallback(() => {
    dispatch({ type: 'CLOSE_PRE_BATTLE_INFO_OVERLAY' })
  }, [])

  const resolveOpponentDraftPickAction = useCallback(() => {
    dispatch({ type: 'RESOLVE_OPPONENT_DRAFT_PICK' })
  }, [])

  const commitDraftDiscardAction = useCallback(() => {
    dispatch({ type: 'COMMIT_DRAFT_DISCARD' })
  }, [])

  const revealNextDraftPackAction = useCallback(() => {
    dispatch({ type: 'REVEAL_NEXT_DRAFT_PACK' })
  }, [])

  useEffect(() => {
    if (!isPreBattleReady) return undefined
    if (isRecyclePicking) return undefined
    if (playerPreBattleView.cards.length > 0) return undefined
    if (opponentPreBattleView.cards.length <= 0) return undefined

    const timeoutId = window.setTimeout(() => {
      dispatch({ type: 'ACTIVATE_OPPONENT_PRE_BATTLE_CARD' })
    }, sessionTiming.opponentPreBattleDelayMs)

    return () => window.clearTimeout(timeoutId)
  }, [
    isPreBattleReady,
    isRecyclePicking,
    opponentPreBattleView.cards.length,
    playerPreBattleView.cards.length,
    sessionTiming.opponentPreBattleDelayMs,
  ])

  useEffect(() => {
    if (pendingPreBattleAnimation?.kind !== 'draw-all-new-1') return

    const discardedCards = pendingPreBattleAnimation.discardedCards ?? []
    const discardTargetRect = getAnchorRect('player-discard', 'default')
    if (!discardTargetRect) return

    const rowMasks = discardedCards.map((card) => ({
      uid: card.uid,
      key: maskSlot('player-hand', card.uid),
    }))

    discardedCards.forEach((card, index) => {
      const fromRect = getAnchorRect('player-hand', card.uid)
      if (!fromRect) return

      scheduleTimeout(() => {
        animateCardMove({
          card,
          from: { section: 'player-hand', slot: card.uid },
          to: { section: 'player-discard', slot: 'default' },
          fromRect,
          toRect: discardTargetRect,
          face: 'up',
          durationMs: sessionTiming.drawAllNewDiscardDurationMs,
          rotateDeg: 10,
          scaleTo: 0.72,
          fadeOut: true,
          hideSource: true,
          hideDestinationUntilEnd: false,
        })
      }, index * sessionTiming.drawAllNewDiscardStaggerMs)
    })

    const discardSequenceMs = Math.max(0, (discardedCards.length - 1) * sessionTiming.drawAllNewDiscardStaggerMs) + sessionTiming.drawAllNewDiscardDurationMs

    scheduleTimeout(() => {
      resolvePreBattlePendingDrawAllNew()

      scheduleTimeout(() => {
        ;(pendingPreBattleResolution?.hand ?? []).forEach((card) => revealHandCard('player', card.uid))
        rowMasks.forEach(({ uid }) => {
          unmaskSlot('player-hand', uid)
        })
        clearPreBattlePendingAnimation()
      }, sessionTiming.drawAllNewRevealDelayMs)
    }, discardSequenceMs)
  }, [
    animateCardMove,
    clearPreBattlePendingAnimation,
    getAnchorRect,
    maskSlot,
    pendingPreBattleAnimation,
    pendingPreBattleResolution,
    resolvePreBattlePendingDrawAllNew,
    revealHandCard,
    scheduleTimeout,
    sessionTiming.drawAllNewDiscardDurationMs,
    sessionTiming.drawAllNewDiscardStaggerMs,
    sessionTiming.drawAllNewRevealDelayMs,
    unmaskSlot,
  ])

  useEffect(() => {
    if (!lastTransition) return

    if (lastTransition.type === 'discard-submitted') {
      animateMovesFromCurrentLayout(lastTransition.moves ?? [])
      clearTransition()
      return
    }

    if (lastTransition.type === 'player-draft-pick') {
      const pickedUid = lastTransition.uid
      const pickedCard = game.playerHand.find((card) => card.uid === pickedUid)
      const sourceRect = pendingPlayerDraftPickAnimation?.uid === pickedUid
        ? pendingPlayerDraftPickAnimation.sourceRect
        : null

      startDraftPickFlight({
        pickedCard,
        pickedUid,
        targetSection: 'player-hand',
        sourceRect,
        getAnchorRect,
        animateCardMove,
        maskSlot,
        scheduleTimeout,
        onFlightComplete: () => revealHandCard('player', pickedUid),
      })

      clearPendingPlayerDraftPickAnimation()
      clearTransition()
      return
    }

    clearTransition()
  }, [
    animateCardMove,
    animateMovesFromCurrentLayout,
    clearPendingPlayerDraftPickAnimation,
    clearTransition,
    game.playerHand,
    getAnchorRect,
    lastTransition,
    maskSlot,
    pendingPlayerDraftPickAnimation,
    revealHandCard,
    scheduleTimeout,
  ])

  useDraftFlowEffects({
    game,
    resolveOpponentDraftPick: resolveOpponentDraftPickAction,
    commitDraftDiscard: commitDraftDiscardAction,
    revealNextDraftPack: revealNextDraftPackAction,
    revealHandCard,
    getAnchorRect,
    animateCardMove,
    maskSlot,
    unmaskSlot,
    scheduleTimeout,
    clearSequenceTimeouts,
    timing: timing.draftFlow,
  })

  useEffect(() => () => clearSequenceTimeouts(), [clearSequenceTimeouts])

  return {
    settings,
    gameMode,
    game,
    selectedIds,
    battleStarted,
    battleLogOpen,
    toggleBattleLog,
    battleKey,
    battleResult,
    battleDeck,
    discardPhase,
    canStartBattle,
    deckCount: resolvedDeckCount,
    pendingDraftPickUid,
    draftActivationTick,
    canPickDraftCard,
    suppressedHandCardIds,
    revealHandCard,
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
    armedPlayerCopyUid: preBattle.armedPlayerCopyUid,
    recycleSelectionCards,
    isRecyclePicking,
    recycleOverlay,
    resolvedPlayerHand,
    resolvedOpponentHand,
  }
}
