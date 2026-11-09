import { buildShuffledDeck, getExpandedCoreDeck } from './cards.js'
import { applyPreparationAction, createPreparationState, preparationDiscardPatch } from './preparationState.js'
import { chooseTabletopType, getTabletopProfile, scoreTabletopHand } from './tabletop.js'

export const BOSS_SAVE_VERSION = 1
export const BOSS_STORAGE = 'crd-boss-run-v1'
export const BOSS_MODE_STORAGE = 'crd-boss-mode-v1'
const RULES = 'abilities-new-cards'
const FACTIONS = ['critter', 'robot', 'dragon']
export const POCKET_IDS = ['critter1', 'robot1', 'dragon1', 'swarm', 'robot_attack', 'dragons_breath']
export const BOSS_PRESETS = {
  original: { draftMode: 'shared', absorption: 'boss', weakerBonus: true, rounds: 5,
    pockets: true, refresh: true, swap: true, double: true },
  separate: { draftMode: 'separate', absorption: 'all', weakerBonus: false, rounds: 5,
    pockets: true, refresh: true, swap: true, double: true },
}
// Missing options mean the original prototype, including already-saved results.
export const bossOptions = state => ({ ...BOSS_PRESETS.original, ...state.options })
export const bossPackSize = state => bossOptions(state).draftMode === 'separate' ? 4 : bossDefinition(state.bossId).packSize
export const bossDraftRows = state => bossOptions(state).draftMode === 'separate' ? state.rows : [state.row]
export const bossActiveRow = (state, seat = state.turns[0] ?? 0) => bossDraftRows(state)[bossOptions(state).draftMode === 'separate' ? seat : 0]
export const bossToolCharges = (state, seat) => bossOptions(state).draftMode === 'separate'
  ? state.playerTools?.[seat] ?? state.tools : state.tools

function spendTool(state, seat, tool) {
  if (bossOptions(state).draftMode === 'shared') return { tools: { ...state.tools, [tool]: 0 } }
  // Old separate-draft saves conservatively carry their shared remaining charges
  // into both seats. Restart/new deals give each player a fresh personal set.
  return { playerTools: [0, 1].map(i => ({ ...bossToolCharges(state, i), ...(i === seat ? { [tool]: 0 } : {}) })) }
}

function normalizeOptions(options) {
  const defaults = BOSS_PRESETS.separate
  return { draftMode: options?.draftMode === 'shared' ? 'shared' : 'separate',
    absorption: options?.absorption === 'boss' ? 'boss' : 'all',
    rounds: options?.rounds === 4 ? 4 : 5,
    ...Object.fromEntries(['weakerBonus', 'pockets', 'refresh', 'swap', 'double'].map(k => [k, typeof options?.[k] === 'boolean' ? options[k] : defaults[k]])) }
}

function snapshot(state) {
  // Checkpoints/history never contain other checkpoints/history.
  return Object.fromEntries(Object.entries(state).filter(([key]) => !['history', 'draftStart', 'prepStart'].includes(key)))
}

function dealPack(state) {
  const size = bossPackSize(state), separate = bossOptions(state).draftMode === 'separate'
  return { ...state, row: separate ? [] : state.deck.slice(0, size),
    rows: separate ? [state.deck.slice(0, size), state.deck.slice(size, size * 2)] : [],
    deck: state.deck.slice(size * (separate ? 2 : 1)) }
}

function beginPreparation(state) {
  const prep = createPreparationState({ mode: '20cards', playerHand: state.hands[0], opponentHand: state.hands[1], deck: state.deck, discardPile: state.discard })
  const next = { ...state, phase: 'prepare', prep, types: [null, null], activeSeat: 0, result: null }
  return { ...next, prepStart: snapshot(next) }
}

