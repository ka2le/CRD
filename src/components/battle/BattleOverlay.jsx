import './BattleOverlay.css'
import { GameIcon, SvgIcon } from '../ui/GameIcon'
import { TabletopFormula } from './TabletopScore'

const RESULT_COPY = {
  player: { title: 'Victory', tone: 'win' },
  opponent: { title: 'Defeat', tone: 'loss' },
  tie: { title: 'Draw', tone: 'tie' },
}

export default function BattleOverlay({ battlePlayback, battleResult, onNewGame, onClose, visible, playerName = 'You', opponentName = 'Opponent', spectating = false, newGameLabel = 'Play again' }) {
  if (!visible || !battlePlayback || !battleResult) return null

  const copy = RESULT_COPY[battleResult.winner] ?? RESULT_COPY.tie
  const playerDealt = battlePlayback.playerTotalDamageDealt
  const opponentDealt = battlePlayback.opponentTotalDamageDealt
  const maxDealt = Math.max(playerDealt, opponentDealt, 1)
  const tabletop = battleResult.mode === 'tabletop'
  const winnerName = battleResult.winner === 'player' ? playerName : battleResult.winner === 'opponent' ? opponentName : null

  return (
    <div className={`battle-result battle-result--${copy.tone}`} onClick={onClose}>
      <div className="battle-result__panel" onClick={(event) => event.stopPropagation()}>
        <div className="battle-result__rays" aria-hidden="true" />
        <h2 className="battle-result__title">{spectating && winnerName ? `${winnerName} wins` : copy.title}</h2>
        {winnerName && !spectating ? <p className="battle-result__winner">{winnerName} wins</p> : null}

        {tabletop ? (
          <div className="tabletop-score__formulas">
            <TabletopFormula score={battleResult.player} label={playerName} />
            <TabletopFormula score={battleResult.opponent} label={opponentName} />
          </div>
        ) : <>
        <div className="battle-result__meta">
          <GameIcon name="cd" />
          <span>{battlePlayback.round}</span>
        </div>

        <div className="battle-result__bars" aria-label="Damage dealt">
          <div className="battle-result__bar battle-result__bar--player">
            <span className="battle-result__side" aria-hidden="true" />
            <span className="battle-result__track">
              <span className="battle-result__fill" style={{ width: `${(playerDealt / maxDealt) * 100}%` }} />
            </span>
            <GameIcon name="damage" />
            <span className="battle-result__value">{playerDealt}</span>
          </div>
          <div className="battle-result__bar battle-result__bar--opponent">
            <span className="battle-result__side" aria-hidden="true" />
            <span className="battle-result__track">
              <span className="battle-result__fill" style={{ width: `${(opponentDealt / maxDealt) * 100}%` }} />
            </span>
            <GameIcon name="damage" />
            <span className="battle-result__value">{opponentDealt}</span>
          </div>
        </div>

        </>}
        <div className="battle-result__actions">
          <button type="button" className="ui-button ui-button--icon battle-result__view" onClick={onClose} aria-label="View the table">
            <SvgIcon name="eye" />
          </button>
          <button type="button" className="ui-button ui-button--primary battle-result__again" onClick={onNewGame}>
            <SvgIcon name="replay" />
            {newGameLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
