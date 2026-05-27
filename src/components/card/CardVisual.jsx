import './CardVisual.css'
import { DISPLAY_ICONS, getStatIcon } from './cardData'

function IconToken({ src, alt }) {
  return (
    <span className="card-visual__icon-token">
      <img src={src} alt={alt} className="card-visual__icon-image" />
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
    if (effect.dmg <= 3) {
      for (let i = 0; i < effect.dmg; i += 1) {
        tokens.push({ type: 'icon', value: DISPLAY_ICONS.dmg, alt: 'damage' })
      }
    } else {
      tokens.push({ type: 'text', value: String(effect.dmg) })
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
  const tokens = card.customEffect?.length ? getCustomEffectTokens(card) : getEffectTokens(card)

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

function CardCooldown({ card }) {
  if (typeof card.cd !== 'number' || card.cd <= 0) return null

  return (
    <div className="card-visual__overlay card-visual__overlay--cooldown">
      <div className="card-visual__cooldown-column">
        {Array.from({ length: card.cd }).map((_, index) => (
          <IconToken key={`cd-${index}`} src={DISPLAY_ICONS.cd} alt="cooldown" />
        ))}
      </div>
    </div>
  )
}

export default function CardVisual({ card, hidden = false }) {
  const image = card.images?.[card.imageIndex ?? 0] ?? card.images?.[0]

  return (
    <div className="card-visual">
      <div className="card-visual__art-shell">
        {hidden ? (
          <div className="card-visual__back-face">
            <div className="card-visual__back-mark">{DISPLAY_ICONS.cardBackMark}</div>
          </div>
        ) : (
          <>
            <img src={image} alt="" className="card-visual__blur" />
            <img src={image} alt={card.name} className="card-visual__art" />
            {card.copyOverlayImage ? (
              <img src={card.copyOverlayImage} alt="" className="card-visual__copy-overlay" />
            ) : null}
            {card.type === 'stat' ? <CardStatColumn card={card} /> : null}
            {card.type === 'action' ? <CardEffectRow card={card} /> : null}
            <CardCooldown card={card} />
          </>
        )}
      </div>
    </div>
  )
}
