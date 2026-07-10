import { describe, it, expect } from 'vitest'
import { getNetwork, getSelectableNetworks } from '../config/networks'

// Spec 048 FR-003a (contract C11) — a passkey (smart-account) member with no linked external
// wallet may SELECT an Ethereum network for view-only use (portfolio + receive). Passkey
// submission is not enabled on the Ethereum family, so `passkeyAccounts` is false and the send
// surface self-discloses "connected wallet required" rather than presenting a dead action.
// Selection is NOT hidden or blocked for passkey-only members.

const ETH_FAMILY = [1, 11155111, 560048]

describe('passkey-only view-only selection on the Ethereum family (spec 048 FR-003a)', () => {
  it('keeps passkey submission off across the Ethereum family (send self-discloses wallet-required)', () => {
    for (const id of ETH_FAMILY) {
      expect(getNetwork(id).capabilities.passkeyAccounts).toBe(false)
    }
  })

  it('still offers the Ethereum family in the network switcher (selection not blocked for passkey-only)', () => {
    const ids = getSelectableNetworks().map((n) => n.chainId)
    for (const id of ETH_FAMILY) {
      expect(ids).toContain(id)
    }
  })

  it('does not gate view-only surfaces on passkey capability (portfolio/receive read from config, not passkeyAccounts)', () => {
    // A view-only member still resolves native + stablecoin token metadata for display; nothing
    // about that depends on passkeyAccounts. Mainnet carries native ETH + a stablecoin.
    const net = getNetwork(1)
    expect(net.nativeCurrency.symbol).toBe('ETH')
    expect(net.stablecoin?.symbol).toBe('USDC')
  })
})
