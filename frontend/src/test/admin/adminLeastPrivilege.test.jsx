/**
 * Spec 067 T133 (SC-011) — least privilege on the two new control surfaces.
 *
 * The success criterion is not "the tab is hidden": it is that an operator holding none of
 * admin / liquidity-admin / guardian can perform **no control action by any route**. There are
 * three routes to try, and this file closes all three:
 *
 *   1. the navigation — the group is not built for them;
 *   2. a hand-typed tab id — the AdminPanel gates the tab RENDER with the same predicate as the
 *      nav, so guessing the id renders nothing;
 *   3. the component itself — asked directly, the ROUTER says this account holds nothing, and
 *      neither tab exposes a single control. That is the belt-and-braces layer: a future refactor
 *      that loosens the panel gate still cannot hand out a write.
 *
 * ── WHY AUTHORITY IS DRIVEN THROUGH `hasRole` HERE AND NOT THROUGH PROPS ───────────────────────
 * These tests used to hand the tabs `isAdmin` / `isGuardian` / `isLiquidityAdmin` props and assert
 * on those. They passed while the real surface was wrong in three ways an adversarial review found:
 * `isGuardian` was read from the WagerRegistry (a different contract from the one being paused),
 * `isLiquidityAdmin` was a single OR across BOTH routers (so holding it on one unlocked the other),
 * and all of them were resolved on the WALLET's chain rather than the network in scope. A test that
 * asserts a prop cannot see any of that. So the tabs now ask the router in scope, and these tests
 * answer as that router — which means they fail if the question is ever asked of the wrong contract.
 *
 * It also pins the SEPARATION between the roles: configuring routes and pools is not a licence to
 * pause, pausing is not a licence to configure, changing a fund-path ADDRESS needs admin rather than
 * either, and none of them is a licence to change a fee — that lives on the FeeRouter, behind
 * FEE_ADMIN, in the Fees tab (FR-049).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ethers } from 'ethers'
import { buildAdminNavGroups, flattenNavGroups } from '../../components/admin/adminNav'
import adminPanelSource from '../../components/AdminPanel.jsx?raw'
import bridgeTabSource from '../../components/admin/BridgeTab.jsx?raw'
import supplyTabSource from '../../components/admin/SupplyTab.jsx?raw'

const m = vi.hoisted(() => ({ reads: {} }))

const BRIDGE_ROUTER = '0x1111111111111111111111111111111111111111'
const LIQUIDITY_ROUTER = '0x2222222222222222222222222222222222222222'

vi.mock('../../config/contracts', () => ({
  getContractAddressForChain: (name) => {
    if (name === 'bridgeRouter') return '0x1111111111111111111111111111111111111111'
    if (name === 'liquidityRouter') return '0x2222222222222222222222222222222222222222'
    return ''
  },
}))
vi.mock('../../config/blockExplorer', () => ({
  getBlockscoutUrl: () => '',
  getTransactionUrl: () => '',
}))
vi.mock('../../lib/fees/feeQuote', async (orig) => ({
  ...(await orig()),
  fetchFeeQuote: vi.fn(() => Promise.resolve({ available: false, bps: 0, capBps: 0 })),
}))
vi.mock('../../lib/liquidity/acrossLpPositions', () => ({ readPooledToken: vi.fn(() => Promise.resolve(null)) }))
vi.mock('../../hooks/useGatewayStatus', () => ({
  useGatewayStatus: () => ({ configured: false, loading: false, reachable: false, status: null, refresh: vi.fn() }),
}))
vi.mock('ethers', async (orig) => {
  const actual = await orig()
  // Records which ADDRESS each contract was constructed against, so a test can prove the authority
  // question was put to the router the tab manages and not to some other contract.
  function FakeContract(address) {
    m.constructedAt = [...(m.constructedAt || []), String(address)]
    return new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === 'then') return undefined
          if (prop === 'filters') return new Proxy({}, { get: (_f, name) => () => ({ __event: String(name) }) })
          const key = String(prop)
          return (...args) => (m.reads[key] ? m.reads[key](address, ...args) : Promise.resolve(undefined))
        },
      },
    )
  }
  const FakeCtor = vi.fn(FakeContract)
  return { ...actual, Contract: FakeCtor, ethers: { ...actual.ethers, Contract: FakeCtor } }
})

import BridgeTab from '../../components/admin/BridgeTab'
import SupplyTab from '../../components/admin/SupplyTab'

const NO_ROLES = {
  isAdmin: false,
  isGuardian: false,
  isAccountModerator: false,
  isRoleManager: false,
  isSanctionsAdmin: false,
  isFeeAdmin: false,
  isStakingAdmin: false,
  isLiquidityAdmin: false,
}

const ACCOUNT = '0x9999999999999999999999999999999999999999'
const ROLE = {
  admin: ethers.ZeroHash,
  guardian: ethers.id('GUARDIAN_ROLE'),
  liquidityAdmin: ethers.id('LIQUIDITY_ADMIN_ROLE'),
}

const providerStub = {
  getBlockNumber: () => Promise.resolve(1000),
  getBlock: () => Promise.resolve({ timestamp: 0 }),
  getTransactionReceipt: () => Promise.resolve(null),
}

function tabProps(overrides = {}) {
  return {
    signer: {},
    account: ACCOUNT,
    chainId: 1,
    provider: providerStub,
    runTx: vi.fn(() => Promise.resolve(true)),
    pendingTx: false,
    ...overrides,
  }
}

/**
 * Answer `hasRole` as the routers would.
 *
 * `grants` is keyed by ROUTER ADDRESS, so a test can grant a role on one router and prove it does
 * not carry to the other — the asymmetric grant the Roles tab deliberately provisions.
 */
