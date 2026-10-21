import './CardVisual.css'
import { DISPLAY_ICONS, getStatIcon } from './cardData'
import { getImageUrl } from './imageAssets'

function IconToken({ src, alt, className = '' }) {
  // className may carry modifiers such as --up (rotated arrow).
  return (
    <span className={['card-visual__icon-token', className].filter(Boolean).join(' ')}>
      <img src={getImageUrl(src)} alt={alt} className="card-visual__icon-image" />
    </span>
  )
}

function TextToken({ value }) {
  return <span className="card-visual__text-token">{value}</span>
}

function renderToken(token, index) {
  if (token.type === 'line-break') {
    return <span key={`break-${index}`} className="card-visual__line-break" />
  }

  if (token.type === 'icon') {
    return <IconToken key={`${token.alt}-${index}`} src={token.value} alt={token.alt} className={token.className} />
  }

  return <TextToken key={`${token.value}-${index}`} value={token.value} />
}

function getCustomEffectTokens(card) {
  const customEffect = card.customEffect ?? []

  return customEffect.map((token, index) => {
    if (token === '<br>') {
      return { type: 'line-break', value: token, key: `break-${index}` }
    }

    if (typeof token === 'string' && token.startsWith('http')) {
      return { type: 'icon', value: token, alt: `custom-${index}` }
    }

    return { type: 'text', value: String(token) }
  })
}

function getEffectTokens(card) {
  const effect = card.effect ?? {}
  const tokens = []

  if (effect.dmgType) {
    const icon = getStatIcon(effect.dmgType)
    if (icon) tokens.push({ type: 'icon', value: icon, alt: effect.dmgType })
    tokens.push({ type: 'text', value: '*' })
  }

  if (effect.dmg) {
    for (let i = 0; i < effect.dmg; i += 1) {
      tokens.push({ type: 'icon', value: DISPLAY_ICONS.dmg, alt: 'damage' })
    }
  }

  if (effect.shield) {
    if (effect.shield <= 3) {
      for (let i = 0; i < effect.shield; i += 1) {
        tokens.push({ type: 'icon', value: DISPLAY_ICONS.shield, alt: 'shield' })
      }
    } else {
      tokens.push({ type: 'text', value: String(effect.shield) })
      tokens.push({ type: 'icon', value: DISPLAY_ICONS.shield, alt: 'shield' })
    }
  }

  return tokens
}

// Long formula cards (Critter * Robot * Dragon, Critter + Robot + Dragon) get a
// compact single-line row with slightly smaller icons instead of wrapping.
const COMPACT_EFFECT_IDS = new Set(['one_off_each', 'any_off_each'])

function CardEffectRow({ card }) {
  const hasStructuredEffect = Boolean(card.effect?.dmg || card.effect?.shield)
  let tokens = hasStructuredEffect ? getEffectTokens(card) : getCustomEffectTokens(card)
  if (card.tabletop && card.id === 'double_dmg') {
    tokens = [
      { type: 'text', value: '2*' }, { type: 'icon', value: DISPLAY_ICONS.star, alt: 'faction bonus' },
    ]
  }
  if (card.tabletop && card.id === 'shield_is_dmg') {
    tokens = [{ type: 'icon', value: DISPLAY_ICONS.shield, alt: 'own shields' }, { type: 'text', value: '=' }, { type: 'icon', value: DISPLAY_ICONS.dmg, alt: 'power' }]
  }
  if (card.tabletop && card.id === 'shortcut') {
    // Two up arrows: count the bonus two tiers higher.
    const up = { type: 'icon', value: DISPLAY_ICONS.arrow, alt: 'bonus tier up', className: 'card-visual__icon-token--up' }
    tokens = [up, { ...up }]
  }
  if (card.tabletop && card.id === 'chameleon') {
    tokens = ['critter', 'robot', 'dragon'].flatMap((type, index) => [
      ...(index ? [{ type: 'text', value: '/' }] : []),
      { type: 'icon', value: getStatIcon(type), alt: `choose ${type}` },
    ])
  }

  const compact = COMPACT_EFFECT_IDS.has(card.id)
  if (compact) tokens = tokens.filter((token) => token.type !== 'line-break')

  return (
    <div className={['card-visual__overlay', 'card-visual__overlay--effect', compact ? 'card-visual__overlay--compact' : ''].filter(Boolean).join(' ')}>
      <div className="card-visual__token-row">
        {tokens.map((token, index) => renderToken(token, index))}
      </div>
    </div>
  )
}

function CardStatColumn({ card }) {
  return (
    <div className="card-visual__overlay card-visual__overlay--stat">
      <div className="card-visual__stat-column">
        {(card.stats ?? []).map((stat, index) => {
          const icon = getStatIcon(stat)
          if (!icon) return null
          return <IconToken key={`${stat}-${index}`} src={icon} alt={stat} />
        })}
      </div>
    </div>
  )
}

