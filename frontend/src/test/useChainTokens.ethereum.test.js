import { describe, it, expect, vi, beforeEach } from 'vitest'

// useChainTokens reads the active chain via wagmi's useChainId. Mock it to a plain value so we
// can exercise the pure config resolution for the Ethereum family (spec 048 US3, contract C9).
let mockChainId = 1
vi.mock('wagmi', () => ({ useChainId: () => mockChainId }))

import { useChainTokens } from '../hooks/useChainTokens'

describe('useChainTokens on the Ethereum family (spec 048 FR-009)', () => {
  beforeEach(() => {
    mockChainId = 1
  })

  it('offers native ETH and the configured USDC stable on Ethereum mainnet', () => {
    const t = useChainTokens()
    expect(t.chainId).toBe(1)
    expect(t.networkName).toBe('Ethereum')
    expect(t.native).toBe('ETH')
    expect(t.stable).toBe('USDC')
    expect(t.stableAddress).toMatch(/^0x[0-9a-fA-F]{40}$/)
  })

  it('offers Sepolia native ETH + faucet USDC', () => {
    mockChainId = 11155111
    const t = useChainTokens()
    expect(t.native).toBe('ETH')
    expect(t.isTestnet).toBe(true)
    expect(t.stableAddress).toMatch(/^0x[0-9a-fA-F]{40}$/)
  })

  it('keeps the picker usable native-only on Hoodi (no stablecoin → stable unavailable)', () => {
    mockChainId = 560048
    const t = useChainTokens()
    expect(t.native).toBe('ETH')
    expect(t.isTestnet).toBe(true)
    // No configured stablecoin → address is null so TransferForm defaults to native (FR-009 edge).
    expect(t.stableAddress).toBeNull()
  })

  it('exposes honest capabilities (no passkey on the Ethereum family; DEX on mainnet only)', () => {
    // mockChainId is 1 here. Spec 067 configures Uniswap V3 on Ethereum mainnet, so
    // `dex` is now true — superseding spec 048's no-in-app-swap cut. Passkey submission
    // is declared but unconfigured on this family (no bundler URL, no deployed account
    // factory), so it continues to self-disclose off.
    const t = useChainTokens()
    expect(t.capabilities.passkeyAccounts).toBe(false)
    expect(t.capabilities.dex).toBe(true)
  })

  it('keeps the DEX capability off on the Ethereum TESTNETS (no Uniswap configured)', () => {
    mockChainId = 11155111
    expect(useChainTokens().capabilities.dex).toBe(false)
    mockChainId = 560048
    expect(useChainTokens().capabilities.dex).toBe(false)
    mockChainId = 1
  })
})
