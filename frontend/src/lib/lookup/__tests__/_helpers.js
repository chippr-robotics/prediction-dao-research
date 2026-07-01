/**
 * Shared test fixtures/mocks for the unified lookup resolver (spec 037, tasks T002).
 */
import { vi } from 'vitest'

/** A valid four-word English BIP-39 claim code (challenge-eligible). */
export const VALID_EN_CODE = 'abandon ability able about'

/** A four-token phrase whose words are NOT in the BIP-39 English list (pool-only / non-English). */
export const NON_EN_PHRASE = 'zzza zzzb zzzc zzzd'

export function makeChallengePayload(overrides = {}) {
  return {
    wagerId: 1n,
    wager: { creator: '0xCreator0000000000000000000000000000000001', status: 0, ...overrides.wager },
    terms: { description: 'It rains in Denver tomorrow' },
    termsUnavailable: false,
    needsMembership: false,
    ...overrides,
  }
}

export function makePoolSummary(overrides = {}) {
  return {
    address: '0xPool0000000000000000000000000000000000aa',
    poolId: 7,
    state: 0, // JoiningOpen
    stateLabel: 'Joining open',
    buyIn: 10n,
    buyInFormatted: '10',
    tokenSymbol: 'USDC',
    memberCount: 2,
    maxMembers: 10,
    slotsRemaining: 8,
    thresholdBips: 6000,
    thresholdPct: 60,
    joinDeadline: 0,
    isCreator: false,
    hasJoined: false,
    refundEligible: false,
    ...overrides,
  }
}

/** Build resolver deps from simple outcome descriptions. */
export function makeDeps({ challenge = { status: 'not-found' }, pool = { notFound: true, reason: 'unknown' } } = {}) {
  const lookupChallenge = vi.fn(async () =>
    typeof challenge === 'function' ? challenge() : challenge
  )
  const resolvePool = vi.fn(async () => {
    if (typeof pool === 'function') return pool()
    if (pool instanceof Error) throw pool
    return pool
  })
  return { lookupChallenge, resolvePool }
}
