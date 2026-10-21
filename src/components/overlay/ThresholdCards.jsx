import './ThresholdCards.css'
import { GameIcon } from '../ui/GameIcon'
import { ShieldTab } from './AbilityCards'
import { TABLETOP_THRESHOLDS, TABLETOP_SHIELD_COST } from '../../game/tabletop'

// Threshold score cards for the tabletop battle mode (view only).
// One threshold per class, read as two columns: power requirement | bonus.
// Values come from the shared scorer. Shield penalty per enemy shield: −2 / −1 / 0.
const THRESHOLDS = Object.entries(TABLETOP_THRESHOLDS).map(([cls, { at, bonus }]) => ({
  cls, short: cls[0], at: `${at}+`, bonus,
  shield: TABLETOP_SHIELD_COST[cls] ? `−${TABLETOP_SHIELD_COST[cls]}` : '0',
}))

// n damage icons, 1–3 per row (6 → 3×2).
function Hearts({ count }) {
  return (
    <span className="th-hearts" style={{ '--cols': Math.min(count, 3) }} aria-label={`+${count}`}>
      {Array.from({ length: count }, (_, index) => <GameIcon key={index} name="damage" />)}
    </span>
  )
}

function Columns({ at, children }) {
  return (
    <div className="th-two">
      <span className="th-req">{at}</span>
      <span className="th-res">{children}</span>
    </div>
  )
}

// Classic + Tab, class icon on top, bonus written as +N.
export function ThresholdLedgerCard() {
  return (
    <div className="sc-card ab-ledger th-card" aria-label="Score card: thresholds">
      {THRESHOLDS.map(({ cls, at, bonus, shield }) => (
        <div key={cls} className="ab-ledger__row">
          <GameIcon name={cls} className={`th-icon sc-${cls}`} />
          <Columns at={at}>
            <span className="th-num"><b>+{bonus}</b><GameIcon name="damage" /></span>
          </Columns>
          <ShieldTab value={shield} />
        </div>
      ))}
    </div>
  )
}

// Bands + Tab, class icon on top, bonus drawn as hearts.
export function ThresholdBandsCard() {
  return (
    <div className="sc-card ab-bands th-card" aria-label="Score card: threshold bands">
      {THRESHOLDS.map(({ cls, short, at, bonus, shield }) => (
        <div key={cls} className={`ab-band ab-band--${short}`}>
          <GameIcon name={cls} className="ab-band__mark" />
          <GameIcon name={cls} className="th-icon th-icon--bone" />
          <Columns at={at}>
            <span className="th-plus">+</span>
            <Hearts count={bonus} />
          </Columns>
          <ShieldTab value={shield} />
        </div>
      ))}
    </div>
  )
}
