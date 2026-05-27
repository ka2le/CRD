export const STAT_ICONS = {
  robot: 'https://ka2le.github.io/chatgpt-apps3/images/mp/robot_sharp.png',
  critter: 'https://ka2le.github.io/chatgpt-apps3/images/mp/rabbit.png',
  dragon: 'https://ka2le.github.io/chatgpt-apps3/images/mp/dragon.png',
}

export const DISPLAY_ICONS = {
  dmg: 'https://ka2le.github.io/chatgpt-apps3/images/mp/suit_hearts_broken.png',
  cd: 'https://ka2le.github.io/chatgpt-apps3/images/mp/hourglass.png',
  shield: 'https://ka2le.github.io/chatgpt-apps3/images/mp/shield.png',
  cardBackMark: 'CRD',
}

export function getStatIcon(stat) {
  return STAT_ICONS[stat] ?? null
}

export function getEffectIcon(type) {
  if (type && STAT_ICONS[type]) return STAT_ICONS[type]
  return DISPLAY_ICONS[type] ?? DISPLAY_ICONS.dmg
}