function grantOnChain(grants) {
  m.reads.hasRole = (address, role) => {
    const held = grants[String(address).toLowerCase()] || []
    return Promise.resolve(held.some((r) => r === role))
  }
}

beforeEach(() => {
  m.constructedAt = []
  m.reads = {
    paused: () => Promise.resolve(false),
    routeCount: () => Promise.resolve(0n),
    poolCount: () => Promise.resolve(0n),
    MAX_FEE_BPS: () => Promise.resolve(250n),
    feeRouter: () => Promise.resolve('0x3333333333333333333333333333333333333333'),
    queryFilter: () => Promise.resolve([]),
  }
  grantOnChain({})
})

describe('SC-011 route 1 — the navigation never offers the tabs', () => {
  it('an operator holding every OTHER admin role reaches neither', () => {
    const flat = flattenNavGroups(
      buildAdminNavGroups({
        ...NO_ROLES,
        isAccountModerator: true,
        isRoleManager: true,
        isSanctionsAdmin: true,
        isFeeAdmin: true,
        isStakingAdmin: true,
      }),
    ).map((i) => i.id)
    expect(flat).not.toContain('bridge')
    expect(flat).not.toContain('supply')
  })
})

describe('SC-011 route 2 — a hand-typed tab id renders nothing', () => {
  it('the AdminPanel gates both tab renders on the same predicate as the nav', () => {
    // Guessing `?tab=bridge` must not be a way in: the render is gated, not just the menu.
    expect(adminPanelSource).toMatch(
      /activeTab === 'bridge' && \(isAdmin \|\| isLiquidityAdmin \|\| isGuardian\)/,
    )
    expect(adminPanelSource).toMatch(
      /activeTab === 'supply' && \(isAdmin \|\| isLiquidityAdmin \|\| isGuardian\)/,
    )
  })
})

describe('SC-011 route 3 — the components themselves hand out nothing', () => {
  it('BridgeTab renders no control when the router says this account holds nothing', async () => {
    render(<BridgeTab {...tabProps()} />)
    await screen.findByRole('heading', { name: 'Routes' })
    for (const name of [/^Pause/i, /^Resume/i, /Save route/i, /Disable/i, /Enable/i, /Remove/i, /Set limit/i, /Set SpokePool/i, /Set FeeRouter/i, /Set guard/i]) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    }
    // Read-only surfaces stay: seeing the control state is not a privilege to change it.
    expect(screen.getByText('Platform fee')).toBeInTheDocument()
    expect(screen.getByText('Operations')).toBeInTheDocument()
  })

  it('SupplyTab renders no control when the router says this account holds nothing', async () => {
    render(<SupplyTab {...tabProps()} />)
    await screen.findByRole('heading', { name: 'Curated pools' })
    for (const name of [/^Pause/i, /^Resume/i, /Save pool listing/i, /Retire/i, /Reopen/i, /Set caps/i, /Check pool/i, /Set position manager/i, /Set FeeRouter/i, /Set guard/i]) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    }
    expect(screen.getByText('Platform fee')).toBeInTheDocument()
  })

  it('asks the ROUTER IT MANAGES, not some other contract', async () => {
    render(<BridgeTab {...tabProps()} />)
    await screen.findByRole('heading', { name: 'Routes' })
    // The authority read is constructed against the bridge router for this network. If it were ever
    // resolved from the WagerRegistry (the bug this replaced) or from the liquidity router, the
    // address recorded here would not be the bridge router's.
    expect(m.constructedAt).toContain(BRIDGE_ROUTER)
    expect(m.constructedAt).not.toContain(LIQUIDITY_ROUTER)
  })
})

