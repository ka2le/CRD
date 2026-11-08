import { useState } from 'react'
import { getCoreCards } from '../../game/cards'
import { toTabletopCard } from '../../game/tabletop'
import { MAX_MONSTER_COPIES, MIN_MONSTER_DECK, monsterCopies, monsterDeckRecipe } from '../../game/monsters'
import CardButton from '../card/CardButton'
import { useCardInspect } from './inspectContext'
import { CARD_GROUPS, getCardGroup } from '../card/cardMeta'

const definitions = getCoreCards({ tabletop: 'monsters', includeDisabled: true })
  .sort((a, b) => Number(b.id.startsWith('monster')) - Number(a.id.startsWith('monster'))
    || CARD_GROUPS.findIndex(g => g.key === getCardGroup(a)) - CARD_GROUPS.findIndex(g => g.key === getCardGroup(b)))
const readableName = card => ({ critter1: 'Critter', robot1: 'Robot', dragon1: 'Dragon', rabbit2: 'Double Critter', robot2: 'Double Robot', dragon2: 'Double Dragon', shield2: 'Shield', one_off_each: 'One of Each' }[card.id]
  ?? card.name.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase()))

export default function MonsterDeckEditor({ monsterDeck, wildDeck, onApply }) {
  const inspect = useCardInspect()
  const [counts, setCounts] = useState(() => monsterDeckRecipe(definitions, { monsterDeck, wildDeck }).monsterDeck)
  const [filter, setFilter] = useState('all')
  const [message, setMessage] = useState('')
  const recipe = monsterDeckRecipe(definitions, { monsterDeck: counts, wildDeck })
  const saved = monsterDeckRecipe(definitions, { monsterDeck, wildDeck })
  const dirty = recipe.recipeId !== saved.recipeId
  const setCount = (id, count) => {
    setCounts(current => ({ ...current, [id]: Math.max(0, Math.min(MAX_MONSTER_COPIES, Math.trunc(Number(count) || 0))) }))
    setMessage('')
  }
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(recipe, null, 2) + '\n'], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${recipe.recipeId}.json`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  async function importRecipe(event) {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const value = JSON.parse(await file.text())
      const ids = new Set(definitions.map(card => card.id))
      if (value.rulesVersion !== recipe.rulesVersion || value.handSize !== recipe.handSize || value.packSize !== recipe.packSize || !value.monsterDeck
        || Object.keys(value.monsterDeck).length !== ids.size
        || Object.entries(value.monsterDeck).some(([id, n]) => !ids.has(id) || !Number.isInteger(n) || n < 0 || n > MAX_MONSTER_COPIES)) {
        throw new Error('Use a complete Monsters v1 recipe with counts from 0 to 30.')
      }
      setCounts(value.monsterDeck)
      setMessage('Recipe loaded. Apply it to start a new deal.')
    } catch (error) { setMessage(`Could not import: ${error.message}`) }
    event.target.value = ''
  }
  return (
    <div className="monster-editor">
      <div className="monster-editor__bar">
        <strong>{recipe.total} cards · {recipe.recipeId}</strong>
        <span>{dirty ? 'Unapplied changes' : 'Current deck'}</span>
        <button className="ui-button" type="button" disabled={!dirty || recipe.total < MIN_MONSTER_DECK}
          onClick={() => { onApply({ monsterDeck: counts }); setMessage('Deck saved. A new game has been dealt.') }}>Apply & deal</button>
        <button className="ui-button" type="button" onClick={() => setCounts(monsterDeckRecipe(definitions, { wildDeck }).monsterDeck)}>Reset counts</button>
      </div>
      <p>Six-card hands · six-card draft packs. Toggle cards or set exact copy counts. Apply starts a new game. Monsters have no faction bonus yet; each shield blocks 1 power.</p>
      {recipe.total < MIN_MONSTER_DECK ? <p role="alert">Keep at least {MIN_MONSTER_DECK} cards so Draft and Discard can finish.</p> : null}
      <div className="collection__filters" role="tablist" aria-label="Edit card type">
        {[{ key: 'all', label: 'All' }, ...CARD_GROUPS].map(group => <button key={group.key} type="button" role="tab"
          aria-selected={filter === group.key} onClick={() => setFilter(group.key)} className={filter === group.key ? 'is-on' : ''}>{group.label}</button>)}
      </div>
      <div className="monster-editor__cards">
        {definitions.filter(card => filter === 'all' || getCardGroup(card) === filter).map(definition => {
          const count = counts[definition.id]
          const card = { ...toTabletopCard(definition, 'monsters'), uid: `edit-${definition.id}`, imageIndex: 0 }
          return <div key={card.id} className={`monster-editor__card ${count ? '' : 'is-off'}`}>
            <CardButton card={card} onToggle={() => inspect?.(card, [])} />
            <label className="monster-editor__name"><input type="checkbox" checked={count > 0} aria-label={`Include ${card.name}`}
              onChange={event => setCount(card.id, event.target.checked ? (monsterCopies(definition, { wildDeck }) || 1) : 0)} />{readableName(card)}</label>
            <div className="monster-editor__counter">
              <button type="button" aria-label={`Fewer ${card.name}`} disabled={!count} onClick={() => setCount(card.id, count - 1)}>−</button>
              <input type="number" min="0" max={MAX_MONSTER_COPIES} value={count} aria-label={`${card.name} copies`} onChange={event => setCount(card.id, event.target.value)} />
              <button type="button" aria-label={`More ${card.name}`} disabled={count === MAX_MONSTER_COPIES} onClick={() => setCount(card.id, count + 1)}>+</button>
            </div>
          </div>
        })}
      </div>
      <details className="monster-editor__recipe">
        <summary>Deck recipe · {dirty ? 'unapplied' : 'saved'} · {recipe.recipeId}</summary>
        <p>Exact counts for this setup. Save or copy this recipe for a later FelixM test.</p>
        <textarea aria-label="Monsters deck recipe" readOnly value={JSON.stringify(recipe, null, 2)} rows={12} />
        <button type="button" className="ui-button" onClick={download}>Download recipe</button>
        <label className="ui-button">Import recipe<input type="file" accept=".json,application/json" onChange={importRecipe} /></label>
      </details>
      {message ? <p role="status">{message}</p> : null}
    </div>
  )
}
