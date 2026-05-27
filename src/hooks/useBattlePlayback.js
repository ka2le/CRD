import { useEffect, useMemo, useState } from 'react'
import { getHandStats, simulateBattle } from '../game/engine'

const BATTLE_HEALTH = 21
const BASE_ROUND_INTERVAL_MS = 1400
const FAST_BATTLE_START_ROUND = 2
const FAST_BATTLE_MIN_INTERVAL_MS = 350
const FAST_BATTLE_STEP_MS = 40

function getBattleTiming(overrides = {}) {
  return {
    baseRoundIntervalMs: overrides.baseRoundIntervalMs ?? BASE_ROUND_INTERVAL_MS,
    fastBattleStartRound: overrides.fastBattleStartRound ?? FAST_BATTLE_START_ROUND,
    fastBattleMinIntervalMs: overrides.fastBattleMinIntervalMs ?? FAST_BATTLE_MIN_INTERVAL_MS,
    fastBattleStepMs: overrides.fastBattleStepMs ?? FAST_BATTLE_STEP_MS,
    damageFlashMs: overrides.damageFlashMs ?? 900,
  }
}

function getRoundIntervalMs(nextRoundNumber, timing) {
  if (nextRoundNumber <= timing.fastBattleStartRound) return timing.baseRoundIntervalMs

  const acceleratedRounds = nextRoundNumber - timing.fastBattleStartRound
  return Math.max(
    timing.fastBattleMinIntervalMs,
    timing.baseRoundIntervalMs - (acceleratedRounds * timing.fastBattleStepMs),
  )
}

function createInitialPlayback(playerHand = null, opponentHand = null, activationTick = 0) {
  return {
    round: 0,
    playerHealth: BATTLE_HEALTH,
    opponentHealth: BATTLE_HEALTH,
    playerRoundDamage: 0,
    opponentRoundDamage: 0,
    playerShield: 0,
    opponentShield: 0,
    playerBlocked: 0,
    opponentBlocked: 0,
    playerTriggered: [],
    opponentTriggered: [],
    playerTriggeredIds: [],
    opponentTriggeredIds: [],
    playerBursts: [],
    opponentBursts: [],
    playerDraws: [],
    opponentDraws: [],
    playerTotalDamageDealt: 0,
    opponentTotalDamageDealt: 0,
    playerHand,
    opponentHand,
    playerStats: getHandStats(playerHand ?? []),
    opponentStats: getHandStats(opponentHand ?? []),
    activationTick,
  }
}

