import model from '../../data/felix-nc6-draft-net.json' with { type: 'json' }
import frozen from '../../data/felix-nc-draft-net.json' with { type: 'json' }
import * as tt from './tabletop.js'
import * as cards from './cards.js'
import * as search from './searchAi.js'
import * as prep from './preparationState.js'
import * as rules from './preBattle.js'
import { makeAdapter } from './felixEffects.js'
import { createNCAdapter as createFiveAdapter } from './felixNcPolicy.js'
import { createNCAdapter, createNCDraftPolicy } from './felixNc6Policy.js'
import { createNC6Bridge, createNC6Preparation } from './felixNc6Bridge.js'
import { createProbabilityPreparation } from './probabilityPreparationCore.js'

export const FELIX_NC6_CHECKPOINT_SHA256 = model.checkpoint_sha256
const adapter = createNCAdapter({ tt, cards, makeAdapter })
const policy = createNCDraftPolicy(model, adapter)
const bridge = createNC6Bridge(frozen, createFiveAdapter({ tt, cards, makeAdapter }))
const prepare = createNC6Preparation({ search, prep, rules, tt, createProbabilityPreparation })
const other = side => side === 'player' ? 'opponent' : 'player'

export function snapshotFelixNc6Decision(game, side = 'opponent') {
  const enemy = other(side)
  return { mode: game.mode, phase: game.phase, draftRow: game.draftRow ?? [],
    [`${side}Hand`]: game[`${side}Hand`],
    [`${enemy}Hand`]: game.phase === 'draft-hidden-discard' ? game[`${enemy}DraftedHand`] : game[`${enemy}Hand`],
    playerDraftedHand: game.playerDraftedHand, opponentDraftedHand: game.opponentDraftedHand }
}

export function chooseFelixNc6Decision(game, side = 'opponent') {
  const view = snapshotFelixNc6Decision(game, side)
  if (view.mode !== '6draft' || ![...view.playerHand, ...view.opponentHand, ...view.draftRow].every(c => c.tabletop === 'abilities-new-cards')) throw Error('Felix six-draft requires Abilities+NewCards')
  if (view.phase === 'draft-hidden-discard') return bridge.discard(view[`${side}Hand`], view[`${other(side)}DraftedHand`])
  return { ...policy.choose(view, side), kernel: 'FelixNC6-neural-draft', checkpointSha256: FELIX_NC6_CHECKPOINT_SHA256 }
}

// Canonical actor-visible planner state. The worker never receives the rival's
// real set-aside/prepared cards or the actual order of the unseen deck.
export function publicFelixNc6Preparation(preparation, game, side = 'opponent') {
  const enemy = other(side), v = search.preparationView(preparation, game, side)
  const publicEnemy = game[`${enemy}DraftedHand`], placeholder = publicEnemy.slice(0, 5)
  const publicGame = { mode: '6draft', phase: 'battle-ready', deck: v.unseen, draftRow: [],
    draftDiscard: game.draftDiscard ?? [], playerDraftedHand: game.playerDraftedHand,
    opponentDraftedHand: game.opponentDraftedHand,
    [`${side}Hand`]: game[`${side}Hand`], [`${enemy}Hand`]: placeholder,
    [`${side}HiddenDiscard`]: game[`${side}HiddenDiscard`] ?? [], [`${enemy}HiddenDiscard`]: [] }
  const visible = { deck: v.unseen,
    [`${side}Hand`]: v.ownHand, [`${side}Discard`]: v.ownDiscard,
    [`${side}Activated`]: v.ownActivated, [`${side}PendingDiscard`]: v.ownPendingDiscard,
    [`${side}Finished`]: false, [`${side}DrawnCount`]: 0,
    [`${enemy}Hand`]: placeholder, [`${enemy}Discard`]: v.enemyPublicPile,
    [`${enemy}Activated`]: [], [`${enemy}PendingDiscard`]: null,
    [`${enemy}Finished`]: false, [`${enemy}DrawnCount`]: 0 }
  return { game: publicGame, preparation: visible, actor: side }
}

export function chooseFelixNc6Preparation(state) { return prepare(state) }

export async function completeFelixNc6Preparation(preparation, game, side = 'opponent', plan = state => chooseFelixNc6Preparation(state)) {
  let current = preparation
  for (let step = 0; step < 64 && !current[`${side}Finished`]; step++) {
    const visible = publicFelixNc6Preparation(current, game, side)
    const result = await plan(visible)
    // Real private draws are applied by the host only after choosing the action.
    current = prep.applyPreparationAction(current, side, result.action)
  }
  if (!current[`${side}Finished`]) throw Error('Felix preparation exceeded its action limit')
  return { preparation: current }
}
