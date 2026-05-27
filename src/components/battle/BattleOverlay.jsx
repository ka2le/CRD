import './BattleOverlay.css'

function getWinnerLabel(winner) {
  if (winner === 'player') return 'You Win'
  if (winner === 'opponent') return 'Opponent Wins'
  return 'Tie Game'
}

export default function BattleOverlay({ battlePlayback, battleResult, onNewGame, onClose, visible }) {
  if (!visible || !battlePlayback) return null

  const winnerText = battleResult ? getWinnerLabel(battleResult.winner) : null

  return (
    <div className="battle-overlay" onClick={onClose}>
      <div className="battle-overlay__popup ui-panel" onClick={(event) => event.stopPropagation()}>
        <h2>{winnerText}</h2>
        <p>
          Round {battlePlayback.round} · You dealt {battlePlayback.playerTotalDamageDealt} · Opponent dealt {battlePlayback.opponentTotalDamageDealt}
        </p>
        <div className="battle-overlay__actions">
          <button type="button" className="ui-button ui-button--primary" onClick={onNewGame}>New Game</button>
        </div>
      </div>
    </div>
  )
}