export default function useBattlePlayback({ battleStarted, battleInstance, playerHand, opponentHand, deck, timing = {} }) {
  const isActive = battleStarted
  const baseRoundIntervalMs = timing.baseRoundIntervalMs
  const damageFlashMs = timing.damageFlashMs
  const fastBattleMinIntervalMs = timing.fastBattleMinIntervalMs
  const fastBattleStartRound = timing.fastBattleStartRound
  const fastBattleStepMs = timing.fastBattleStepMs
  const battleTiming = useMemo(() => getBattleTiming({
    baseRoundIntervalMs,
    damageFlashMs,
    fastBattleMinIntervalMs,
    fastBattleStartRound,
    fastBattleStepMs,
  }), [
    baseRoundIntervalMs,
    damageFlashMs,
    fastBattleMinIntervalMs,
    fastBattleStartRound,
    fastBattleStepMs,
  ])
  const [playbackIndex, setPlaybackIndex] = useState(-1)
  const [showBattleResult, setShowBattleResult] = useState(false)
  const [damageFlash, setDamageFlash] = useState(null)
  const [activationTick, setActivationTick] = useState(0)

  useEffect(() => {
    setPlaybackIndex(-1)
    setShowBattleResult(false)
    setDamageFlash(null)
    setActivationTick(0)
  }, [battleInstance, battleStarted, playerHand, opponentHand, deck])

  const battleResult = useMemo(() => {
    if (!isActive) return null
    return simulateBattle(playerHand, opponentHand, { deck })
  }, [deck, isActive, opponentHand, playerHand])

  useEffect(() => {
    if (!isActive || !battleResult) return undefined

    let timeoutId = null
    let cancelled = false
    let nextIndex = 0

    const step = () => {
      if (cancelled) return

      if (nextIndex >= battleResult.rounds.length) {
        setShowBattleResult(true)
        return
      }

      const round = battleResult.rounds[nextIndex]
      setPlaybackIndex(nextIndex)
      setActivationTick(nextIndex + 1)
      setDamageFlash({
        player: round.opponentRoundDamage,
        opponent: round.playerRoundDamage,
        playerBlocked: round.playerBlocked ?? 0,
        opponentBlocked: round.opponentBlocked ?? 0,
        tick: `${battleInstance}-${round.round}-${round.playerRoundDamage}-${round.opponentRoundDamage}`,
      })

      nextIndex += 1

      if (nextIndex >= battleResult.rounds.length) {
        timeoutId = window.setTimeout(() => {
          if (!cancelled) setShowBattleResult(true)
        }, getRoundIntervalMs(round.round + 1, battleTiming))
        return
      }

      const upcomingRound = battleResult.rounds[nextIndex]
      timeoutId = window.setTimeout(step, getRoundIntervalMs(upcomingRound.round, battleTiming))
    }

    const openingRound = battleResult.rounds[0]
    if (openingRound) {
      timeoutId = window.setTimeout(step, getRoundIntervalMs(openingRound.round, battleTiming))
    }

    return () => {
      cancelled = true
      if (timeoutId) window.clearTimeout(timeoutId)
    }
  }, [battleTiming, isActive, battleResult, battleInstance])

  useEffect(() => {
    if (!damageFlash) return undefined

    const timeoutId = window.setTimeout(() => setDamageFlash(null), battleTiming.damageFlashMs)
    return () => window.clearTimeout(timeoutId)
  }, [battleTiming.damageFlashMs, damageFlash])

  const battlePlayback = useMemo(() => {
    if (!isActive) return null
    if (!battleResult || playbackIndex < 0) {
      return createInitialPlayback(playerHand, opponentHand, 0)
    }

    const round = battleResult.rounds[playbackIndex]
    if (!round) {
      return createInitialPlayback(playerHand, opponentHand, 0)
    }

    return {
      round: round.round,
      playerHealth: Math.max(BATTLE_HEALTH - round.playerDamageTaken, 0),
      opponentHealth: Math.max(BATTLE_HEALTH - round.opponentDamageTaken, 0),
      playerRoundDamage: round.playerRoundDamage,
      opponentRoundDamage: round.opponentRoundDamage,
      playerShield: round.playerShield ?? 0,
      opponentShield: round.opponentShield ?? 0,
      playerBlocked: round.playerBlocked ?? 0,
      opponentBlocked: round.opponentBlocked ?? 0,
      playerTriggered: round.playerTriggered,
      opponentTriggered: round.opponentTriggered,
      playerTriggeredIds: round.playerTriggeredIds,
      opponentTriggeredIds: round.opponentTriggeredIds,
      playerBursts: round.playerBursts,
      opponentBursts: round.opponentBursts,
      playerDraws: round.playerDraws,
      opponentDraws: round.opponentDraws,
      playerTotalDamageDealt: round.playerTotalDamageDealt,
      opponentTotalDamageDealt: round.opponentTotalDamageDealt,
      playerHand: round.playerHand,
      opponentHand: round.opponentHand,
      playerStats: round.playerStats ?? getHandStats(round.playerHand ?? []),
      opponentStats: round.opponentStats ?? getHandStats(round.opponentHand ?? []),
      activationTick,
    }
  }, [activationTick, battleResult, isActive, opponentHand, playbackIndex, playerHand])

  return {
    battlePlayback,
    battleResult,
    showBattleResult,
    damageFlash,
  }
}
