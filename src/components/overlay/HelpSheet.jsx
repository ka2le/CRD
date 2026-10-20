import './HelpSheet.css'
import Sheet from './Sheet'
import { GameIcon, SvgIcon } from '../ui/GameIcon'

const ROUNDS = [1, 2, 3, 4, 5, 6]
const LANES = [
  { key: 'critter', every: 1, dmg: 1 },
  { key: 'robot', every: 2, dmg: 2 },
  { key: 'dragon', every: 3, dmg: 3 },
]

export default function HelpSheet({ open, onClose, tabletop = false }) {
  return (
    <Sheet open={open} onClose={onClose} title={<SvgIcon name="help" />}>
      <div className="help">
        {tabletop ? <section className="help__block help__facts">
          <div className="help__fact"><GameIcon name="damage" /><span>Each ordinary attack gives 2 power per matching stat. Add all attacks.</span></div>
          <div className="help__fact"><GameIcon name="star" /><span>Your largest class contribution is your main damage type. If tied, tap a highlighted card before battle. Neutral-only power uses Robot.</span></div>
          <div className="help__fact"><GameIcon name="shield" /><span>Each enemy shield removes 2 Critter power, 1 Robot power or 0 Dragon power. Power stops at zero.</span></div>
          {tabletop === 'abilities' ? <>
            <div className="help__fact"><GameIcon name="critter" /><span>Adapt: one Critter stat card becomes a Critter attack card, used automatically when it scores more.</span></div>
            <div className="help__fact"><GameIcon name="robot" /><span>Perfect Balance: as many Robot stats as Robot attacks (at least one each) adds +3 after shields.</span></div>
            <div className="help__fact"><GameIcon name="dragon" /><span>Overwhelming: Dragon power of 14 or more gains one extra Dragon stat before shields.</span></div>
            <div className="help__fact"><GameIcon name="damage" /><span>Power − shields + Perfect Balance = score. Higher wins; equal scores tie.</span></div>
            <div className="help__fact"><GameIcon name="star" /><span>Chameleon lets you choose any main faction: tap it, then a faction icon. Ultimates, including Devour: 4 per matching stat. Bite: 2.</span></div>
          </> : <>
            <div className="help__fact"><GameIcon name="critter" /><span>After shields, your main faction earns one bonus: Critter +1 at 2 power, Robot +3 at 8, Dragon +6 at 14.</span></div>
            <div className="help__fact"><GameIcon name="damage" /><span>Base − shields + bonus = score. Higher wins; equal scores tie.</span></div>
            <div className="help__fact"><GameIcon name="arrow" className="g-icon--up" /><span>Shortcut grants your main faction bonus even below its threshold, with positive power. Chameleon lets you choose any main faction: tap it, then a faction icon.</span></div>
            <div className="help__fact"><GameIcon name="star" /><span>Ultimates, including Devour: 4 per matching stat. Bite: 2. The 2× card doubles your main faction bonus after shields; copies stack. Devour also offers a Dragon-type option. Hold a card for its full rule.</span></div>
          </>}
        </section> : <>
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

        </>}
        <section className="help__block help__facts">
          {!tabletop ? <>
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
          </> : <div className="help__fact"><GameIcon name="star" /><span>Use specials before battle, or press Battle to finish preparation.</span></div>}
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
