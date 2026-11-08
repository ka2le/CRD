// The last published fingerprint included presentation/network code. Its rules
// are unchanged; preserve these saved games while moving to a rules-only hash.
export const LEGACY_GAME_VERSION = '1b847cb28dc1175c'
// The offline/same-screen update changes presentation and turn ownership only.
// Preserve the preceding published and local fingerprints without redealing.
// Resolution animation repairs also leave all game rules and saved state intact.
// The secret-opening discard revision preserves other modes; obsolete secret
// saves are checked separately because their discarded cards were not retained.
const PRE_LOCAL_PLAY_VERSIONS = ['831d121699169083', '45ea0b381c18b467', '63f6f86971550562', '52b42449457db8ef', 'c2f132f0bf12af94', '59039b4d099956ea', 'd8d3e4564e779d5b']
export function compatibleGameVersion(version, current = import.meta.env.CRD_GAME_VERSION) {
  const roomSuffix = current?.endsWith(':rooms-2') ? ':rooms-2' : ''
  return version === current || version === LEGACY_GAME_VERSION
    || PRE_LOCAL_PLAY_VERSIONS.some((previous) => version === `${previous}${roomSuffix}`)
}
