/**
 * Spec 033 — the swap allow-list, and the fence around its full-E2E seam (issue #1240).
 *
 * `capabilities.dex` gates the Trade surface, the portfolio asset sheet's Swap action, and DEX
 * spot pricing. `SWAP_CHAIN_IDS` is an EXPLICIT allow-list rather than `Boolean(dex)` precisely so
 * that adding DEX addresses for some other reason cannot switch swapping on as a side effect —
 * which is how Ethereum once ended up swap-less by accident of configuration.
 *
 * Issue #1240 adds ONE entry to that list, and it is the kind of entry that has to be fenced: the
 * on-chain e2e tier impersonates Polygon Amoy on a local node, and admission rule 2 of the e2e
 * policy says a flow where a member signs something that costs them money must have on-chain
 * coverage. A member swapping is spending. So 80002 joins the set — but only inside
 * `import.meta.env.DEV && VITE_E2E_AMOY_LOCAL === '1'`, read into a module-level const at import,
 * which makes the branch dead code in any production bundle.
 *
 * What this file guards is the thing that would be silent if it broke: **real Polygon Amoy must
 * stay swap-less.** A member on the public testnet being offered a Trade surface backed by
 * addresses that do not exist there would see quotes fail, or worse, succeed against something
 * nobody vetted.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { NETWORKS, TESTNET_CHAIN_ID, MAINNET_CHAIN_ID } from '../config/networks'

afterEach(() => vi.unstubAllEnvs())

/** The chains that ship with swapping, spelled out so a change to the source constant fails here. */
const SHIPPED_SWAP_CHAINS = [1, 10, 61, 63, 137, 8453, 42161]

describe('swap capability (spec 033)', () => {
  it('is off on Polygon Amoy in this build — the flag is unset here', () => {
    expect(TESTNET_CHAIN_ID).toBe(80002)
    expect(NETWORKS[TESTNET_CHAIN_ID].capabilities.dex).toBe(false)
  })

  it('is off wherever the network supplies no dex config, allow-list or not', () => {
    // Membership of the allow-list is a POLICY gate, never a claim the network is ready: ETC,
    // Mordor and Amoy all build their `dex` block from env vars and yield null when unset.
    for (const chainId of SHIPPED_SWAP_CHAINS) {
      const net = NETWORKS[chainId]
      if (!net) continue
      expect(net.capabilities.dex).toBe(Boolean(net.dex))
    }
  })

  it('is off on every chain outside the allow-list, even one carrying dex addresses', () => {
    // Spec 067 populates `dex.positionManager` on chains it supplies liquidity to. That must not
    // switch swapping on, which is the whole reason the allow-list is explicit.
    for (const [id, net] of Object.entries(NETWORKS)) {
      if (SHIPPED_SWAP_CHAINS.includes(Number(id))) continue
      expect(net.capabilities.dex, `chain ${id}`).toBe(false)
    }
  })
})

describe('the full-E2E swap seam is compile-time, and fenced', () => {
  /*
   * Reset the module registry: the flag is read into a module-level const at import, so stubbing
   * it against an already-loaded module does nothing — which is exactly the property that makes
   * the override unreachable from a tampered runtime preference.
   */
  it('adds Amoy to the allow-list ONLY when the flag is set at load, and only with dex config', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_E2E_AMOY_LOCAL', '1')
    const reloaded = await import('../config/networks')

    // The allow-list now admits it — but the capability still requires real addresses, which this
    // test process does not supply. Absence of config is still absence of capability.
    expect(reloaded.NETWORKS[80002].dex).toBeFalsy()
    expect(reloaded.NETWORKS[80002].capabilities.dex).toBe(false)
  })

  it('leaves real Polygon Amoy swap-less with the flag unset', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_E2E_AMOY_LOCAL', '')
    const reloaded = await import('../config/networks')
    expect(reloaded.NETWORKS[80002].capabilities.dex).toBe(false)
  })

  it('never changes a shipped chain either way', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_E2E_AMOY_LOCAL', '1')
    const withFlag = await import('../config/networks')
    const flagged = Object.fromEntries(
      Object.entries(withFlag.NETWORKS).map(([id, n]) => [id, n.capabilities.dex]),
    )

    vi.resetModules()
    vi.stubEnv('VITE_E2E_AMOY_LOCAL', '')
    const without = await import('../config/networks')

    for (const [id, net] of Object.entries(without.NETWORKS)) {
      if (Number(id) === 80002) continue
      expect(flagged[id], `chain ${id}`).toBe(net.capabilities.dex)
    }
    expect(MAINNET_CHAIN_ID).toBe(137)
  })
})
