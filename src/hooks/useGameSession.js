import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import { createFiveHandDiscardGame, applyDiscardPhase, applyOpponentDiscardPhase } from '../game/fiveHandDiscard'
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
  completeOpponentPreBattle,
} from '../game/preBattle'
import { applyPreparationAction, createPreparationState } from '../game/preparationState'
import { chooseDiscardIds } from '../game/cardEvaluator'
import {
  DEFAULT_OPPONENT_AI, normalizeOpponentAi, requestOpponentPreparation, requestOpponentSearchAction,
} from '../game/opponentAi'
import { getTabletopChoice, getTabletopHandKey, getCardTabletopTypes } from '../game/tabletop'
import { createDevScenario, DEV_SCENARIO_NAMES } from '../game/devScenarios'

const STORAGE_KEY = 'crd-dev-settings-v1'

const DEFAULT_SETTINGS = {
  gameMode: 'draft',
  showOpponentCards: true,
  wildDeck: true,
  tabletop: false,
  opponentAi: DEFAULT_OPPONENT_AI,
}

// Minimum visible "thinking" time for a Search AI discard, so the player's own
// discard animation finishes before the opponent's cards move.
const SEARCH_DISCARD_MIN_THINK_MS = 650
const SEARCH_PREPARATION_MIN_THINK_MS = 450

