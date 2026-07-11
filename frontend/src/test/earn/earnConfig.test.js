/**
 * Earn config gating tests (spec 050, FR-001/FR-008) — the earn capability is
 * on exactly for chains with a real Morpho deployment + data API (1, 137),
 * helpers resolve strictly per-chain, deep links build correctly, and the nav
 * item lives in the Finance group with its own icon.
 */
import { describe, it, expect } from 'vitest'
import {
  NETWORKS,
  isEarnAvailable,
  getEarnConfig,
  getEarnNetworks,
  listSupportedChainIds,
} from '../../config/networks'
import { earnPath } from '../../config/earn'
import { NAV_GROUPS } from '../../config/appNav'

const EARN_CHAINS = [1, 137]

describe('earn network capability (spec 050)', () => {
  it('is available exactly on Ethereum mainnet and Polygon', () => {
    for (const chainId of listSupportedChainIds()) {
      expect(isEarnAvailable(chainId), `chain ${chainId}`).toBe(EARN_CHAINS.includes(chainId))
      expect(NETWORKS[chainId].capabilities.earn, `capabilities ${chainId}`).toBe(
        EARN_CHAINS.includes(chainId),
      )
    }
  })

  it('never falls back across chains for unknown ids', () => {
    expect(isEarnAvailable(999999)).toBe(false)
    expect(isEarnAvailable(null)).toBe(false)
    expect(getEarnConfig(999999)).toBeNull()
  })

  it('provides provider identity, distributor, and legacy link where enabled', () => {
    for (const chainId of EARN_CHAINS) {
      const config = getEarnConfig(chainId)
      expect(config.provider.name).toBe('Morpho')
      expect(config.merklDistributor).toMatch(/^0x[0-9a-fA-F]{40}$/)
      expect(config.legacyRewardsUrl).toContain('rewards-legacy.morpho.org')
    }
  })

  it('lists the earn-enabled networks for honest unavailable copy', () => {
    const names = getEarnNetworks().map((n) => n.name)
    expect(names).toContain('Ethereum')
    expect(names).toContain('Polygon')
    expect(names).toHaveLength(EARN_CHAINS.length)
  })
})

describe('earnPath deep links', () => {
  it('builds the bare earn tab path', () => {
    expect(earnPath()).toBe('/wallet?tab=earn')
  })

  it('builds view/chain/token deep links (portfolio Earn action shape)', () => {
    expect(earnPath({ view: 'lend', chainId: 137, tokenSymbol: 'USDC' })).toBe(
      '/wallet?tab=earn&view=lend&chain=137&token=USDC',
    )
  })
})

describe('earn navigation entry (FR-001)', () => {
  it('appears in the Finance group with a unique icon', () => {
    const finance = NAV_GROUPS.find((g) => g.label === 'Finance')
    const earnItem = finance.items.find((i) => i.id === 'earn')
    expect(earnItem).toMatchObject({ label: 'Earn', icon: 'sprout' })
    // Unique icon: no other nav item shares it.
    const allItems = NAV_GROUPS.flatMap((g) => g.items)
    expect(allItems.filter((i) => i.icon === 'sprout')).toHaveLength(1)
  })
})
