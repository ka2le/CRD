import { getIconUrl } from '../ui/iconSources'
import { RESOLUTION_SIDES } from '../../game/tabletopResolution'

// Drives the tabletop resolution animation: DOM-only effects (pulses, flying
// icons, counter badges, banners) plus ledger updates through `update`.
// Every wait and flight scales with the live speed; cancel() stops it all.

const CANCELLED = Symbol('cancelled')
const FLIGHT_MS = 320
const OTHER = { player: 'opponent', opponent: 'player' }

function rectOf(target) {
  if (!target) return null
  return typeof target.getBoundingClientRect === 'function' ? target.getBoundingClientRect() : target
}

function centerOf(rect) {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}

function colorOf(type) {
  return type === 'neutral' ? 'var(--ttr-neutral)' : `var(--${type})`
}

function iconElement(name) {
  const icon = document.createElement('span')
  icon.className = 'g-icon'
  icon.style.setProperty('--icon', `url("${getIconUrl(name)}")`)
  return icon
}

export function createResolutionRunner({ root, fx, getSpeed, update }) {
  let cancelled = false
  const timers = new Set()
  const animations = new Set()

  const scaled = (ms) => ms / Math.max(getSpeed(), 0.25)

  function wait(ms) {
    return new Promise((resolve, reject) => {
      if (cancelled) { reject(CANCELLED); return }
      const id = window.setTimeout(() => {
        timers.delete(id)
        if (cancelled) reject(CANCELLED)
        else resolve()
      }, scaled(ms))
      timers.add(id)
    })
  }

  function set(updater) {
    if (!cancelled) update(updater)
  }

  function animate(element, keyframes, options) {
    if (!element?.animate || cancelled) return null
    const animation = element.animate(keyframes, { ...options, duration: scaled(options.duration), delay: scaled(options.delay ?? 0) })
    animations.add(animation)
    animation.finished.catch(() => {}).finally(() => animations.delete(animation))
    return animation
  }

  // ---------- table lookups ----------
  function cardElement(side, uid) {
    return document.querySelector(`.table__zone--${side} [data-card-uid="${CSS.escape(uid)}"]`)
  }

  // `count` icons of one kind on a card; the card itself stands in for any it lacks.
  function cardIcons(side, uid, alt, count = 1) {
    const card = cardElement(side, uid)
    const found = card ? [...card.querySelectorAll(`.card-visual__icon-image[alt="${alt}"]`)].map((img) => img.parentElement) : []
    return Array.from({ length: count }, (_, index) => found[index] ?? card).filter(Boolean)
  }

  function cardTypeIcon(side, uid, type) {
    const card = cardElement(side, uid)
    return card?.querySelector(`.card-visual__overlay--effect .card-visual__icon-image[alt="${type}"]`)?.parentElement ?? card
  }

  function cardEffectRow(side, uid) {
    const card = cardElement(side, uid)
    return card?.querySelector('.card-visual__overlay--effect') ?? card
  }

  function slot(side, key) {
    return root.querySelector(`[data-ttr~="${side}-${key}"]`)
  }

  // ---------- effects ----------
  function pulse(element, type = 'neutral', strength = 1.45) {
    const color = colorOf(type)
    return animate(element, [
      { transform: 'scale(1)', filter: 'drop-shadow(0 0 0 transparent)' },
      { transform: `scale(${strength})`, filter: `drop-shadow(0 0 6px ${color}) drop-shadow(0 0 2px ${color}) brightness(1.4)`, offset: 0.35 },
      { transform: 'scale(1)', filter: 'drop-shadow(0 0 0 transparent)' },
    ], { duration: 300, easing: 'ease-out' })
  }

  function glowCard(side, uid, type) {
    const card = cardElement(side, uid)
    const color = colorOf(type)
    return animate(card, [
      { filter: 'brightness(1)' },
      { filter: `brightness(1.25) drop-shadow(0 0 10px ${color})`, offset: 0.4 },
      { filter: 'brightness(1)' },
    ], { duration: 520, easing: 'ease-out' })
  }

  function bump(element) {
    return animate(element, [
      { transform: 'scale(1)' }, { transform: 'scale(1.35)', offset: 0.3 }, { transform: 'scale(1)' },
    ], { duration: 260, easing: 'ease-out' })
  }

  function fly({ from, to, icon = null, type = 'neutral', label = null, delay = 0, duration = FLIGHT_MS, className = '' }) {
    const a = rectOf(from)
    const b = rectOf(to)
    if (!a || !b || cancelled) return Promise.resolve()
    const start = centerOf(a)
    const end = centerOf(b)
    const ghost = document.createElement('span')
    ghost.className = ['ttr-ghost', className].filter(Boolean).join(' ')
    ghost.style.left = `${start.x}px`
    ghost.style.top = `${start.y}px`
    ghost.style.color = colorOf(type)
    // Lift off at the size of the icon it came from, so it reads as that icon moving.
    if (!label) ghost.style.fontSize = `${Math.round(Math.min(34, Math.max(16, a.height * 0.85)))}px`
    if (label !== null) {
      const text = document.createElement('span')
      text.textContent = label
      ghost.append(text)
    }
    if (icon) ghost.append(iconElement(icon))
    fx.append(ghost)
    const dx = end.x - start.x
    const dy = end.y - start.y
    const lift = Math.min(60, Math.hypot(dx, dy) * 0.25)
    const animation = animate(ghost, [
      { transform: 'translate(-50%, -50%) scale(0.6)', opacity: 0 },
      { transform: 'translate(-50%, -50%) scale(1.25)', opacity: 1, offset: 0.15 },
      { transform: `translate(calc(-50% + ${dx * 0.5}px), calc(-50% + ${dy * 0.5 - lift}px)) scale(1.05)`, opacity: 1, offset: 0.55 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.75)`, opacity: 0.9 },
    ], { duration, delay, easing: 'cubic-bezier(.45,0,.55,1)', fill: 'both' })
    if (!animation) { ghost.remove(); return Promise.resolve() }
    return animation.finished.then(() => {
      ghost.remove()
      if (!cancelled) bump(to)
    }, () => ghost.remove())
  }

  function badge(target, text, type) {
    const rect = rectOf(target)
    if (!rect || cancelled) return null
    const element = document.createElement('span')
    element.className = 'ttr-badge'
    element.textContent = text
    element.style.left = `${rect.right - 2}px`
    element.style.top = `${rect.top + 2}px`
    element.style.setProperty('--ttr-badge', colorOf(type))
    fx.append(element)
    animate(element, [
      { transform: 'translate(-50%, -50%) scale(0.2)', opacity: 0 },
      { transform: 'translate(-50%, -50%) scale(1.25)', opacity: 1, offset: 0.6 },
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
    ], { duration: 220, easing: 'ease-out', fill: 'both' })
    return element
  }

  // Large transient sign (=, 7+, crown) over a ledger element.
  function banner(target, build, { type = 'neutral', hold = 650, className = '' } = {}) {
    const rect = rectOf(target)
    if (!rect || cancelled) return Promise.resolve(null)
    const element = document.createElement('span')
    element.className = ['ttr-banner', className].filter(Boolean).join(' ')
    element.style.color = colorOf(type)
    const center = centerOf(rect)
    element.style.left = `${center.x}px`
    element.style.top = `${center.y}px`
    build(element)
    fx.append(element)
    const animation = animate(element, [
      { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 0 },
      { transform: 'translate(-50%, -50%) scale(1.15)', opacity: 1, offset: 0.25 },
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.8 },
      { transform: 'translate(-50%, -50%) scale(1.05)', opacity: 0 },
    ], { duration: hold, easing: 'ease-out', fill: 'both' })
    return (animation?.finished ?? Promise.resolve()).then(() => { element.remove(); return null }, () => element.remove())
  }

  function clearFx() {
    fx.replaceChildren()
  }

  function cancel() {
    cancelled = true
    timers.forEach((id) => window.clearTimeout(id))
    timers.clear()
    animations.forEach((animation) => animation.cancel())
    animations.clear()
    clearFx()
  }

  // ---------- ledger helpers ----------
  const add = (side, part, key, amount) => set((ledger) => ({ ...ledger,
    [side]: { ...ledger[side], [part]: { ...ledger[side][part], [key]: ledger[side][part][key] + amount } } }))
  const patch = (side, values) => set((ledger) => ({ ...ledger, [side]: { ...ledger[side], ...values(ledger[side]) } }))
  const focus = (side, type) => set((ledger) => ({ ...ledger, focus: side ? { side, type } : null }))
  // The row being counted is lit; the other waits dimmed.
  const setCurrent = (side) => set((ledger) => ({ ...ledger, current: side }))

  // ---------- steps ----------
  async function countStats(side, entry) {
    if (!entry.total) return
    focus(side, entry.type)
    const target = slot(side, `${entry.type}-stat`)
    const flights = []
    let index = 0
    for (const card of entry.cards) {
      glowCard(side, card.uid, entry.type)
      for (const icon of cardIcons(side, card.uid, entry.type, card.count)) {
        const delay = index++ * 50
        pulse(icon, entry.type)
        flights.push(fly({ from: icon, to: target, icon: entry.type, type: entry.type, delay })
          .then(() => add(side, 'stats', entry.type, 1)))
      }
    }
    await Promise.all(flights)
    await wait(80)
  }

  async function countPulses(side, pulsePlan) {
    if (!pulsePlan.cards.length) return
    const { type } = pulsePlan
    focus(side, type)
    const target = slot(side, `${type}-dmg`)
    const statSlot = slot(side, `${type}-stat`)
    if (!pulsePlan.stats) {
      pulsePlan.cards.forEach((card) => pulse(cardTypeIcon(side, card.uid, type), 'neutral', 1.15))
      await wait(320)
      return
    }
    const arrivals = []
    for (let firing = 0; firing < pulsePlan.stats; firing++) {
      bump(statSlot)
      for (const card of pulsePlan.cards) {
        pulse(cardTypeIcon(side, card.uid, type), type, 1.6)
        cardIcons(side, card.uid, 'damage', card.units).forEach((heart, index) => {
          arrivals.push(fly({ from: heart, to: target, icon: 'damage', type, delay: 40 + index * 40, duration: 300 })
            .then(() => add(side, 'damage', type, 1)))
        })
      }
      await wait(200)
    }
    await Promise.all(arrivals)
    await wait(80)
  }

  async function countDirect(side, attack) {
    focus(side, attack.type)
    glowCard(side, attack.uid, attack.type)
    await fly({ from: cardEffectRow(side, attack.uid), to: slot(side, `${attack.type}-dmg`), icon: 'damage',
      type: attack.type, label: String(attack.power), className: 'ttr-ghost--value' })
    add(side, 'damage', attack.type, attack.power)
    await wait(80)
  }

  // Faction by faction: its stats, then the damage they power. Neutral damage last.
  async function countHand(plan, side) {
    const sidePlan = plan[side]
    for (const entry of sidePlan.stats) {
      await countStats(side, entry)
      await countPulses(side, sidePlan.pulses.find((pulsePlan) => pulsePlan.type === entry.type))
      for (const attack of sidePlan.direct.filter((direct) => direct.type === entry.type)) await countDirect(side, attack)
    }
    for (const attack of sidePlan.direct.filter((direct) => direct.type === 'neutral')) await countDirect(side, attack)
  }

  async function showMain(plan, side) {
    focus(null)
    const sidePlan = plan[side]
    patch(side, () => ({ main: Boolean(sidePlan.mainType), base: sidePlan.base }))
    await wait(80)
    if (sidePlan.mainType) pulse(slot(side, `${sidePlan.mainType}-icon`), sidePlan.mainType, 1.7)
    bump(slot(side, 'base'))
    await wait(450)
  }

  async function perfectBalance(side, balance) {
    focus(side, 'robot')
    const marks = []
    let count = 0
    for (const card of balance.statPips) {
      for (const icon of cardIcons(side, card.uid, 'robot', card.count)) {
        pulse(icon, 'robot')
        marks.push(badge(icon, String(++count), 'robot'))
        await wait(150)
      }
    }
    count = 0
    for (const card of balance.attackUnits) {
      for (const heart of cardIcons(side, card.uid, 'damage', card.units)) {
        pulse(heart, 'robot')
        marks.push(badge(heart, String(++count), 'robot'))
        await wait(150)
      }
    }
    // As on the score card: Robot stats = Robot attacks.
    const sign = banner(slot(side, 'robot'), (element) => {
      const part = (icon) => {
        const group = document.createElement('span')
        group.className = 'ttr-banner__part'
        group.append(String(balance.count), iconElement(icon))
        return group
      }
      const equal = document.createElement('span')
      equal.className = 'ttr-banner__op'
      equal.textContent = '='
      element.append(part('robot'), equal, part('damage'))
    }, { type: 'robot', hold: 800, className: 'ttr-banner--pill' })
    await wait(420)
    await fly({ from: slot(side, 'robot'), to: slot(side, 'bonus'), icon: 'damage', type: 'robot', label: `+${balance.bonus}`, className: 'ttr-ghost--value' })
    patch(side, (current) => ({ bonus: current.bonus + balance.bonus, bonusShown: true }))
    await sign
    marks.forEach((mark) => mark?.remove())
  }

  async function overwhelming(side, plan) {
    const ability = plan[side].overwhelming
    focus(side, 'dragon')
    ability.uids.forEach((uid) => glowCard(side, uid, 'dragon'))
    const sign = banner(slot(side, 'base'), (element) => {
      element.append(iconElement('damage'), `${ability.at}+`)
    }, { type: 'dragon', hold: 900, className: 'ttr-banner--pill' })
    await wait(520)
    await fly({ from: slot(side, 'base'), to: slot(side, 'dragon-stat'), icon: 'dragon', type: 'dragon', label: '+1', className: 'ttr-ghost--value', duration: 420 })
    add(side, 'stats', 'dragon', 1)
    await sign
    const arrivals = []
    for (const entry of ability.deltas) {
      if (entry.type === 'dragon') pulse(cardTypeIcon(side, entry.uid, 'dragon'), 'dragon', 1.6)
      const sources = entry.type === 'dragon' ? cardIcons(side, entry.uid, 'damage', entry.delta) : [cardEffectRow(side, entry.uid)]
      const value = entry.type === 'dragon' ? 1 : entry.delta
      sources.forEach((source, index) => {
        arrivals.push(fly({ from: source, to: slot(side, `${entry.type}-dmg`), icon: 'damage', type: entry.type,
          label: value > 1 ? String(value) : null, delay: index * 45, duration: 340 }).then(() => {
          add(side, 'damage', entry.type, value)
          patch(side, (current) => ({ base: current.base + value }))
          bump(slot(side, 'base'))
        }))
      })
    }
    await Promise.all(arrivals)
    await wait(200)
  }

  async function abilities(plan, side) {
    const sidePlan = plan[side]
    if (sidePlan.balance) await perfectBalance(side, sidePlan.balance)
    if (sidePlan.overwhelming) await overwhelming(side, plan)
  }

  async function shields(plan, side) {
    const sidePlan = plan[side]
    const { cards, cost } = sidePlan.shields
    if (!cards.length) return
    focus(side, sidePlan.mainType)
    patch(side, () => ({ shieldShown: true }))
    const enemy = OTHER[side]
    for (const uid of cards) {
      const icon = cardIcons(enemy, uid, 'shield', 1)[0]
      pulse(icon, 'shield', 1.6)
      await fly({ from: icon, to: slot(side, 'shield'), icon: 'shield', type: 'shield', label: `−${cost}`, className: 'ttr-ghost--value' })
      patch(side, (current) => {
        const cap = plan.bonusFirst ? current.base + current.bonus : current.base
        return { blocked: Math.min(cap, current.blocked + cost) }
      })
      await wait(140)
    }
  }

  async function thresholdBonus(plan, side) {
    const bonus = plan[side].thresholdBonus
    if (!bonus) return
    focus(side, plan[side].mainType)
    await banner(slot(side, 'total'), (element) => {
      element.textContent = `+${bonus}`
      element.append(iconElement('star'))
    }, { type: plan[side].mainType ?? 'neutral', hold: 600, className: 'ttr-banner--pill' })
    patch(side, (current) => ({ bonus: current.bonus + bonus, bonusShown: true }))
    await wait(160)
  }

  async function compare(plan) {
    focus(null)
    setCurrent(null)
    set((ledger) => ({ ...ledger, stage: 'compare' }))
    for (const side of RESOLUTION_SIDES) bump(slot(side, 'total'))
    await wait(420)
    if (plan.tiebreak) {
      const side = plan.tiebreak
      set((ledger) => ({ ...ledger, tiebreak: side }))
      await banner(slot(side, 'critter-icon'), (element) => {
        element.append(iconElement('critter'))
      }, { type: 'critter', hold: 900, className: 'ttr-banner--crown' })
    }
    set((ledger) => ({ ...ledger, stage: 'done' }))
  }

  async function run(plan) {
    await wait(350)
    // One player's whole count, then the other's, then the comparison.
    for (const side of RESOLUTION_SIDES) {
      setCurrent(side)
      await wait(150)
      await countHand(plan, side)
      await showMain(plan, side)
      if (plan.bonusFirst) {
        await abilities(plan, side)
        await shields(plan, side)
      } else {
        await shields(plan, side)
        await thresholdBonus(plan, side)
      }
      focus(null)
      await wait(250)
    }
    await compare(plan)
    await wait(900)
  }

  return {
    // Resolves true when the sequence completed, false when cancelled.
    start: (plan) => run(plan).then(() => !cancelled, (error) => {
      if (error === CANCELLED) return false
      // A broken effect must never hold back the result.
      console.error(error)
      return true
    }),
    cancel,
  }
}
