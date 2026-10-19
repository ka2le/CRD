import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  const [speed, setSpeedState] = useState(1)
  const controlRef = useRef({ speed: 1, skip: false, stepNow: null })

  // Reset transient playback state when the active battle inputs change.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setPlaybackIndex(-1)
    setShowBattleResult(false)
    setDamageFlash(null)
    setActivationTick(0)
    controlRef.current.skip = false
  }, [battleInstance, battleStarted, playerHand, opponentHand, deck])
  /* eslint-enable react-hooks/set-state-in-effect */

  const battleResult = useMemo(() => {
    if (!isActive) return null
    return simulateBattle(playerHand, opponentHand, { deck })
  }, [deck, isActive, opponentHand, playerHand])

  useEffect(() => {
    if (!isActive || !battleResult) return undefined

    let timeoutId = null
    let cancelled = false
    let nextIndex = 0
    const control = controlRef.current
    const lastIndex = battleResult.rounds.length - 1

    const schedule = (callback, delayMs) => {
      timeoutId = window.setTimeout(callback, delayMs / Math.max(control.speed, 0.25))
    }

    const showResult = () => {
      if (!cancelled) setShowBattleResult(true)
    }

    const step = () => {
      if (cancelled) return

      if (control.skip && nextIndex < lastIndex) nextIndex = lastIndex

      if (nextIndex >= battleResult.rounds.length) {
        showResult()
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
        // Let the final blow land before the result appears.
        timeoutId = window.setTimeout(showResult, control.skip ? 900 : Math.max(1100, getRoundIntervalMs(round.round + 1, battleTiming) / control.speed))
        return
      }

      const upcomingRound = battleResult.rounds[nextIndex]
      schedule(step, getRoundIntervalMs(upcomingRound.round, battleTiming))
    }

    control.stepNow = () => {
      if (cancelled) return
      if (timeoutId) window.clearTimeout(timeoutId)
      step()
    }

    const openingRound = battleResult.rounds[0]
    if (openingRound) {
      schedule(step, getRoundIntervalMs(openingRound.round, battleTiming))
    }

    return () => {
      cancelled = true
      control.stepNow = null
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

  const setSpeed = useCallback((nextSpeed) => {
    controlRef.current.speed = nextSpeed
    setSpeedState(nextSpeed)
  }, [])

  const skipToEnd = useCallback(() => {
    controlRef.current.skip = true
    controlRef.current.stepNow?.()
  }, [])

  const currentRound = battlePlayback?.round ?? 0
  const roundIntervalMs = Math.round(getRoundIntervalMs(currentRound + 1, battleTiming) / speed)

  return {
    battlePlayback,
    battleResult,
    showBattleResult,
    damageFlash,
    speed,
    setSpeed,
    skipToEnd,
    roundIntervalMs,
  }
}
