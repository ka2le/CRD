import './BattleView.css'
import { DISPLAY_ICONS, STAT_ICONS } from '../card/cardData'

const BATTLE_HEALTH = 21
const STAT_ORDER = ['critter', 'robot', 'dragon']

function ShieldPulse({ amount = 0, side }) {
  if (!amount) return null

  return (
    <div className={`battle-view__shield-pulse battle-view__shield-pulse--${side}`}>
      <img src={DISPLAY_ICONS.shield} alt="" className="battle-view__shield-icon" />
      <span>+{amount}</span>
    </div>
  )
}

function BlockPop({ amount = 0, side, tick }) {
  if (!amount) return null

  return (
    <div key={`${tick}-${side}-block`} className={`battle-view__block-pop battle-view__block-pop--${side}`}>
      <img src={DISPLAY_ICONS.shield} alt="" className="battle-view__block-icon" />
      <span>{amount}</span>
    </div>
  )
}

function StatPips({ stats = {} }) {
  return (
    <div className="battle-view__stats-row">
      {STAT_ORDER.map((stat) => (
        <div key={stat} className="battle-view__stat-pill">
          <img src={STAT_ICONS[stat]} alt={stat} className="battle-view__stat-icon" />
          <span>{stats?.[stat] ?? 0}</span>
        </div>
      ))}
    </div>
  )
}

export default function BattleView({ battlePlayback, battleLogOpen, onToggleBattleLog, damageFlash }) {
  return (
    <section className="battle-view ui-panel table-slot">
      <div className="battle-view__status-bar">
        <div className="battle-view__fighter-card battle-view__fighter-card--opponent">
          <div className="battle-view__fighter-topline">
            <div className="battle-view__fighter-name">Opponent</div>
            <div className="battle-view__health-value">
              {battlePlayback?.opponentHealth ?? BATTLE_HEALTH} / {BATTLE_HEALTH}
            </div>
          </div>
          <div className="battle-view__health-track">
            <div
              className="battle-view__health-fill"
              style={{ width: `${((battlePlayback?.opponentHealth ?? BATTLE_HEALTH) / BATTLE_HEALTH) * 100}%` }}
            />
          </div>
          <StatPips stats={battlePlayback?.opponentStats} />
          <ShieldPulse side="opponent" amount={battlePlayback?.opponentShield ?? 0} />
          {damageFlash?.opponent ? (
            <div key={`${damageFlash.tick}-opponent`} className="battle-view__damage-pop">
              -{damageFlash.opponent}
            </div>
          ) : null}
          <BlockPop amount={damageFlash?.opponentBlocked ?? 0} side="opponent" tick={damageFlash?.tick} />
        </div>

        <div className="battle-view__ring">
          <div className="battle-view__round-ghost">{typeof battlePlayback?.round === 'number' ? battlePlayback.round : ''}</div>
          <div key={battlePlayback?.round ?? 'battle'} className="battle-view__round-badge">
            {typeof battlePlayback?.round === 'number' ? `Round ${battlePlayback.round}` : 'Battle'}
          </div>
        </div>

        <div className="battle-view__fighter-card battle-view__fighter-card--player">
          <div className="battle-view__fighter-topline">
            <div className="battle-view__fighter-name">You</div>
            <div className="battle-view__health-value">
              {battlePlayback?.playerHealth ?? BATTLE_HEALTH} / {BATTLE_HEALTH}
            </div>
          </div>
          <div className="battle-view__health-track">
            <div
              className="battle-view__health-fill"
              style={{ width: `${((battlePlayback?.playerHealth ?? BATTLE_HEALTH) / BATTLE_HEALTH) * 100}%` }}
            />
          </div>
          <StatPips stats={battlePlayback?.playerStats} />
          <ShieldPulse side="player" amount={battlePlayback?.playerShield ?? 0} />
          {damageFlash?.player ? (
            <div key={`${damageFlash.tick}-player`} className="battle-view__damage-pop">
              -{damageFlash.player}
            </div>
          ) : null}
          <BlockPop amount={damageFlash?.playerBlocked ?? 0} side="player" tick={damageFlash?.tick} />
        </div>
      </div>

      <button
        type="button"
        className={['battle-view__log-toggle', 'ui-button', battleLogOpen ? 'battle-view__log-toggle--open' : ''].filter(Boolean).join(' ')}
        onClick={onToggleBattleLog}
      >
        Battle Log
      </button>

      {battleLogOpen && (
        <div className="battle-view__log-panel ui-panel">
          {battlePlayback && (
            <>
              <div className="battle-view__summary-row">
                <span className="battle-view__summary-side">You</span>
                <span className="battle-view__summary-action">{battlePlayback.playerTriggered.join(', ') || '—'}</span>
              </div>
              <div className="battle-view__summary-row">
                <span className="battle-view__summary-side">Opp</span>
                <span className="battle-view__summary-action">{battlePlayback.opponentTriggered.join(', ') || '—'}</span>
              </div>
              <div className="battle-view__totals">
                <span>You: {battlePlayback.playerTotalDamageDealt}</span>
                <span>Opp: {battlePlayback.opponentTotalDamageDealt}</span>
              </div>
              {(battlePlayback.playerShield > 0 || battlePlayback.opponentShield > 0) && (
                <div className="battle-view__totals battle-view__totals--shield">
                  <span>You shield: {battlePlayback.playerShield}</span>
                  <span>Opp shield: {battlePlayback.opponentShield}</span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}