function CardCooldown({ card, charge = null }) {
  if (typeof card.cd !== 'number' || card.cd <= 0) return null
  const charging = typeof charge === 'number'

  return (
    <div className="card-visual__overlay card-visual__overlay--cooldown">
      <div className={['card-visual__cooldown-column', charging ? 'card-visual__cooldown-column--charging' : ''].filter(Boolean).join(' ')}>
        {Array.from({ length: card.cd }).map((_, index) => {
          // Hourglasses fill from the bottom up, matching how the column reads.
          const litFromBottom = card.cd - index <= charge
          const stateClass = !charging ? '' : (litFromBottom ? 'card-visual__icon-token--lit' : 'card-visual__icon-token--unlit')
          return <IconToken key={`cd-${index}`} src={DISPLAY_ICONS.cd} alt="cooldown" className={stateClass} />
        })}
      </div>
    </div>
  )
}

// Copy card "photocopy glitch": the copy source's art bleeds through in a few
// misfed scan bands (each nudged sideways) on top of the faint full overlay.
// Bands are in card units (635 x 888). The tall band at y=262 sits over the
// sheep's eyes so it reads clearly as the Copy card underneath.
const COPY_GLITCH_W = 635
const COPY_GLITCH_H = 888
const COPY_GLITCH_BANDS = [
  [0, 118, 635, 9],
  [140, 196, 500, 30],
  [0, 226, 635, 4],
  [40, 262, 595, 66],
  [0, 470, 280, 6],
  [0, 560, 635, 18],
  [330, 588, 305, 5],
  [0, 700, 520, 34],
  [120, 812, 515, 8],
]

function copyGlitchMask(bands) {
  const rects = bands.map(([x, y, w, h]) => `<rect x='${x}' y='${y}' width='${w}' height='${h}' fill='white'/>`).join('')
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${COPY_GLITCH_W} ${COPY_GLITCH_H}' preserveAspectRatio='none'>${rects}</svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

// Alternate bands shift right / left, like a misfeeding scanner.
const COPY_GLITCH_MASKS = [
  copyGlitchMask(COPY_GLITCH_BANDS.filter((_, index) => index % 2 === 0)),
  copyGlitchMask(COPY_GLITCH_BANDS.filter((_, index) => index % 2 === 1)),
]

function CopyGlitch({ src }) {
  return (
    <>
      <img src={src} alt="" className="card-visual__copy-overlay" draggable="false" />
      {COPY_GLITCH_MASKS.map((mask, index) => (
        <img
          key={`copy-band-${index}`}
          src={src}
          alt=""
          draggable="false"
          className={`card-visual__copy-overlay card-visual__copy-band card-visual__copy-band--${index % 2 === 0 ? 'right' : 'left'}`}
          style={{ WebkitMaskImage: mask, maskImage: mask }}
        />
      ))}
      <svg
        className="card-visual__copy-rim"
        viewBox={`0 0 ${COPY_GLITCH_W} ${COPY_GLITCH_H}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {COPY_GLITCH_BANDS.map(([x, y, w, h], index) => (
          <rect key={`rim-${index}`} x={x} y={y} width={w} height={h} />
        ))}
      </svg>
    </>
  )
}

// The printed card back (the "backside" card art in data/cards.json).
const CARD_BACK_SOURCE = 'https://cdn.midjourney.com/210b3cd1-dec8-453e-8d1a-d967cea6e283/0_0.png'
const CARD_BACK_URL = getImageUrl(CARD_BACK_SOURCE)

export function CardBack() {
  return (
    <div className="card-visual__back">
      <img src={CARD_BACK_URL} alt="" className="card-visual__back-image" draggable="false" />
    </div>
  )
}

export default function CardVisual({ card, hidden = false, charge = null }) {
  const image = getImageUrl(card.images?.[card.imageIndex ?? 0] ?? card.images?.[0])

  if (hidden) {
    return (
      <div className="card-visual">
        <CardBack />
      </div>
    )
  }

  return (
    <div className="card-visual">
      <div className="card-visual__art-shell">
        {image ? (
          <>
            <img src={image} alt="" className="card-visual__blur" draggable="false" />
            <img src={image} alt={card.name} className="card-visual__art" draggable="false" />
          </>
        ) : <div className="card-visual__placeholder" />}
        {card.copyOverlayImage ? (
          <CopyGlitch src={getImageUrl(card.copyOverlayImage)} />
        ) : null}
        <div className="card-visual__shade" />
        {card.type === 'stat' ? <CardStatColumn card={card} /> : null}
        {card.type === 'action' ? <CardEffectRow card={card} /> : null}
        {!card.tabletop ? <CardCooldown card={card} charge={charge} /> : null}
      </div>
    </div>
  )
}
