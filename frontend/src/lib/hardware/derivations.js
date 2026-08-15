// Spec 085 — the derivation-path schemes the add-account flow can page through (FR-004).
// Two Ethereum conventions cover effectively every Ledger/Trezor account in the wild:
//
//   - 'live'  m/44'/60'/i'/0/0 — the account-per-hardened-index scheme Ledger Live uses.
//   - 'bip44' m/44'/60'/0'/0/i — the single-account address-index scheme (Trezor, MEW, MyCrypto,
//              and pre-Live Ledger tooling).
//
// Which one a member's funds sit on depends on which tool originally created the account, so the
// picker lets them switch schemes rather than guessing. Paths are data here — no key material.

export const PATH_SCHEMES = Object.freeze([
  Object.freeze({ id: 'live', label: 'Ledger Live', pathFor: (i) => `m/44'/60'/${i}'/0/0` }),
  Object.freeze({ id: 'bip44', label: 'BIP-44 standard', pathFor: (i) => `m/44'/60'/0'/0/${i}` }),
])

/** The scheme a vendor's own tooling uses by default — the flow starts there. */
export function defaultSchemeFor(vendor) {
  return vendor === 'ledger' ? 'live' : 'bip44'
}

export function schemeById(id) {
  return PATH_SCHEMES.find((s) => s.id === id) || null
}

/**
 * The derivation paths for one page of the account picker.
 * @returns {Array<{ index: number, path: string }>}
 */
export function pagePaths(schemeId, offset = 0, count = 5) {
  const scheme = schemeById(schemeId)
  if (!scheme) return []
  const out = []
  for (let i = 0; i < count; i += 1) {
    const index = offset + i
    out.push({ index, path: scheme.pathFor(index) })
  }
  return out
}
