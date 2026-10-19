import { getImageUrl } from '../card/imageAssets'

const ICON_BASE = 'https://ka2le.github.io/chatgpt-apps3/images/mp/'

export const ICON_SOURCES = {
  critter: `${ICON_BASE}rabbit.png`,
  robot: `${ICON_BASE}robot_sharp.png`,
  dragon: `${ICON_BASE}dragon.png`,
  damage: `${ICON_BASE}suit_hearts_broken.png`,
  cd: `${ICON_BASE}hourglass.png`,
  shield: `${ICON_BASE}shield.png`,
  draw: `${ICON_BASE}card_add.png`,
  redraw: `${ICON_BASE}extra_icons/arrow_rotate.png`,
  copy: `${ICON_BASE}cards_fan_outline.png`,
  recycle: `${ICON_BASE}reuse_card.png`,
  fast: `${ICON_BASE}fastforward.png`,
  star: `${ICON_BASE}star.png`,
  arrow: `${ICON_BASE}arrow2.png`,
}

export const CLASS_KEYS = ['critter', 'robot', 'dragon']

export function getIconUrl(name) {
  return getImageUrl(ICON_SOURCES[name])
}