// Printed cores are ordinary stat pips / attack units. They use the main scorer,
// not a second boss-specific interpretation of the faction abilities.
export const BOSSES = [
  { id: 'rootmaw', name: 'Rootmaw', filter: 'stats', packSize: 5,
    stats: [0, 0, 0], attacks: [1, 1, 1], shield: 0,
    art: 'b56bc733caf29fa4e495-9466c426a4f2faa16a2f.webp',
    rule: 'Absorbs all leftover stat cards after each pack.' },
  { id: 'ironhide', name: 'Ironhide', filter: 'attacks', packSize: 5,
    stats: [2, 2, 2], attacks: [0, 0, 0], shield: 0,
    art: '0e95b3b35ec1c389f896-24afb6acdbbdd0c3e0a9.webp',
    rule: 'Absorbs all leftover attacks after each pack. Includes neutral and conditional damage cards.' },
  { id: 'wildmouth', name: 'Wildmouth', filter: 'random', packSize: 6,
    stats: [1, 1, 1], attacks: [1, 1, 1], shield: 0,
    art: '380a24583b759ee9a5cd-46e556a73fab9cfb6911.webp',
    rule: 'Absorbs one random leftover after each six-card pack. Preparation specials stay dormant.' },
  { id: 'briarback', name: 'Briarback', filter: 'critter', packSize: 5,
    stats: [2, 0, 0], attacks: [1, 0, 0], shield: 2,
    art: 'cabdec752870e81d4bc8-78e88b4756372b81115f.webp',
    rule: 'Absorbs leftover cards with Critter stats or Critter attacks. Starts with two shield points.' },
]
export const bossDefinition = id => BOSSES.find(b => b.id === id) ?? BOSSES[0]
const catalog = () => getExpandedCoreDeck({ tabletop: RULES })

export function bossCard(id, options) {
  const b = bossDefinition(id)
  return { id: `boss_${b.id}`, uid: `boss_${b.id}`, name: b.name, type: 'boss', tabletop: RULES,
    stats: FACTIONS.flatMap((f, i) => Array(b.stats[i]).fill(f)), effect: {},
    images: [`${import.meta.env?.BASE_URL ?? '/'}images/art/${b.art}`],
    bossRule: options?.absorption === 'all' ? 'all' : b.filter, bossAttacks: b.attacks, bossShield: b.shield,
    bossDescription: options?.absorption === 'all' ? `Absorbs every leftover card from ${options.draftMode === 'separate' ? 'both players’ packs' : 'the shared pack'}. Preparation specials stay dormant.` : b.rule,
    bossPackSize: options?.draftMode === 'separate' ? 4 : b.packSize }
}

export function bossCore(id) {
  const b = bossDefinition(id)
  const card = (suffix, stats, effect) => ({ id: `boss_${b.id}_${suffix}`, uid: `boss_${b.id}_${suffix}`,
    name: b.name, type: stats.length ? 'stat' : 'action', tabletop: RULES, stats, effect })
  return [
    card('stats', FACTIONS.flatMap((f, i) => Array(b.stats[i]).fill(f)), {}),
    ...FACTIONS.flatMap((f, i) => Array.from({ length: b.attacks[i] }, (_, j) => card(`${f}_${j}`, [], { dmgType: f, dmg: 1 }))),
    ...(b.shield ? [card('shield', [], { shield: b.shield })] : []),
  ]
}

export function matchesBossFilter(card, filter) {
  if (filter === 'stats') return Boolean(card.stats?.length)
  if (filter === 'attacks') return Boolean(card.effect?.dmgType) || ['bite', 'one_off_each', 'shield_is_dmg', 'single_faction_2', 'discard_for_damage'].includes(card.id)
  if (filter === 'critter') return Boolean(card.stats?.includes('critter')) || card.effect?.dmgType === 'critter'
  return false
}