const DEFAULT_SESSION_TIMING = {
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
      opponentAi: normalizeOpponentAi(parsed.opponentAi),
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

function usesSearchOpponent(settings) {
  return settings?.opponentAi === 'search'
}

// The Search AI decides asynchronously (in a worker). Clear the Rules AI's instant
// pick so the draft flow waits for the search result instead of using it.
function withOpponentAiTurn(game, settings) {
  if (!usesSearchOpponent(settings)) return game
  if (game.mode !== 'draft' || game.phase !== 'draft-opponent-thinking') return game
  return { ...game, pendingOpponentPickUid: null }
}

// Identifies one opponent decision, so stale search results are ignored.
export function getOpponentDecisionKey(dealId, game) {
  if (game.mode === 'draft') return `${dealId}:draft:${game.packNumber}:${game.picksThisPack}`
  return `${dealId}:discard:${game.phase}`
}

function createGameForMode(mode, draftFirstPicker = 'player', settings = DEFAULT_SETTINGS) {
  if (mode === 'five-hand-discard') return createFiveHandDiscardGame({ wildDeck: settings.wildDeck, tabletop: settings.tabletop })
  return withOpponentAiTurn(createDraftGame({ firstPicker: draftFirstPicker, wildDeck: settings.wildDeck, tabletop: settings.tabletop }), settings)
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
  return {
    ...createPreparationState(game),
    armedPlayerCopyUid: null,
    recycleSelection: null,
    infoOverlay: null,
    pendingAnimation: null,
    pendingResolution: null,
    activationTick: 0,
  }
}

function getPlayerPreBattleView(state) {
  const cards = state.playerFinished ? [] : getActivatablePreBattleCards(state.playerHand, state.playerActivated)
  const armedCopyCard = cards.find((card) => card.uid === state.armedPlayerCopyUid) ?? null
  const copyCandidates = armedCopyCard ? getPreBattleCopyCandidates(state.playerHand, armedCopyCard.uid) : []

  return {
    cards,
    armedCopyCard,
    copyCandidates,
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

  const initial = {
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
    dealId: 1,
    lastTransition: null,
    pendingPlayerDraftPickAnimation: null,
    suppressedHandCardIds: {
      player: [],
      opponent: [],
    },
  }
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    const query = new URLSearchParams(window.location.search)
    if (DEV_SCENARIO_NAMES.includes(query.get('scenario'))) {
      return sessionReducer(initial, { type: 'LOAD_DEV_SCENARIO', payload: createDevScenario({
        name: query.get('scenario'), mode: query.get('mode') ?? 'draft', result: query.get('at') === 'result',
      }) })
    }
  }
  return initial
}

export function sessionReducer(state, action) {
  switch (action.type) {
    case 'LOAD_DEV_SCENARIO': {
      if (!import.meta.env.DEV) return state
      const { game, result, playerType } = action.payload
      let preBattle = createPreBattleState(game)
      if (playerType) {
        preBattle.tabletopChoice = { type: playerType, handKey: getTabletopHandKey(game.playerHand) }
      }
      if (result) preBattle = { ...preBattle, playerFinished: true, opponentFinished: true }
      const next = {
        ...state, game, preBattle, gameMode: game.mode,
        settings: { ...state.settings, gameMode: game.mode, tabletop: true, wildDeck: true },
        selectedIds: [], battleStarted: false, battleLogOpen: false,
        battleInstance: state.battleInstance + 1, gameSessionKey: state.gameSessionKey + 1, dealId: state.dealId + 1,
        lastTransition: null, pendingPlayerDraftPickAnimation: null, suppressedHandCardIds: { player: [], opponent: [] },
      }
      return result ? sessionReducer(next, { type: 'START_BATTLE' }) : next
    }

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
          dealId: state.dealId + 1,
          suppressedHandCardIds: { player: [], opponent: [] },
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
        dealId: state.dealId + 1,
        suppressedHandCardIds: { player: [], opponent: [] },
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
      // Search AI answers asynchronously, so the opponent's pass is deferred until it decides.
      const nextGame = applyDiscardPhase(state.game, state.selectedIds, {
        deferOpponent: usesSearchOpponent(state.settings),
      })
      return createTransitionResult(state, {
        game: nextGame,
        preBattle: createPreBattleState(nextGame),
        selectedIds: [],
      }, {
        type: 'discard-submitted',
        moves: nextGame.recentMoves ?? [],
        sourceRects: action.sourceRects ?? {},
      })
    }

    case 'APPLY_OPPONENT_DISCARD': {
      if (action.decisionKey !== getOpponentDecisionKey(state.dealId, state.game)) return state
      if (!state.game.phase.startsWith('opponent-discard')) return state
      const handIds = new Set(state.game.opponentHand.map((card) => card.uid))
      const selectedIds = (action.selectedIds ?? []).filter((uid) => handIds.has(uid))
      const nextGame = applyOpponentDiscardPhase(state.game, selectedIds)
      return createTransitionResult(state, {
        game: nextGame,
        preBattle: createPreBattleState(nextGame),
      }, {
        type: 'discard-submitted',
        moves: (nextGame.recentMoves ?? []).filter((move) => move.from?.section === 'opponent-hand'),
        sourceRects: action.sourceRects ?? {},
      })
    }

    case 'SET_OPPONENT_DRAFT_PICK': {
      const { game } = state
      if (action.decisionKey !== getOpponentDecisionKey(state.dealId, game)) return state
      if (game.phase !== 'draft-opponent-thinking' || game.pendingOpponentPickUid) return state
      if (!game.draftRow.some((card) => card.uid === action.uid)) return state
      return {
        ...state,
        game: { ...game, pendingOpponentPickUid: action.uid },
      }
    }

    case 'PLAYER_DRAFT_PICK': {
      const nextGame = withOpponentAiTurn(applyDraftPick(state.game, action.uid), state.settings)
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
      const nextGame = withOpponentAiTurn(withDraftDealingAnimation(revealNextDraftPack(state.game)), state.settings)
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
        const result = applyPreparationAction(current, 'player', {
          type: 'prepare', sourceUid: armedCopyCard.uid, targetUid: uid,
        })

        return createTransitionResult(state, {
          preBattle: {
            ...current,
            playerHand: result.playerHand,
            deck: result.deck,
            playerDiscard: result.playerDiscard,
            playerActivated: result.playerActivated,
            armedPlayerCopyUid: null,
            recycleSelection: null,
            activationTick: current.activationTick + 1,
          },
        })
      }

      if (!directCard) return state

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

      const result = applyPreparationAction(current, 'player', { type: 'prepare', sourceUid: directCard.uid })

      if (directCard.id === 'draw_all_new_1') {
        return createTransitionResult(state, {
          preBattle: {
            ...current,
            playerActivated: result.playerActivated,
            armedPlayerCopyUid: null,
            recycleSelection: null,
            pendingAnimation: {
              kind: 'draw-all-new-1',
              discardedCards: current.playerHand,
            },
            pendingResolution: {
              hand: result.playerHand,
              deck: result.deck,
              discard: result.playerDiscard,
              drawnCount: result.playerDrawnCount,
            },
            activationTick: current.activationTick + 1,
          },
        })
      }

      return createTransitionResult(state, {
        preBattle: {
          ...current,
          playerHand: result.playerHand,
          deck: result.deck,
          playerDiscard: result.playerDiscard,
          playerActivated: result.playerActivated,
          playerDrawnCount: result.playerDrawnCount,
          armedPlayerCopyUid: null,
          recycleSelection: null,
          pendingAnimation: null,
          pendingResolution: null,
          activationTick: current.activationTick + 1,
        },
      })
    }

    case 'RESOLVE_PLAYER_RECYCLE_PICK': {
      const current = state.preBattle
      if (!current.recycleSelection || current.recycleSelection.side !== 'player') return state

      const pickedCard = (current.playerDiscard ?? []).find((card) => card.uid === action.uid)
      if (!pickedCard) return state
      const result = applyPreparationAction(current, 'player', {
        type: 'prepare', sourceUid: current.recycleSelection.sourceUid, targetUid: pickedCard.uid,
      })

      return createTransitionResult(state, {
        preBattle: {
          ...current,
          playerHand: result.playerHand,
          playerDiscard: result.playerDiscard,
          playerActivated: result.playerActivated,
          recycleSelection: null,
          activationTick: current.activationTick + 1,
        },
      })
    }

    case 'CANCEL_PLAYER_RECYCLE_PICK':
      if (!state.preBattle.recycleSelection) return state
      return {
        ...state,
        preBattle: {
          ...state.preBattle,
          recycleSelection: null,
        },
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
          playerDrawnCount: resolution.drawnCount,
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

    case 'CHOOSE_TABLETOP_TYPE': {
      if (!state.settings?.tabletop || state.battleStarted || state.game.phase !== 'battle-ready'
        || state.preBattle.pendingResolution || state.preBattle.armedPlayerCopyUid || state.preBattle.recycleSelection
        || state.preBattle.opponentSearchKey) return state
      const choice = getTabletopChoice(state.preBattle)
      const card = state.preBattle.playerHand.find((entry) => entry.uid === action.uid)
      if (card?.id !== 'chameleon' && getPlayerPreBattleView(state.preBattle).cards.length) return state
      const types = card ? getCardTabletopTypes(card, choice) : []
      const type = action.damageType ?? (types.length === 1 ? types[0] : null)
      if (!types.length || (type && !types.includes(type))) return state
      return { ...state, preBattle: { ...state.preBattle,
        tabletopTypeCardUid: type ? null : card.uid,
        tabletopChoice: type ? { type, cardUid: card.uid, handKey: getTabletopHandKey(state.preBattle.playerHand) } : state.preBattle.tabletopChoice,
      } }
    }

    case 'CANCEL_TABLETOP_TYPE':
      return { ...state, preBattle: { ...state.preBattle, tabletopTypeCardUid: null } }

    case 'START_BATTLE': {
      if (state.battleStarted || state.game.phase !== 'battle-ready' || state.preBattle.pendingResolution) return state
      if (state.settings?.tabletop && getTabletopChoice(state.preBattle).needsChoice) {
        return { ...state, preBattle: { ...state.preBattle, playerFinished: true, armedPlayerCopyUid: null, recycleSelection: null } }
      }
      // Search AI prepares asynchronously (worker): mark the player done and wait for the result.
      if (usesSearchOpponent(state.settings) && !state.preBattle.opponentFinished && !action.opponentPreparation) {
        if (state.preBattle.opponentSearchKey) return state
        return { ...state, preBattle: { ...state.preBattle, playerFinished: true, armedPlayerCopyUid: null,
          recycleSelection: null, opponentSearchKey: `${state.dealId}:${state.battleInstance}` } }
      }
      if (action.opponentPreparation && action.decisionKey !== state.preBattle.opponentSearchKey) return state
      const preparedPreBattle = action.opponentPreparation
        ? { ...state.preBattle, ...action.opponentPreparation, opponentSearchKey: null }
        : completeOpponentPreBattle(state.preBattle)
      return createTransitionResult(state, {
        preBattle: preparedPreBattle,
        battleStarted: true,
        battleInstance: state.battleInstance + 1,
        gameSessionKey: state.gameSessionKey + 1,
      }, {
        type: 'battle-started',
      })
    }

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
      nextSettings.opponentAi = normalizeOpponentAi(nextSettings.opponentAi)

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
        dealId: state.dealId + 1,
        suppressedHandCardIds: { player: [], opponent: [] },
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
  const opponentDiscarding = game.mode === 'five-hand-discard' && game.phase.startsWith('opponent-discard')
  const searchOpponent = settings.opponentAi === 'search'
  const dealId = session.dealId
  const awaitingSearchDraftPick = searchOpponent && game.mode === 'draft'
    && game.phase === 'draft-opponent-thinking' && !game.pendingOpponentPickUid
  const opponentDecisionKey = getOpponentDecisionKey(dealId, game)
  const opponentPreparing = Boolean(preBattle.opponentSearchKey) && !battleStarted
  const canStartBattle = !battleStarted && game.phase === 'battle-ready' && !preBattle.pendingResolution && !opponentPreparing
  const pendingDraftPickUid = game.pendingOpponentPickUid ?? null
  const draftActivationTick = pendingDraftPickUid ? `${pendingDraftPickUid}-${game.phase}-${game.playerHand.length}-${game.opponentHand.length}` : 'draft-idle'
  const canPickDraftCard = game.phase === 'draft-player-pick' && game.currentPicker === 'player'

  const playerPreBattleView = useMemo(() => getPlayerPreBattleView(preBattle), [preBattle])
  const tabletopChoice = useMemo(() => getTabletopChoice(preBattle), [preBattle])
  const recycleSelectionCards = useMemo(() => getRecycleSelectionCards(preBattle, 'player'), [preBattle])
  const isPreBattleReady = game.phase === 'battle-ready' && !battleStarted
  const isRecyclePicking = isPreBattleReady && Boolean(preBattle.recycleSelection?.side === 'player')
  const isWaitingForPlayerChoice = isPreBattleReady && (playerPreBattleView.cards.length > 0 || isRecyclePicking)
  const choosingTabletopType = Boolean(settings.tabletop && isPreBattleReady
    && !preBattle.pendingResolution && !preBattle.armedPlayerCopyUid && !isRecyclePicking && !opponentPreparing
    && playerPreBattleView.cards.length === 0 && tabletopChoice.types.length > 1)
  const highlightedPreBattleIds = useMemo(() => {
    const ids = [
      ...playerPreBattleView.cards.map((card) => card.uid),
    ]

    if (playerPreBattleView.armedCopyCard) {
      ids.push(...playerPreBattleView.copyCandidates.map((card) => card.uid))
    }

    return [...new Set(ids)]
  }, [playerPreBattleView.armedCopyCard, playerPreBattleView.cards, playerPreBattleView.copyCandidates])

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

  useEffect(() => {
    if (!import.meta.env.DEV) return undefined
    function jump(name, options, result) {
      const payload = createDevScenario({ ...options, name, result })
      clearSequenceTimeouts()
      dispatch({ type: 'LOAD_DEV_SCENARIO', payload })
    }
    const helpers = {
      list: () => [...DEV_SCENARIO_NAMES],
      prepare: (name = 'tie', options = {}) => jump(name, options, false),
      result: (name = 'bonuses', options = {}) => jump(name, options, true),
    }
    window.crdDev = helpers
    return () => { if (window.crdDev === helpers) delete window.crdDev }
  }, [clearSequenceTimeouts])

  const scheduleTimeout = useCallback((callback, delayMs) => {
    const timeoutId = window.setTimeout(() => {
      sequenceTimeoutsRef.current = sequenceTimeoutsRef.current.filter((id) => id !== timeoutId)
      callback()
    }, delayMs)

    sequenceTimeoutsRef.current.push(timeoutId)
    return timeoutId
  }, [])

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
    // Cards leaving the hand unmount on commit, so capture where they sit now.
    const sourceRects = {}
    ;[['player-hand', game.playerHand], ['opponent-hand', game.opponentHand]].forEach(([section, cards]) => {
      cards.forEach((card) => {
        const rect = serializeRect(getAnchorRect(section, card.uid))
        if (rect) sourceRects[`${section}::${card.uid}`] = rect
      })
    })
    dispatch({ type: 'SUBMIT_DISCARD', sourceRects })
  }, [discardPhase, game.playerHand, game.opponentHand, getAnchorRect])

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

  const choosePlayerTabletopType = useCallback((uid, damageType) => {
    dispatch({ type: 'CHOOSE_TABLETOP_TYPE', uid, damageType })
  }, [])

  const cancelTabletopTypeChoice = useCallback(() => dispatch({ type: 'CANCEL_TABLETOP_TYPE' }), [])

  const resolvePlayerRecyclePick = useCallback((uid) => {
    if (!isRecyclePicking) return
    dispatch({ type: 'RESOLVE_PLAYER_RECYCLE_PICK', uid })
  }, [isRecyclePicking])

  const cancelPlayerRecyclePick = useCallback(() => {
    dispatch({ type: 'CANCEL_PLAYER_RECYCLE_PICK' })
  }, [])

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
          scaleTo: 1,
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
      // Replacements deal themselves in from the deck; only fly the discards.
      const sourceRects = lastTransition.sourceRects ?? {}
      const toPile = (lastTransition.moves ?? [])
        .filter((move) => move.to?.section === 'player-discard')
        .map((move, index) => ({
          ...move,
          fromRect: sourceRects[`${move.from.section}::${move.from.slot}`] ?? null,
          durationMs: 420,
          delayMs: index * 70,
          hideSource: false,
          hideDestinationUntilEnd: false,
        }))
        .filter((move) => move.fromRect)
      toPile.forEach((move) => {
        const toRect = getMoveRect(getAnchorRect, move.to)
        if (!toRect) return
        animateCardMove({ ...move, toRect })
      })
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

  // Search AI draft pick: ask the worker, then hand the pick to the normal draft flow.
  useEffect(() => {
    if (!awaitingSearchDraftPick) return undefined
    let cancelled = false
    requestOpponentSearchAction(game).then((choice) => {
      if (cancelled || !choice?.uid) return
      dispatch({ type: 'SET_OPPONENT_DRAFT_PICK', uid: choice.uid, decisionKey: opponentDecisionKey })
    })
    return () => { cancelled = true }
  // The decision key changes exactly when a new decision starts.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaitingSearchDraftPick, opponentDecisionKey])

  // Search AI discard pass: runs after the player's pass, then animates like a normal discard.
  useEffect(() => {
    if (!opponentDiscarding) return undefined
    let cancelled = false
    let timeoutId = null
    const startedAt = performance.now()
    const decide = searchOpponent
      ? requestOpponentSearchAction(game)
      : Promise.resolve(null)
    decide.then((choice) => {
      if (cancelled) return
      const remainingMs = Math.max(0, SEARCH_DISCARD_MIN_THINK_MS - (performance.now() - startedAt))
      timeoutId = window.setTimeout(() => {
        if (cancelled) return
        const sourceRects = {}
        game.opponentHand.forEach((card) => {
          const rect = serializeRect(getAnchorRect('opponent-hand', card.uid))
          if (rect) sourceRects[`opponent-hand::${card.uid}`] = rect
        })
        dispatch({
          type: 'APPLY_OPPONENT_DISCARD',
          // A null choice (e.g. the opponent was switched mid-pass) falls back to the Rules AI.
          selectedIds: choice?.selectedIds ?? chooseDiscardIds(game.opponentHand, { discardCount: 2 }),
          sourceRects,
          decisionKey: opponentDecisionKey,
        })
      }, remainingMs)
    })
    return () => {
      cancelled = true
      if (timeoutId) window.clearTimeout(timeoutId)
    }
  // The decision key changes exactly when a new decision starts.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opponentDiscarding, opponentDecisionKey])

  // Search AI preparation: after the player starts the battle, the worker plays the opponent's
  // whole preparation (searched step by step), then the battle starts with that result.
  const opponentSearchKey = preBattle.opponentSearchKey ?? null
  useEffect(() => {
    if (!opponentSearchKey || battleStarted) return undefined
    let cancelled = false
    let timeoutId = null
    const startedAt = performance.now()
    requestOpponentPreparation(preBattle, game).then((opponentPreparation) => {
      if (cancelled) return
      const remainingMs = Math.max(0, SEARCH_PREPARATION_MIN_THINK_MS - (performance.now() - startedAt))
      timeoutId = window.setTimeout(() => {
        if (!cancelled) dispatch({ type: 'START_BATTLE', opponentPreparation, decisionKey: opponentSearchKey })
      }, remainingMs)
    })
    return () => {
      cancelled = true
      if (timeoutId) window.clearTimeout(timeoutId)
    }
  // The search key changes exactly when a new preparation search starts.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opponentSearchKey])

  useDraftFlowEffects({
    game,
    waitingForOpponentPick: awaitingSearchDraftPick,
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
    dealId: session.dealId,
    battleResult,
    battleDeck,
    discardPhase,
    opponentDiscarding,
    opponentPreparing,
    canStartBattle,
    tabletopChoice,
    choosingTabletopType,
    choosePlayerTabletopType,
    cancelTabletopTypeChoice,
    tabletopTypeCardUid: preBattle.tabletopTypeCardUid,
    tabletopSelectedCardUid: tabletopChoice.selectedType ? preBattle.tabletopChoice?.cardUid : null,
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
    cancelPlayerRecyclePick,
    recycleOverlay,
    activatablePreBattleIds: playerPreBattleView.cards.map((card) => card.uid),
    copyCandidateIds: playerPreBattleView.armedCopyCard ? playerPreBattleView.copyCandidates.map((card) => card.uid) : [],
    isPreBattleReady,
    discardCards: isPreBattleReady
      ? preBattle.playerDiscard
      : (game.mode === 'draft' ? game.draftDiscard : game.playerDiscards),
    resolvedPlayerHand,
    resolvedOpponentHand,
  }
}
