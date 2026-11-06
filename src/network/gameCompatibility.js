// The last published fingerprint included presentation/network code. Its rules
// are unchanged; preserve these saved games while moving to a rules-only hash.
export const LEGACY_GAME_VERSION = '1b847cb28dc1175c'
// The offline/same-screen update changes presentation and turn ownership only.
// Preserve the preceding published and local fingerprints without redealing.
const PRE_LOCAL_PLAY_VERSIONS = ['63f6f86971550562', '52b42449457db8ef']
export function compatibleGameVersion(version, current = import.meta.env.CRD_GAME_VERSION) {
  const roomSuffix = current?.endsWith(':rooms-2') ? ':rooms-2' : ''
  return version === current || version === LEGACY_GAME_VERSION
    || PRE_LOCAL_PLAY_VERSIONS.some((previous) => version === `${previous}${roomSuffix}`)
}