export function createBossRun({ bossId = BOSSES[0].id, seed = Date.now(), pockets = ['robot1', 'dragon1'], cleared = [], options, testMode = false } = {}) {
  const b = bossDefinition(bossId)
  const deck = buildShuffledDeck({ tabletop: RULES, seed })
  const pocketCards = pockets.map((id, seat) => {
    const chosen = POCKET_IDS.includes(id) ? id : 'critter1'
    const index = deck.findIndex(c => c.id === chosen)
    const [card] = deck.splice(index, 1)
    return { ...card, uid: `pocket_${seat}_${card.uid}` }
  })
  return { version: BOSS_SAVE_VERSION, bossId: b.id, seed, randomState: (seed >>> 0) || 1,
    options: normalizeOptions(options), testMode, history: [], draftStart: null, prepStart: null,
    phase: 'setup', pack: 1, deck, row: [], rows: [], hands: [[], []], absorbed: [], discard: [], refreshed: [],
    pockets: pocketCards, pocketUsed: [false, false], tools: { refresh: 1, swap: 1, double: 1 },
    playerTools: [0, 1].map(() => ({ refresh: 1, swap: 1, double: 1 })),
    turns: [0, 1], debt: [false, false], prep: null, types: [null, null], activeSeat: 0,
    cleared, result: null, lastAbsorbed: [] }
}

function consumeTurn(state, card, fromRow, seat = state.turns[0]) {
  const hands = state.hands.map((hand, i) => i === seat ? [...hand, card] : hand)
  const turns = state.turns.filter((_, i) => i !== state.turns.indexOf(seat))
  const separate = bossOptions(state).draftMode === 'separate'
  return { ...state, hands, turns,
    row: fromRow && !separate ? state.row.filter(c => c.uid !== card.uid) : state.row,
    rows: fromRow && separate ? state.rows.map((row, i) => i === seat ? row.filter(c => c.uid !== card.uid) : row) : state.rows,
    phase: turns.length ? 'draft' : 'collect' }
}

function collect(state) {
  const b = bossDefinition(state.bossId)
  let randomState = state.randomState
  const row = bossDraftRows(state).flat()
  let taken
  if (bossOptions(state).absorption === 'all') taken = row
  else if (b.filter === 'random') {
    taken = bossDraftRows(state).flatMap(pack => {
      randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0
      return pack.length ? [pack[Math.floor(randomState / 4294967296 * pack.length)]] : []
    })
  } else taken = row.filter(c => matchesBossFilter(c, b.filter))
  const uids = new Set(taken.map(c => c.uid))
  return { ...state, phase: 'collected', absorbed: [...state.absorbed, ...taken],
    discard: [...state.discard, ...row.filter(c => !uids.has(c.uid))],
    row: [], rows: bossOptions(state).draftMode === 'separate' ? [[], []] : [], randomState, lastAbsorbed: taken.map(c => c.uid) }
}

export function bossHand(state) { return [...bossCore(state.bossId), ...state.absorbed] }

export function resolveBossBattle(state) {
  const hand = bossHand(state), bp = getTabletopProfile(hand), bossType = chooseTabletopType(hand)
  const heroes = ['player', 'opponent'].map((side, i) => {
    const h = state.prep[`${side}Hand`]
    return scoreTabletopHand(h, bp.shields, state.types[i] ?? chooseTabletopType(h))
  })
  // Each hero faces all boss shields; each hero's shields protect the whole team.
  const shields = heroes.reduce((n, h) => n + h.shields, 0)
  const boss = scoreTabletopHand(hand, shields, bossType)
  const lower = bossOptions(state).weakerBonus ? Math.min(...heroes.map(h => h.score)) : 0
  const teamPower = heroes.reduce((n, h) => n + h.score, 0) + lower
  const teamTie = heroes.some(h => h.winsTies), bossTie = boss.winsTies
  const winner = teamPower > boss.score ? 'team' : teamPower < boss.score ? 'boss'
    : teamTie !== bossTie ? (teamTie ? 'team' : 'boss') : 'draw'
  return { heroes, boss, teamPower, weakerBonus: lower, winner, shields }
}

