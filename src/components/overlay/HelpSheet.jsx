import './HelpSheet.css'
import Sheet from './Sheet'
import { GameIcon, SvgIcon } from '../ui/GameIcon'

const ROUNDS = [1, 2, 3, 4, 5, 6]
const LANES = [
  { key: 'critter', every: 1, dmg: 1 },
  { key: 'robot', every: 2, dmg: 2 },
  { key: 'dragon', every: 3, dmg: 3 },
]

export default function HelpSheet({ open, onClose }) {
  return (
    <Sheet open={open} onClose={onClose} title={<SvgIcon name="help" />}>
      <div className="help">
        <section className="help__block">
          <div className="help__timeline">
            <span />
            {ROUNDS.map((round) => <span key={round} className="help__round">{round}</span>)}
            <span className="help__round"><GameIcon name="damage" /></span>
            {LANES.map((lane) => (
              <div key={lane.key} className={`help__lane help__lane--${lane.key}`}>
                <span className="help__lane-icon"><GameIcon name={lane.key} /></span>
                {ROUNDS.map((round) => (
                  <span key={round} className={['help__tick', round % lane.every === 0 ? 'help__tick--on' : ''].filter(Boolean).join(' ')} />
                ))}
                <span className="help__lane-dmg">{lane.dmg}×</span>
              </div>
            ))}
          </div>
          <p className="help__caption">Attacks fire on their rounds and hit for damage × your matching stats.</p>
        </section>

        <section className="help__block help__equation">
          <span className="help__chip help__chip--critter"><GameIcon name="critter" /><GameIcon name="critter" /></span>
          <span className="help__op">+</span>
          <span className="help__chip help__chip--critter"><GameIcon name="critter" /> × <GameIcon name="damage" /></span>
          <span className="help__op">=</span>
          <span className="help__chip help__chip--damage">2 <GameIcon name="damage" /></span>
        </section>

        <section className="help__block help__facts">
          <div className="help__fact">
            <span className="help__chip help__chip--shield"><GameIcon name="shield" /></span>
            <span>Blocks damage on the round it fires.</span>
          </div>
          <div className="help__fact">
            <span className="help__chip help__chip--damage">21 <GameIcon name="damage" /></span>
            <span>Taken = defeat. Both at once: more damage dealt wins.</span>
          </div>
          <div className="help__fact">
            <span className="help__chip help__chip--special"><GameIcon name="star" /></span>
            <span>Glowing specials can be used before the battle.</span>
          </div>
          <div className="help__fact">
            <span className="help__chip"><GameIcon name="draw" /></span>
            <span>Draft: pick 1 of 5, opponent picks 1, the rest are discarded. Five packs.</span>
          </div>
          <div className="help__fact">
            <span className="help__chip"><GameIcon name="redraw" /></span>
            <span>Discard mode: five cards, two redraws.</span>
          </div>
          <div className="help__fact help__fact--tip">
            <span className="help__chip"><SvgIcon name="eye" /></span>
            <span>Hold or right-click any card to inspect it.</span>
          </div>
        </section>
      </div>
    </Sheet>
  )
}
