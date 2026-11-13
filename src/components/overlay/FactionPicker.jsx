import Sheet from './Sheet'
import { GameIcon } from '../ui/GameIcon'
import './FactionPicker.css'

const LABELS = { critter: 'Critters', robot: 'Robots', dragon: 'Dragons', monster: 'Monsters' }

export function FactionChoices({ types, selectedType, onChoose }) {
  return <div className="faction-picker" role="group" aria-label="Main faction">
    {types.map(type => <button key={type} type="button" className="ui-button faction-picker__option"
      aria-label={LABELS[type]} aria-pressed={selectedType === type}
      style={{ '--faction': `var(--${type})` }} onClick={() => onChoose(type)}>
      <GameIcon name={type} /><span>{LABELS[type]}</span>
    </button>)}
  </div>
}

export default function FactionPicker({ open, types, selectedType, onChoose, onClose, title = 'Choose your main faction' }) {
  return (
    <Sheet open={open} title={title} onClose={onClose}>
      <FactionChoices types={types} selectedType={selectedType} onChoose={onChoose} />
    </Sheet>
  )
}
