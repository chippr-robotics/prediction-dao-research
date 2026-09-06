import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

// ── WHAT THIS GUARDS (issue #1463) ──────────────────────────────────────────────────────────
// `readable: false` is the hook's honest "the reference chain would not answer". It was written,
// consumed by five surfaces, and UNREACHABLE on the failure it names: with every JSON-RPC call
// erroring — `eth_chainId` included — ethers retries network detection with backoff, so
// `getMembership` neither resolved nor rejected. Every consumer derives "checking your
// membership…" from a membership that is still `null`, so the member sat on a spinner for as long
// as the retries ran instead of getting the unreadable state and its Try again button.
//
// It surfaced as a 40%-intermittent E2E failure (`39-api-access [API-05]`, red on `staging`), but
// the flake was the symptom: whether the spinner cleared inside the test's window was a function
// of runner load, because nothing in the app bounded it at all.
//
// So these tests assert on the CEILING, not on a wall-clock outcome: a read that never settles
// must resolve to `readable: false` at the deadline and no later, and a read that DOES settle must
// be unaffected. A test that merely waited would be the same unbounded wait, one layer up.

const { web3, readProvider, contractFactory } = vi.hoisted(() => ({
  // Mordor (63): a real cohort chain, deliberately NOT the reference chain, so the hook takes the
  // `getReadProvider(refChain)` route this suite stubs. Pinning the wallet ON the reference chain
  // would hand it the wallet's provider instead and bypass everything below.
  web3: { chainId: 63, provider: { ok: true }, switchNetwork: () => {}, account: '0xabc', isConnected: true },
  readProvider: { ok: true },
  contractFactory: vi.fn(),
}))

vi.mock('../config/contracts', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getContractAddressForChain: () => '0x000000000000000000000000000000000000dEaD',
  }
})
vi.mock('../utils/rpcProvider', () => ({
  getReadProvider: () => readProvider,
  makeReadProvider: () => readProvider,
}))
vi.mock('../hooks/useWeb3', () => ({ useWeb3: () => web3 }))
vi.mock('../hooks/useEffectiveAccount', () => ({
  useEffectiveAccount: () => ({
    address: '0x0000000000000000000000000000000000000abc',
    isActingAccount: false,
    type: 'personal',
    label: null,
    connectedAddress: '0x0000000000000000000000000000000000000abc',
    chainId: null,
  }),
}))
vi.mock('ethers', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    ethers: {
      ...actual.ethers,
      Contract: function Contract(...args) {
        return contractFactory(...args)
      },
    },
  }
})

import {
  useRoleDetails,
  MEMBERSHIP_READ_TIMEOUT_MS,
  TIER_CONFIG_READ_TIMEOUT_MS,
} from '../hooks/useRoleDetails'

/** A membership tuple shaped like the contract's static return, as ethers would hand it back. */
const membership = ({ tier, expiresAt }) => ({
  tier: BigInt(tier),
  expiresAt: BigInt(expiresAt),
  monthCount: 0n,
  activeCount: 0n,
  monthAnchor: 0n,
})

const NEVER = () => new Promise(() => {})

async function settled(result) {
  await waitFor(() => expect(result.current.loading).toBe(false))
  return result.current.getRoleDetails('WAGER_PARTICIPANT')
}

describe('useRoleDetails — the membership read is deadline-bounded (issue #1463)', () => {
  beforeEach(() => {
    contractFactory.mockReset()
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('a read that never settles expires to readable:false — the state the surfaces already render', async () => {
    contractFactory.mockReturnValue({ getMembership: NEVER, getTierConfig: NEVER })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const { result } = renderHook(() => useRoleDetails())

    // Before the ceiling it is still genuinely pending — the hook must not invent an answer early,
    // because "unreadable" is a claim about the chain, not a way to stop waiting.
    await vi.advanceTimersByTimeAsync(MEMBERSHIP_READ_TIMEOUT_MS - 1000)
    expect(result.current.getRoleDetails('WAGER_PARTICIPANT')).toBeNull()

    await vi.advanceTimersByTimeAsync(2000)
    const details = await settled(result)

    expect(details).not.toBeNull()
    expect(details.readable).toBe(false)
    // Unreadable is never "no membership": tier 0 here is UNKNOWN, and the flags that would let a
    // consumer render a denial stay false alongside it.
    expect(details.tier).toBe(0)
    expect(details.isActive).toBe(false)
    expect(details.hasRole).toBe(false)
  })

  it('a read that answers is untouched by the ceiling', async () => {
    contractFactory.mockReturnValue({
      getMembership: async () => membership({ tier: 3, expiresAt: 4102444800 }),
      getTierConfig: async () => ({ limits: { monthlyMarketCreation: 10n, maxConcurrentMarkets: 5n } }),
    })

    const { result } = renderHook(() => useRoleDetails())
    const details = await settled(result)

    expect(details.readable).toBe(true)
    expect(details.tier).toBe(3)
    expect(details.isActive).toBe(true)
    expect(details.wagerLimit).toBe(10)
  })

  it('a hung TIER CONFIG degrades the limits, and never discards a membership already read', async () => {
    // The outer ceiling must not turn a successful membership read into "unreadable" because a
    // follow-up read stalled: the tier is a fact in hand by then, and telling a Gold member their
    // membership could not be read would be the same lie the unreadable state exists to prevent.
    contractFactory.mockReturnValue({
      getMembership: async () => membership({ tier: 3, expiresAt: 4102444800 }),
      getTierConfig: NEVER,
    })
    vi.spyOn(console, 'debug').mockImplementation(() => {})

    const { result } = renderHook(() => useRoleDetails())
    await vi.advanceTimersByTimeAsync(TIER_CONFIG_READ_TIMEOUT_MS + 1000)
    const details = await settled(result)

    expect(details.readable).toBe(true)
    expect(details.tier).toBe(3)
    expect(details.isActive).toBe(true)
    expect(details.wagerLimit).toBe(0)
    expect(details.concurrentLimit).toBe(0)
  })

  it('the tier-config ceiling is strictly inside the membership ceiling', () => {
    // Otherwise the sub-bound could never fire on its own, and the degrade path above would be
    // dead code that this file would still report as covered.
    expect(TIER_CONFIG_READ_TIMEOUT_MS).toBeLessThan(MEMBERSHIP_READ_TIMEOUT_MS)
  })
})
