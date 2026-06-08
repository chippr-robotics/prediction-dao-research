// Reusable mocks for chain-aware tests (spec 008 — runtime chain consistency).
// See frontend-test-gotchas: hook mocks must return identity-stable values, so
// build these ONCE per test (e.g. inside vi.hoisted) and reuse the instance.
import { vi } from 'vitest'

const DEFAULT_ADDR = '0x0000000000000000000000000000000000000001'

/**
 * Minimal signer/provider stub whose provider reports `chainId` (via getNetwork)
 * and returns `code` from getCode. For service-level chain-aware tests that only
 * exercise the resolution/guard paths (no real contract calls).
 */
export function makeSigner({ chainId = 137, code = '0x', address = DEFAULT_ADDR } = {}) {
  return {
    getAddress: async () => address,
    provider: {
      getNetwork: async () => ({ chainId: BigInt(chainId) }),
      getCode: async () => code,
    },
  }
}

/**
 * Stable `useWeb3()` return for renderHook tests. Create once and reuse the same
 * object reference across renders to avoid dependency churn / infinite re-render.
 */
export function makeWeb3({ chainId = 137, provider = {}, switchNetwork = vi.fn(), account = DEFAULT_ADDR, isConnected = true } = {}) {
  return { chainId, provider, switchNetwork, account, isConnected }
}