describe('a role on ONE router is not a role on the other', () => {
  it('LIQUIDITY_ADMIN on the liquidity router unlocks no bridge control', async () => {
    grantOnChain({ [LIQUIDITY_ROUTER.toLowerCase()]: [ROLE.liquidityAdmin] })
    render(<BridgeTab {...tabProps()} />)
    await screen.findByRole('heading', { name: 'Routes' })
    // The grant is real, just not here. Offering bridge controls on the strength of it produced
    // AccessControlUnauthorizedAccount reverts after the operator believed a route was closed.
    expect(screen.queryByRole('button', { name: /Save route/i })).not.toBeInTheDocument()
    expect(screen.queryByText('Protocol addresses')).not.toBeInTheDocument()
  })

  it('LIQUIDITY_ADMIN on the bridge router unlocks no pool control', async () => {
    grantOnChain({ [BRIDGE_ROUTER.toLowerCase()]: [ROLE.liquidityAdmin] })
    render(<SupplyTab {...tabProps()} />)
    await screen.findByRole('heading', { name: 'Curated pools' })
    expect(screen.queryByRole('button', { name: /Save pool listing/i })).not.toBeInTheDocument()
    expect(screen.queryByText('Protocol addresses')).not.toBeInTheDocument()
  })
})

describe('the roles stay separate (FR-049)', () => {
  it('configuring is not pausing, and pausing is not configuring', async () => {
    grantOnChain({ [BRIDGE_ROUTER.toLowerCase()]: [ROLE.liquidityAdmin] })
    const { unmount } = render(<BridgeTab {...tabProps()} />)
    await screen.findByRole('button', { name: /Save route/i })
    expect(screen.queryByRole('button', { name: /^Pause new bridges/i })).not.toBeInTheDocument()
    unmount()

    grantOnChain({ [BRIDGE_ROUTER.toLowerCase()]: [ROLE.guardian] })
    render(<BridgeTab {...tabProps()} />)
    await screen.findByRole('button', { name: /^Pause new bridges/i })
    expect(screen.queryByRole('button', { name: /Save route/i })).not.toBeInTheDocument()
  })

  it('curating routes does not carry the power to redirect member funds', async () => {
    // `setSpokePool` / `setFeeRouter` decide where a member's money goes; the contract puts them at
    // DEFAULT_ADMIN_ROLE for that reason, and the tab must not offer what the contract refuses.
    grantOnChain({ [BRIDGE_ROUTER.toLowerCase()]: [ROLE.liquidityAdmin] })
    const { unmount } = render(<BridgeTab {...tabProps()} />)
    await screen.findByRole('button', { name: /Save route/i })
    expect(screen.queryByText('Protocol addresses')).not.toBeInTheDocument()
    unmount()

    grantOnChain({ [BRIDGE_ROUTER.toLowerCase()]: [ROLE.admin] })
    render(<BridgeTab {...tabProps()} />)
    await screen.findByText('Protocol addresses')
  })

  it('curating pools does not carry the power to repoint the position manager', async () => {
    grantOnChain({ [LIQUIDITY_ROUTER.toLowerCase()]: [ROLE.liquidityAdmin] })
    const { unmount } = render(<SupplyTab {...tabProps()} />)
    await screen.findByRole('button', { name: /Save pool listing/i })
    expect(screen.queryByText('Protocol addresses')).not.toBeInTheDocument()
    unmount()

    grantOnChain({ [LIQUIDITY_ROUTER.toLowerCase()]: [ROLE.admin] })
    render(<SupplyTab {...tabProps()} />)
    await screen.findByText('Protocol addresses')
  })

  it('neither tab can change a fee rate — there is no rate setter in either', () => {
    // The fee is quoted and displayed; the only mutation path is the Fees tab (spec 060).
    for (const source of [bridgeTabSource, supplyTabSource]) {
      expect(source).not.toMatch(/setFeeBps|setServiceFee|setRate\(/)
      expect(source).toMatch(/fetchFeeQuote/)
    }
  })
})

describe('an unreadable authority is not a denial (FR-044)', () => {
  it('offers the killswitch, and says the authority is unconfirmed, when hasRole cannot be read', async () => {
    m.reads.hasRole = () => Promise.reject(new Error('missing revert data'))
    render(<BridgeTab {...tabProps()} />)
    // The contract is the real gate. Withdrawing the pause because an RPC would not answer tells an
    // operator who DOES hold it that the network has no killswitch — the worse of the two errors.
    await screen.findByRole('button', { name: /^Pause new bridges/i })
    expect(screen.getByText(/could not be confirmed/i)).toBeInTheDocument()
  })
})