// Pure transitions also make reloads and random acquisition reproducible.
function transition(state, action) {
  if (action.type === 'new') return createBossRun(action.options)
  const options = bossOptions(state)
  // Separate packs have pending picks, not an enforced turn order. A card UID
  // identifies its owner; seat-specific tools supply the owner explicitly.
  const seat = options.draftMode === 'separate'
    ? action.seat ?? (action.uid ? state.rows.findIndex(row => row.some(c => c.uid === action.uid)) : state.turns[0])
    : state.turns[0]
  const canPick = state.phase === 'draft' && state.turns.includes(seat)
  const toolSeat = action.seat ?? seat ?? 0
  const packOpen = ['draft', 'collect'].includes(state.phase) && [0, 1].includes(seat) && bossActiveRow(state, seat)?.length > 0
  if (action.type === 'pocket-choice' && options.pockets && state.phase === 'setup' && [0, 1].includes(action.seat) && POCKET_IDS.includes(action.id)) {
    return createBossRun({ bossId: state.bossId, seed: state.seed, cleared: state.cleared, options, testMode: state.testMode,
      pockets: state.pockets.map((c, i) => i === action.seat ? action.id : c.id) })
  }
  if (action.type === 'start' && state.phase === 'setup') {
    const next = dealPack({ ...state, phase: 'draft' })
    return { ...next, draftStart: snapshot(next) }
  }
  if (action.type === 'pick' && state.phase === 'draft') {
    const card = canPick ? bossActiveRow(state, seat).find(c => c.uid === action.uid) : null
    return card ? consumeTurn(state, card, true, seat) : state
  }
  if (action.type === 'pocket' && options.pockets && [0, 1].includes(toolSeat) && !state.pocketUsed[toolSeat] && action.uid && ['draft', 'collect', 'collected', 'prepare'].includes(state.phase)) {
    const side = toolSeat ? 'opponent' : 'player'
    if (state.prep?.[`${side}PendingDiscard`]) return state
    const hand = state.prep?.[`${side}Hand`] ?? state.hands[toolSeat]
    const old = hand.find(c => c.uid === action.uid)
    if (!old) return state
    const replacement = hand.map(c => c.uid === old.uid ? state.pockets[toolSeat] : c)
    const patch = { pocketUsed: state.pocketUsed.map((v, i) => i === toolSeat ? true : v),
      types: state.types.map((v, i) => i === toolSeat ? null : v) }
    if (state.phase === 'prepare') return { ...state, ...patch, activeSeat: toolSeat,
      prep: { ...state.prep, [`${side}Hand`]: replacement, [`${side}Finished`]: false,
        ...preparationDiscardPatch(state.prep, side, [...state.prep.playerDiscard, old]) } }
    const open = ['draft', 'collect'].includes(state.phase)
    return { ...state, ...patch, hands: state.hands.map((h, i) => i === toolSeat ? replacement : h),
      ...(open ? options.draftMode === 'separate'
        ? { rows: state.rows.map((r, i) => i === toolSeat ? [...r, old] : r) }
        : { row: [...state.row, old] }
        : { discard: [...state.discard, old] }) }
  }
  if (action.type === 'pocket' && options.pockets && canPick && !state.pocketUsed[seat]) {
    return consumeTurn({ ...state, pocketUsed: state.pocketUsed.map((v, i) => i === seat ? true : v) }, state.pockets[seat], false, seat)
  }
  if (action.type === 'refresh' && options.refresh && packOpen && bossToolCharges(state, seat).refresh && state.deck.length) {
    const card = bossActiveRow(state, seat).find(c => c.uid === action.uid)
    if (!card) return state
    const replace = row => row.map(c => c.uid === card.uid ? state.deck[0] : c)
    return { ...state, row: replace(state.row), rows: state.rows?.map(replace), deck: state.deck.slice(1),
      refreshed: [...state.refreshed, card], ...spendTool(state, seat, 'refresh') }
  }
  if (action.type === 'double' && options.double && packOpen && state.pack < options.rounds && bossToolCharges(state, seat).double && !state.debt[seat]) {
    return { ...state, phase: 'draft', turns: [seat, ...state.turns], debt: state.debt.map((v, i) => i === seat ? true : v), ...spendTool(state, seat, 'double') }
  }
  if (action.type === 'swap' && options.swap && ['draft', 'collect', 'collected', 'prepare'].includes(state.phase) && [0, 1].includes(toolSeat) && bossToolCharges(state, toolSeat).swap) {
    if (state.prep?.playerPendingDiscard || state.prep?.opponentPendingDiscard) return state
    const hands = state.prep ? [state.prep.playerHand, state.prep.opponentHand] : state.hands
    const a = hands[0].find(c => c.uid === action.a), c = hands[1].find(c => c.uid === action.b)
    if (!a || !c) return state
    const swapped = hands.map((hand, i) => hand.map(v => v.uid === (i ? c.uid : a.uid) ? (i ? a : c) : v))
    if (state.phase === 'prepare') {
      const used = new Set([...state.prep.playerActivated, ...state.prep.opponentActivated])
      const activated = ['player', 'opponent'].map((side, i) => [
        ...state.prep[`${side}Activated`].filter(uid => uid !== a.uid && uid !== c.uid),
        ...[i ? a.uid : c.uid].filter(uid => used.has(uid)),
      ])
      return { ...state, ...spendTool(state, toolSeat, 'swap'), types: [null, null], activeSeat: toolSeat,
        prep: { ...state.prep, playerHand: swapped[0], opponentHand: swapped[1],
          playerFinished: false, opponentFinished: false, playerActivated: activated[0], opponentActivated: activated[1] } }
    }
    return { ...state, hands: swapped, ...spendTool(state, toolSeat, 'swap') }
  }
  if (action.type === 'collect' && state.phase === 'collect') return collect(state)
  if (action.type === 'next' && state.phase === 'collected') {
    if (state.pack === options.rounds) return beginPreparation(state)
    const pack = state.pack + 1
    const turns = [pack % 2 ? 0 : 1, pack % 2 ? 1 : 0].filter(i => !state.debt[i])
    return dealPack({ ...state, pack, turns, debt: [false, false], phase: turns.length ? 'draft' : 'collect', lastAbsorbed: [] })
  }
  if (action.type === 'seat' && state.phase === 'prepare' && [0, 1].includes(action.seat) &&
      !state.prep[`${action.seat ? 'opponent' : 'player'}Finished`]) return { ...state, activeSeat: action.seat }
  if (action.type === 'faction' && state.phase === 'prepare') {
    const prepSeat = action.seat ?? state.activeSeat
    if (![0, 1].includes(prepSeat)) return state
    const side = prepSeat ? 'opponent' : 'player'
    if (state.prep[`${side}Finished`] || state.prep[`${side}PendingDiscard`]) return state
    const hand = state.prep[`${side}Hand`]
    if (!getTabletopProfile(hand).types.includes(action.faction)) return state
    return { ...state, activeSeat: prepSeat, types: state.types.map((v, i) => i === prepSeat ? action.faction : v) }
  }
  if (action.type === 'cancel-sacrifice' && state.phase === 'prepare') {
    const prepSeat = action.seat ?? state.activeSeat
    if (![0, 1].includes(prepSeat)) return state
    const side = prepSeat ? 'opponent' : 'player'
    const pending = state.prep[`${side}PendingDiscard`]
    if (pending?.cardId !== 'discard_for_damage') return state
    // The UI stages sacrifices until Accept, so cancellation has no card moves
    // to undo. Once real discards occurred, only the official finish is legal.
    const source = state.prep[`${side}Hand`].find(c => c.uid === pending.sourceUid)
    if (!source || (source.sacrificedPower ?? 0) !== (state.sacrificeStartPowers?.[prepSeat] ?? state.sacrificeStartPower ?? 0)) return state
    return { ...state, prep: { ...state.prep, [`${side}PendingDiscard`]: null,
      [`${side}Activated`]: state.prep[`${side}Activated`].filter(uid => uid !== pending.sourceUid) } }
  }
  if (action.type === 'prepare' && state.phase === 'prepare') {
    const prepSeat = action.seat ?? state.activeSeat
    if (![0, 1].includes(prepSeat)) return state
    const side = prepSeat ? 'opponent' : 'player'
    if (action.action.type === 'finish-preparation') {
      const types = getTabletopProfile(state.prep[`${side}Hand`]).types
      if (types.length > 1 && !types.includes(state.types[prepSeat])) return state
    }
    let prep
    try { prep = applyPreparationAction(state.prep, side, action.action) }
    catch (error) {
      // A shared Recycle target or an activation can become stale between clicks.
      if (error.message === `Illegal preparation action for ${side}`) return state
      throw error
    }
    const types = state.types.map((v, i) => i === prepSeat && action.action.type !== 'finish-preparation' ? null : v)
    const activatingSacrifice = action.action.type === 'prepare' && action.action.cardId === 'discard_for_damage'
    const next = { ...state, prep, types, ...(activatingSacrifice ? { sacrificeStartPowers: [0, 1].map(i => i === prepSeat
      ? state.prep[`${side}Hand`].find(c => c.uid === action.action.sourceUid)?.sacrificedPower ?? 0
      : state.sacrificeStartPowers?.[i] ?? state.sacrificeStartPower ?? 0) } : {}) }
    if (prep.playerFinished && prep.opponentFinished) {
      const result = resolveBossBattle(next)
      return { ...next, phase: 'result', result, cleared: result.winner === 'team' ? [...new Set([...state.cleared, state.bossId])] : state.cleared }
    }
    // Focus is retained only for old callers without a seat; it never gates play.
    return { ...next, activeSeat: prep[`${side}Finished`] ? 1 - prepSeat : prepSeat }
  }
  return state
}

