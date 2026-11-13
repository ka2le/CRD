import { useState } from 'react'
import { BOSS_PRESETS, bossOptions } from '../../game/bossBattle'
import Sheet from '../overlay/Sheet'

function Toggle({ label, checked, onChange, detail }) {
  return <label className="boss-option-toggle">
    <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
    <span>{label}{detail ? <small>{detail}</small> : null}</span>
  </label>
}

export default function BossOptions({ state, onClose, onApply, onAction, onNewDeal, onChooseBoss, onExit, animation, onAnimation }) {
  const [draft, setDraft] = useState(() => bossOptions(state))
  const change = patch => setDraft(old => ({ ...old, ...patch }))
  const go = type => { onAction({ type }); onClose() }
  return <Sheet open title="Boss options · Co-op" onClose={onClose} className="boss-options-sheet">
    <div className="boss-options">
      <fieldset>
        <legend>Try a version</legend>
        <div className="boss-options-actions">
          {Object.entries(BOSS_PRESETS).map(([key, options]) => <button key={key} className="ui-button"
            aria-pressed={Object.keys(options).every(k => draft[k] === options[k])}
            onClick={() => setDraft({ ...options })}>{key === 'original' ? 'Original shared draft' : 'Separate 4-card packs'}</button>)}
        </div>
        <p>Presets fill the options below. Mix them freely, then apply.</p>
      </fieldset>
      <fieldset>
        <legend>Draft & battle rules</legend>
        <label className="boss-option-select">Draft packs<select aria-label="Draft packs" value={draft.draftMode} onChange={e => change({ draftMode: e.target.value })}>
          <option value="separate">Separate · 4 cards per player</option>
          <option value="shared">Shared · boss’s 5 / 6-card pack</option>
        </select></label>
        <label className="boss-option-select">Rounds<select aria-label="Draft rounds" value={draft.rounds} onChange={e => change({ rounds: Number(e.target.value) })}>
          <option value={5}>5 rounds · 5 picks each</option><option value={4}>4 rounds · 4 picks each</option>
        </select></label>
        <label className="boss-option-select">Boss collects<select aria-label="Boss collects" value={draft.absorption} onChange={e => change({ absorption: e.target.value })}>
          <option value="all">All leftovers</option><option value="boss">Matching its printed filter</option>
        </select></label>
        <Toggle label="Double the lower-power player" checked={draft.weakerBonus} onChange={v => change({ weakerBonus: v })}
          detail={draft.weakerBonus ? 'Team = higher + twice lower' : 'Team = Player 1 + Player 2'} />
      </fieldset>
      <fieldset>
        <legend>Draft tools</legend>
        <div className="boss-options-tools">{[['pockets', 'Pocket cards'], ['refresh', 'Refresh'], ['swap', 'Swap'], ['double', '2 now · borrow next pick']].map(([key, label]) =>
          <Toggle key={key} label={label} checked={draft[key]} onChange={v => change({ [key]: v })} />)}</div>
      </fieldset>
      <div className="boss-options-apply"><button className="ui-button ui-button--primary" onClick={() => onApply(draft)}>Apply rules & restart deal</button>
        <p>Returns to setup with this seed and empty Pockets. New rules apply to the whole encounter.</p></div>
      <fieldset>
        <legend>Replay & navigation</legend>
        <div className="boss-options-actions">
          <button className="ui-button" onClick={() => go('restart')}>Restart same deal</button>
          <button className="ui-button" onClick={onNewDeal}>Fresh deal</button>
          <button className="ui-button" disabled={!state.prep} onClick={() => go('replay-prep')}>Replay prep</button>
          <button className="ui-button" onClick={onChooseBoss}>Choose boss</button>
        </div>
        <p>Restart repeats the shuffle. Replay prep restores both original hands, the deck and shared discard pile.</p>
        <Toggle label="Test mode" checked={Boolean(state.testMode)} onChange={enabled => onAction({ type: 'test-mode', enabled })}
          detail="Enable undo and navigation here in Boss options." />
        {state.testMode ? <div className="boss-options-actions">
          <button className="ui-button" disabled={!state.history?.length} onClick={() => go('undo')}>Undo last action</button>
          <button className="ui-button" disabled={!state.draftStart} onClick={() => go('replay-draft')}>Back to draft start</button>
          <button className="ui-button" disabled={Boolean(state.prep)} onClick={() => go('jump-prep')}>Fill picks & jump to prep</button>
          <p>Jump keeps your picks and fills each remaining pick with the first card in that player’s pack.</p>
        </div> : null}
        <p className="boss-seed">Deal seed: {state.seed} · {state.phase} · round {state.pack}/{bossOptions(state).rounds}</p>
      </fieldset>
      <Toggle label="Battle animation" checked={animation} onChange={onAnimation} />
      <button className="ui-button" onClick={onExit}>Normal play</button>
    </div>
  </Sheet>
}
