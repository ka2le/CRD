// The last published fingerprint included presentation/network code. Its rules
// are unchanged; preserve these saved games while moving to a rules-only hash.
export const LEGACY_GAME_VERSION = '1b847cb28dc1175c'
export function compatibleGameVersion(version, current = import.meta.env.CRD_GAME_VERSION) {
  return version === current || version === LEGACY_GAME_VERSION
}