// Navigation restores complete physical-card snapshots, including shared draws,
// consumed tools, faction choices and the random cursor. It cannot duplicate cards.
export function bossReducer(state, action) {
  if (action.type === 'test-mode') return { ...state, testMode: Boolean(action.enabled), history: [] }
  if (action.type === 'restart' || action.type === 'options') {
    const next = createBossRun({ bossId: state.bossId, seed: state.seed,
      pockets: state.pockets.map(c => c.id), cleared: state.draftStart?.cleared ?? state.cleared,
      options: action.type === 'options' ? action.options : bossOptions(state), testMode: state.testMode })
    return action.type === 'restart' ? transition(next, { type: 'start' }) : next
  }
  if (action.type === 'replay-prep' && state.prep) {
    const saved = state.prepStart ?? snapshot(beginPreparation(state))
    return { ...saved, testMode: state.testMode, draftStart: state.draftStart, prepStart: saved, history: [] }
  }
  if (action.type === 'replay-draft' && state.testMode && state.draftStart) {
    return { ...state.draftStart, testMode: true, draftStart: state.draftStart, prepStart: null, history: [] }
  }
  if (action.type === 'undo' && state.testMode && state.history?.length) {
    const saved = state.history.at(-1)
    return { ...saved, testMode: true, draftStart: state.draftStart,
      prepStart: saved.prep ? state.prepStart : null, history: state.history.slice(0, -1) }
  }
  if (action.type === 'jump-prep' && state.testMode && ['setup', 'draft', 'collect', 'collected'].includes(state.phase)) {
    let next = state.phase === 'setup' ? transition(state, { type: 'start' }) : state
    for (let guard = 0; guard < 100 && next.phase !== 'prepare'; guard++) {
      next = transition(next, next.phase === 'draft' ? { type: 'pick', uid: bossActiveRow(next)[0].uid }
        : { type: next.phase === 'collect' ? 'collect' : 'next' })
    }
    return { ...next, history: [...(state.history ?? []), snapshot(state)].slice(-40) }
  }
  const next = transition(state, action)
  if (next === state || action.type === 'new' || action.type === 'pocket-choice' || action.type === 'seat') return next
  return state.testMode ? { ...next, history: [...(state.history ?? []), snapshot(state)].slice(-40) } : next
}

export function pocketCatalog() { return POCKET_IDS.map(id => catalog().find(c => c.id === id)) }
