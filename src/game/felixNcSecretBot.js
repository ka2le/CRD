import { chooseFelixNcDecision } from './felixNcBot.js'

export const FELIX_NC_SECRET_VERSION = 'felixnc-secret-zero-slot-v1'
// A missing card, not an invented mechanic or a guess at the hidden identity.
const HIDDEN_SLOT = Object.freeze({ id: '__secret_unknown__', uid: '__secret_unknown__',
  tabletop: 'abilities-new-cards', felixEffects: Object.freeze(Array(16).fill(0)) })

export function chooseFelixNcSecretDecision(game, side = 'opponent') {
  const enemy = side === 'opponent' ? 'player' : 'opponent'
  if (game.mode !== 'draft' || !game.secretCard || (game.handSize ?? 5) !== 5
    || ![...game[`${side}Hand`], ...game.draftRow].every(card => card.tabletop === 'abilities-new-cards')) {
    throw Error('FelixNCSecret requires five-card NC Secret Card Draft')
  }
  // The private opening is precisely the ordinary first-pick call. Afterwards
  // keep the actor's secret and all public cards, omitting the enemy's secret.
  const own = game.secretOpening ? [] : game[`${side}Hand`]
  const visibleEnemy = game.secretOpening ? [] : game[`${enemy}Hand`].filter(card => !card.secret)
  const enemyHand = game.secretOpening ? [] : [...visibleEnemy, HIDDEN_SLOT]
  const result = chooseFelixNcDecision({ mode: 'draft', draftRow: game.draftRow,
    [`${side}Hand`]: own, [`${enemy}Hand`]: enemyHand }, side)
  return { ...result, version: FELIX_NC_SECRET_VERSION, kernel: 'FelixNCSecret-neural-draft',
    stage: game.secretOpening ? 'FelixNCSecret-opening' : `FelixNCSecret-round${own.length + 1}`,
    compatibility: 'Existing five-slot FelixNC; enemy secret omitted with one zero feature slot; no retraining.' }
}
