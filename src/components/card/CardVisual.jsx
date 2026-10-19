import './CardVisual.css'
import { DISPLAY_ICONS, STAT_ICONS, getStatIcon } from './cardData'
import { getImageUrl } from './imageAssets'

function IconToken({ src, alt, className = '' }) {
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
    return <IconToken key={`${token.alt}-${index}`} src={token.value} alt={token.alt} />
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
    tokens.push({ type: 'text', value: '×' })
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

function CardEffectRow({ card }) {
  const hasStructuredEffect = Boolean(card.effect?.dmg || card.effect?.shield)
  let tokens = hasStructuredEffect ? getEffectTokens(card) : getCustomEffectTokens(card)
  if (card.tabletop && card.id === 'double_dmg') {
    tokens = [
      { type: 'text', value: '2×' }, { type: 'icon', value: DISPLAY_ICONS.star, alt: 'faction bonus' },
    ]
  }
  if (card.tabletop && card.id === 'shield_is_dmg') {
    tokens = [{ type: 'icon', value: DISPLAY_ICONS.shield, alt: 'own shields' }, { type: 'text', value: '=' }, { type: 'icon', value: DISPLAY_ICONS.dmg, alt: 'power' }]
  }
  if (card.tabletop && card.id === 'shortcut') {
    tokens = [{ type: 'icon', value: DISPLAY_ICONS.arrow, alt: 'next tier' }, { type: 'icon', value: DISPLAY_ICONS.star, alt: 'faction bonus' }]
  }
  if (card.tabletop && card.id === 'chameleon') {
    tokens = ['critter', 'robot', 'dragon'].flatMap((type, index) => [
      ...(index ? [{ type: 'text', value: '/' }] : []),
      { type: 'icon', value: getStatIcon(type), alt: `choose ${type}` },
    ])
  }

  return (
    <div className="card-visual__overlay card-visual__overlay--effect">
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

export function CardBack() {
  return (
    <div className="card-visual__back-face">
      <div className="card-visual__back-ring">
        <img src={STAT_ICONS.critter} alt="" className="card-visual__back-icon card-visual__back-icon--critter" />
        <img src={STAT_ICONS.robot} alt="" className="card-visual__back-icon card-visual__back-icon--robot" />
        <img src={STAT_ICONS.dragon} alt="" className="card-visual__back-icon card-visual__back-icon--dragon" />
      </div>
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
          <img src={getImageUrl(card.copyOverlayImage)} alt="" className="card-visual__copy-overlay" draggable="false" />
        ) : null}
        <div className="card-visual__shade" />
        {card.type === 'stat' ? <CardStatColumn card={card} /> : null}
        {card.type === 'action' ? <CardEffectRow card={card} /> : null}
        {!card.tabletop ? <CardCooldown card={card} charge={charge} /> : null}
      </div>
    </div>
  )
}
