import Sheet from './Sheet'
import { GameIcon } from '../ui/GameIcon'
import './FactionPicker.css'

const LABELS = { critter: 'Critters', robot: 'Robots', dragon: 'Dragons' }

export default function FactionPicker({ open, types, selectedType, onChoose, onClose }) {
  return (
    <Sheet open={open} title="Choose your main faction" onClose={onClose}>
      <div className="faction-picker" role="group" aria-label="Main faction">
        {types.map((type) => (
          <button key={type} type="button" className="ui-button faction-picker__option"
            aria-label={LABELS[type]} aria-pressed={selectedType === type}
            style={{ '--faction': `var(--${type})` }} onClick={() => onChoose(type)}>
            <GameIcon name={type} />
            <span>{LABELS[type]}</span>
          </button>
        ))}
      </div>
    </Sheet>
  )
}
