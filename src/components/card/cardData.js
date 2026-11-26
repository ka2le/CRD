import { getImageUrl } from './imageAssets'
import { ICON_SOURCES, CLASS_KEYS } from '../ui/iconSources'

const localIcons = (icons) => Object.fromEntries(
  Object.entries(icons).map(([key, source]) => [key, getImageUrl(source)]),
)

export const STAT_ICONS = localIcons(Object.fromEntries(CLASS_KEYS.map(key => [key, ICON_SOURCES[key]])))

export const DISPLAY_ICONS = {
  ...localIcons({
    dmg: ICON_SOURCES.damage,
    cd: ICON_SOURCES.cd,
    shield: ICON_SOURCES.shield,
    star: ICON_SOURCES.star,
    arrow: ICON_SOURCES.arrow,
  }),
  cardBackMark: 'CRD',
}

export function getStatIcon(stat) {
  return STAT_ICONS[stat] ?? null
}

export function getEffectIcon(type) {
  if (type && STAT_ICONS[type]) return STAT_ICONS[type]
  return DISPLAY_ICONS[type] ?? DISPLAY_ICONS.dmg
}
