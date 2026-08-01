/**
 * The slug helper is a TWIN of the contract's name folding — this test is the proof.
 *
 * `appSlug()` turns an on-chain registry name into the `/apps/:slug` URL segment, and
 * `fetchAppBySlug()` turns it back into a record. The contract folds names with `_nameKey`
 * (ASCII case, collapsed space runs, trimmed) to decide which names are THE SAME LISTING. If the JS
 * folding and the Solidity folding ever disagree, one of two things happens, and both are bad:
 *
 *   - two names the CONTRACT considers one listing produce different slugs, so a valid launch URL
 *     resolves to nothing; or
 *   - two names the CONTRACT considers DIFFERENT listings produce the same slug, so a launch URL
 *     silently resolves to the wrong app — different vendor, different package, same URL. That is a
 *     supply-chain failure wearing a routing bug's clothes.
 *
 * The expectations below are not hand-written guesses. They are the recorded behaviour of the real
 * `MiniAppRegistry` on a local chain, probed through `idByName` (see the regeneration note at the
 * bottom). `Token Mint` vs `Token-Mint` is the case that matters most: the contract treats those as
 * two distinct listings, so a naive slugifier — which would map both to `token-mint` — would be
 * exactly the collision described above.
 */
import { describe, it, expect, vi } from 'vitest'

// registryClient reaches config/contracts -> config/tenant (a Vite virtual module) and the RPC
// layer. None of that participates in pure name folding, so it is stubbed to keep this a unit test.
vi.mock('../../config/contracts', () => ({ getContractAddressForChain: vi.fn(() => '') }))
vi.mock('../../config/networks', () => ({ miniAppChainId: vi.fn(() => 137) }))
vi.mock('../../utils/rpcProvider', () => ({ getReadProvider: vi.fn(() => ({})) }))

const { appSlug } = await import('../../lib/miniapps/registryClient')

const CANONICAL = 'Token Mint'

/** Names the CONTRACT resolves to the same listing as CANONICAL (probed via idByName). */
const SAME_LISTING = [
  'Token Mint',
  'token mint',
  'TOKEN MINT',
  '  Token Mint',
  'Token Mint  ',
  'Token   Mint',
  '  token   MINT  ',
]

/** Names the CONTRACT treats as DIFFERENT listings (idByName returned 0, and each was registrable). */
const DIFFERENT_LISTING = [
  'TokenMint',
  'Token-Mint',
  'Token  -  Mint',
  'Tokén Mint',
  'Token Mint 2',
  'token mint2',
]

describe('appSlug mirrors the contract name folding', () => {
  it('gives every same-listing spelling the identical slug', () => {
    const canonicalSlug = appSlug(CANONICAL)
    expect(canonicalSlug).toBeTruthy()
    for (const name of SAME_LISTING) {
      expect(appSlug(name), `"${name}" is the same on-chain listing as "${CANONICAL}"`).toBe(
        canonicalSlug,
      )
    }
  })

  it('never gives a different on-chain listing the canonical slug', () => {
    const canonicalSlug = appSlug(CANONICAL)
    for (const name of DIFFERENT_LISTING) {
      const slug = appSlug(name)
      // null is a fine answer (the name simply has no usable URL form) — silently COLLIDING is not.
      expect(slug, `"${name}" is a DIFFERENT listing and must not share the canonical slug`).not.toBe(
        canonicalSlug,
      )
    }
  })

  it('keeps distinct listings distinct from each other, or refuses them outright', () => {
    const seen = new Map()
    for (const name of [CANONICAL, ...DIFFERENT_LISTING]) {
      const slug = appSlug(name)
      if (slug === null) continue // refused: cannot be launched by URL, but cannot collide either
      expect(seen.has(slug), `"${name}" collides with "${seen.get(slug)}" on slug "${slug}"`).toBe(
        false,
      )
      seen.set(slug, name)
    }
  })

  it('refuses a slug for names it cannot represent, rather than lossily mangling them', () => {
    // Non-ASCII and punctuation have no URL form here, and the contract deliberately does NOT
    // case-fold Unicode — so any attempt to squeeze them into a slug would either be lossy (two
    // distinct listings collapsing onto one URL) or disagree with the chain about identity.
    // Refusing is the honest answer; CatalogPanel renders the explanation instead of a dead link.
    for (const name of ['Tokén Mint', 'Token Mint!', 'Token-Mint', '2Fast', '   ']) {
      expect(appSlug(name), `"${name}" has no faithful slug`).toBeNull()
    }
    // ...while ordinary ASCII names still get one.
    expect(appSlug('Token Mint')).toBe('token-mint')
  })
})

/*
 * Regenerating the ground truth (when the contract's folding changes — which is a breaking change):
 *   1. npx hardhat node
 *   2. deploy MiniAppRegistry, submitApp("Token Mint", …)
 *   3. for each candidate name call idByName(name); id === 1 means "same listing",
 *      id === 0 plus a successful submitApp staticCall means "different listing"
 *   4. update SAME_LISTING / DIFFERENT_LISTING above to match what the chain actually said
 * The contract side lives in contracts/apps/MiniAppRegistry.sol#_nameKey; the JS side in
 * frontend/src/lib/miniapps/registryClient.js. They must change together.
 */
